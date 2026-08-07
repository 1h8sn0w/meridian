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
 * Доки екранів на нових даних немає (MER-49), це єдиний спосіб написати щось у
 * локальну базу й побачити, що зміна доїхала до сервера й на інший пристрій.
 * У продакшн-збірці гілка вирізається цілком: `import.meta.env.DEV` — константа
 * етапу збірки.
 */
function exposeForDev(db: PowerSyncDatabase): void {
  if (!import.meta.env.DEV) return
  const scope = window as typeof window & { Meridian?: Record<string, unknown> }
  scope.Meridian = { ...scope.Meridian, sync: db }
}

/**
 * Під'єднатися до сервісу для вказаної сім'ї.
 *
 * Якщо база тримає дані іншої сім'ї — спершу стираємо. Це той випадок, коли на
 * пристрої змінився акаунт: у токені один `family_id`, і показати старі дані
 * новому власнику пристрою було б не «застарілим станом», а чужими даними.
 *
 * Підписуватися на стріми окремо не треба: `family_data` оголошений із
 * `auto_subscribe: true`, тож дані їдуть відразу після з'єднання.
 */
export async function connectPowerSync(
  connector: PowerSyncBackendConnector,
  familyId: string,
): Promise<PowerSyncDatabase> {
  const db = getPowerSync()

  if (window.localStorage.getItem(FAMILY_KEY) !== familyId) {
    // Разом із даними зникає й черга вивантаження — але вона тут і не могла б
    // належати новій сім'ї.
    await db.disconnectAndClear()
    window.localStorage.setItem(FAMILY_KEY, familyId)
  }

  await db.connect(connector)
  return db
}

/**
 * Від'єднатися, лишивши дані на місці.
 *
 * Саме так виглядає вихід із застосунку: локальна база переживає його, і той
 * самий користувач після входу бачить свої дані відразу, ще до першої
 * синхронізації, — а невідправлені зміни лишаються в черзі й доїжджають.
 * Стирає базу лише зміна сім'ї (див. `connectPowerSync`).
 */
export async function disconnectPowerSync(): Promise<void> {
  if (!database) return
  await database.disconnect()
}
