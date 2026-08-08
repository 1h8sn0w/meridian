/**
 * Локальний SQLite і його з'єднання з сервісом (MER-46).
 *
 * Джерело істини для інтерфейсу — саме ця база на пристрої: читання й записи
 * не чекають мережі ніколи. PowerSync фоном тримає її в збіжності з Postgres.
 *
 * Модуль **лише браузерний**. `@powersync/web` тягне WASM і web-workers, тож
 * імпортувати його на сервері не можна — звідси й динамічний імпорт у
 * `provider.tsx`, і перевірка нижче.
 */

import { PowerSyncDatabase } from '@powersync/web'
import type { PowerSyncBackendConnector } from '@powersync/web'
import { AppSchema } from './schema'

/**
 * Ім'я файлу бази у сховищі браузера. Версія в імені — щоб несумісна зміна
 * схеми колись відкрила нову базу, а не намагалася лагодити стару.
 */
const DB_FILENAME = 'meridian.v2.db'

/**
 * Чию сім'ю тримає локальна база. Ключ живе поруч із ключем сесії
 * (`meridian.auth.v2`) і потрібен рівно для одного: помітити, що на цьому
 * пристрої тепер інша сім'я, і стерти чужі дані перед першою синхронізацією.
 */
const FAMILY_KEY = 'meridian.sync.family.v2'

let database: PowerSyncDatabase | null = null

/**
 * Черга операцій із базою (MER-49).
 *
 * `disconnectAndClear`, `connect` і `disconnect` беруть внутрішні блокування, і
 * запущені паралельно вони заплітаються: база лишається відкритою, але
 * незʼєднаною, а інтерфейс — у стані «готуємо локальну базу…» назавжди. Саме це
 * й ловилось, коли `refreshSession()` після створення сім'ї на мить віддавав
 * порожню сесію: ефект встигав прибрати за собою рівно тоді, коли наступний
 * запуск уже відкривав базу.
 *
 * Тому всі операції шикуються в один ланцюжок: остання виграє, і виграє
 * передбачувано. Помилка однієї не рве чергу — інакше одна невдала спроба
 * зʼєднатися заблокувала б застосунок до перезавантаження.
 */
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work)
  queue = next.catch(() => undefined)
  return next
}

/**
 * База одна на вкладку. PowerSync сам ділить її між вкладками через
 * SharedWorker, тож другий екземпляр на той самий файл — це дві незалежні
 * спроби писати в одне сховище.
 */
export function getPowerSync(): PowerSyncDatabase {
  if (typeof window === 'undefined') {
    throw new Error('Локальний SQLite доступний лише у браузері')
  }
  if (!database) {
    database = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: DB_FILENAME },
    })
    exposeForDev(database)
  }
  return database
}

/**
 * Ручка для перевірок у розробці — рівно як `window.Meridian` у V1.
 *
 * Екрани (MER-49) читають ту саму базу, але писати в неї запитом із консолі
 * лишається найкоротшим способом перевірити, що зміна доїхала до сервера й на
 * інший пристрій. У продакшн-збірці гілка вирізається цілком:
 * `import.meta.env.DEV` — константа етапу збірки.
 */
function exposeForDev(db: PowerSyncDatabase): void {
  if (!import.meta.env.DEV) return
  const scope = window as typeof window & { Meridian?: Record<string, unknown> }
  scope.Meridian = { ...scope.Meridian, sync: db }
}

/**
 * Відкрити базу пристрою для вказаної сім'ї — без мережі й без сервісу.
 *
 * Відкриття відокремлене від з'єднання навмисно (MER-49): джерело істини для
 * інтерфейсу — саме локальний SQLite, тож екрани мусять працювати й тоді, коли
 * адреси PowerSync немає взагалі. Тоді застосунок повноцінний, просто лишається
 * на одному пристрої — і панель синхронізації каже це прямо.
 *
 * Якщо база тримає дані іншої сім'ї — спершу стираємо. Це той випадок, коли на
 * пристрої змінився акаунт: у токені один `family_id`, і показати старі дані
 * новому власнику пристрою було б не «застарілим станом», а чужими даними.
 */
export function openPowerSync(familyId: string): Promise<PowerSyncDatabase> {
  return enqueue(async () => {
    const db = getPowerSync()

    if (window.localStorage.getItem(FAMILY_KEY) !== familyId) {
      // Разом із даними зникає й черга вивантаження — але вона тут і не могла б
      // належати новій сім'ї.
      await db.disconnectAndClear()
      window.localStorage.setItem(FAMILY_KEY, familyId)
    }

    return db
  })
}

/**
 * Під'єднати відкриту базу до сервісу синхронізації.
 *
 * Підписуватися на стріми окремо не треба: `family_data` оголошений із
 * `auto_subscribe: true`, тож дані їдуть відразу після з'єднання.
 */
export function connectPowerSync(
  connector: PowerSyncBackendConnector,
): Promise<void> {
  return enqueue(() => getPowerSync().connect(connector))
}

/**
 * Від'єднатися, лишивши дані на місці.
 *
 * Саме так виглядає вихід із застосунку: локальна база переживає його, і той
 * самий користувач після входу бачить свої дані відразу, ще до першої
 * синхронізації, — а невідправлені зміни лишаються в черзі й доїжджають.
 * Стирає базу лише зміна сім'ї (див. `openPowerSync`).
 */
export function disconnectPowerSync(): Promise<void> {
  return enqueue(async () => {
    if (!database) return
    await database.disconnect()
  })
}
