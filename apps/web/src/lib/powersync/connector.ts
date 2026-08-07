/**
 * Міст між PowerSync і Supabase (MER-46).
 *
 * Дві половини одного з'єднання:
 *  - `fetchCredentials` віддає сервісу JWT від GoTrue. Той самий токен, той
 *    самий claim `family_id` — тож sync-правила бачать сім'ю рівно так, як її
 *    бачить RLS (MER-45);
 *  - `uploadData` відправляє локальні зміни назад у Postgres через PostgREST.
 *
 * **Записи йдуть через PostgREST, а не «в PowerSync».** Сервіс синхронізації
 * односторонній: він читає базу через логічну реплікацію й роздає читання. Усе
 * записане на пристрої повертається в базу звичайним запитом, проходить RLS і
 * приїжджає назад уже як синхронізовані дані.
 *
 * **Звідси й last-write-wins.** Конкурентні зміни — це два звичайні UPDATE:
 * перемагає той, що прийшов на сервер останнім, `updated_at` йому ставить
 * тригер бази. Для `plan_slot` рядок — це один слот дня, тобто рівень, на
 * якому LWW і обіцяно. Жодних CRDT тут немає й не має бути.
 *
 * Форма файлу взята з офіційного прикладу PowerSync для Supabase
 * (`powersync-ja/powersync-js`, demos/react-supabase-todolist) — включно з
 * переліком нефатальних кодів помилок.
 */

import { UpdateType } from '@powersync/web'
import type {
  CommonPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/web'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { BOOLEAN_COLUMNS, JSON_COLUMNS } from './schema'

/**
 * Коди Postgres, після яких повторювати марно (з офіційного прикладу):
 * клас 22 — некоректні дані, клас 23 — порушення обмежень, 42501 — RLS.
 * Усе інше (мережа, 5xx, таймаут) вважаємо тимчасовим і повторюємо.
 */
const FATAL_RESPONSE_CODES = [/^22...$/, /^23...$/, /^42501$/]

/**
 * Колонки, які пише сервер, а не пристрій.
 *
 * `created_at` має DEFAULT now(), `updated_at` — ще й тригер `touch_updated_at`
 * на кожен UPDATE. Якщо надсилати їх із пристрою, порядок LWW почав би залежати
 * від годинника телефона — а він буває яким завгодно. Тому просто не
 * надсилаємо: сервер знає краще.
 */
const SERVER_OWNED_COLUMNS = ['created_at', 'updated_at']

/**
 * Рядок SQLite → JSON для `jsonb`-колонки.
 *
 * Якщо текст не розбирається, віддаємо його як є: сервер відповість своїм
 * CHECK-обмеженням, і в логу буде видно справжню причину. Тихо підставити
 * порожній масив означало б втратити дані користувача й ще й приховати це.
 */
function asJson(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/** 0/1 із SQLite → `boolean`, якого чекає Postgres. */
function asBoolean(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === '1' || value === 'true'
  return value
}

/**
 * Локальний рядок → тіло запиту PostgREST.
 *
 * Крім службових колонок сервера, тут відбувається зворотне перетворення типів
 * (MER-49): у SQLite їх три, тож `jsonb` приїхав рядком, а `boolean` — числом,
 * і без цього кроку сервер відкидає запис на CHECK-обмеженні. Перелік колонок —
 * у `schema.ts`, поруч зі схемою, яку він описує.
 */
function forServer(
  table: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const jsonColumns = JSON_COLUMNS[table] ?? []
  const booleanColumns = BOOLEAN_COLUMNS[table] ?? []
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SERVER_OWNED_COLUMNS.includes(key)) continue
    if (jsonColumns.includes(key)) out[key] = asJson(value)
    else if (booleanColumns.includes(key)) out[key] = asBoolean(value)
    else out[key] = value
  }
  return out
}

function isFatal(error: unknown): boolean {
  const code = (error as PostgrestError | null)?.code
  return (
    typeof code === 'string' && FATAL_RESPONSE_CODES.some((r) => r.test(code))
  )
}

/**
 * Застосувати одну локальну зміну до Postgres.
 *
 * Винесено окремо, щоб те саме перетворення можна було перевірити без браузера
 * й без PowerSync — на живому стеку достатньо клієнта Supabase.
 */
export async function applyCrudEntry(
  supabase: SupabaseClient,
  entry: CrudEntry,
): Promise<{ error: PostgrestError | null }> {
  const table = supabase.from(entry.table)
  const data = forServer(entry.table, entry.opData ?? {})

  switch (entry.op) {
    case UpdateType.PUT:
      return await table.upsert({ ...data, id: entry.id })
    case UpdateType.PATCH:
      return await table.update(data).eq('id', entry.id)
    case UpdateType.DELETE:
      // Фізичного DELETE у схемі немає — на нього немає прав ні в кого
      // (MER-44), бо sync-рушій не вміє довозити те, чого в базі вже нема.
      // Локальний DELETE тому перекладається в м'яке видалення: рядок
      // перестає збігатися з `deleted_at IS NULL` у правилах — і зникає з усіх
      // пристроїв так само, як зник би фізично видалений.
      return await table
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', entry.id)
  }
}

export function createConnector(
  supabase: SupabaseClient,
  endpoint: string,
): PowerSyncBackendConnector {
  return {
    async fetchCredentials(): Promise<PowerSyncCredentials | null> {
      // `getSession` сам оновить токен, якщо той протух, — саме тому тут він, а
      // не збережена копія сесії.
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      // Не увійшли — це не помилка, а стан. Інтерфейс тоді просто не
      // під'єднується (див. provider.tsx).
      if (!data.session) return null

      return {
        endpoint,
        token: data.session.access_token,
        // Секунди epoch від GoTrue. Знаючи час протухання, клієнт попросить
        // новий токен заздалегідь, а не після розриву з'єднання.
        expiresAt: data.session.expires_at
          ? new Date(data.session.expires_at * 1000)
          : undefined,
      }
    },

    async uploadData(database: CommonPowerSyncDatabase): Promise<void> {
      const transaction = await database.getNextCrudTransaction()
      if (!transaction) return

      let lastEntry: CrudEntry | null = null
      try {
        for (const entry of transaction.crud) {
          lastEntry = entry
          const { error } = await applyCrudEntry(supabase, entry)
          if (error) throw error
        }
        await transaction.complete()
      } catch (error) {
        if (!isFatal(error)) {
          // Мережі немає або сервер тимчасово недоступний — черга лишається на
          // місці, PowerSync повторить сам. Це і є «офлайн-запис доганяється
          // при появі мережі»: нічого спеціального робити не треба.
          throw error
        }
        // Далі повторювати нема сенсу: цей запис не пройде ніколи. Черга з ним
        // заблокувалася б назавжди, тож транзакцію відкидаємо — так само, як в
        // офіційному прикладі. Гучний лог тут обов'язковий: це втрата зміни.
        //
        // Найімовірніша причина — не «конфлікт LWW», а колізія створення:
        // частковий унікальний індекс `plan_slot (profile_id, date, slot)` не
        // пустить ДРУГУ вставку того самого слота з іншого пристрою. LWW
        // розсуджує зміни наявного рядка, а не дві незалежні спроби створити
        // його; що робити з двома тижнями, згенерованими офлайн, вирішують
        // MER-47 і MER-49.
        console.error(
          '[meridian] зміну не прийнято сервером, відкидаємо:',
          lastEntry,
          error,
        )
        await transaction.complete()
      }
    },
  }
}
