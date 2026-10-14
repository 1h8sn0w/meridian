import type {
  PowerSyncBackendConnector,
  PowerSyncDatabase,
} from '@powersync/web'
import { AppSchema } from './schema.ts'

const DB_FILENAME = 'meridian.v2.db'

const DB_OWNER_FAMILY_KEY = 'meridian.sync.family.v2'

let database: PowerSyncDatabase | null = null

let queue: Promise<unknown> = Promise.resolve()

export function enqueue<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work)
  queue = next.catch(() => undefined)
  return next
}

async function openDatabase(): Promise<PowerSyncDatabase> {
  if (!database) {
    const { PowerSyncDatabase } =
      import.meta.env.MODE === 'native'
        ? await import('@powersync/capacitor')
        : await import('@powersync/web')
    database = new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: DB_FILENAME },
    })
    exposeForDev(database)
  }
  return database
}

function exposeForDev(db: PowerSyncDatabase): void {
  if (!import.meta.env.DEV) return
  const scope = window as typeof window & { Meridian?: Record<string, unknown> }
  scope.Meridian = { ...scope.Meridian, sync: db }
}

export function openPowerSync(familyId: string): Promise<PowerSyncDatabase> {
  return enqueue(async () => {
    const db = await openDatabase()

    if (window.localStorage.getItem(DB_OWNER_FAMILY_KEY) !== familyId) {
      await db.disconnectAndClear()
      window.localStorage.setItem(DB_OWNER_FAMILY_KEY, familyId)
    }

    return db
  })
}

export function connectPowerSync(
  connector: PowerSyncBackendConnector,
): Promise<void> {
  return enqueue(async () => (await openDatabase()).connect(connector))
}

export function disconnectPowerSync(): Promise<void> {
  return enqueue(async () => {
    if (!database) return
    await database.disconnect()
  })
}
