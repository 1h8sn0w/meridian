import { UpdateType } from '@powersync/web'
import type {
  CommonPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
  PowerSyncCredentials,
} from '@powersync/web'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { BOOLEAN_COLUMNS, JSON_COLUMNS } from './schema.ts'

const FATAL_RESPONSE_CODES = [/^22...$/, /^23...$/, /^42501$/]

const SERVER_OWNED_COLUMNS = ['created_at', 'updated_at']

export type Rejection = {
  table: string
  op: UpdateType
  code: string
  message: string
}

function asJson(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function asBoolean(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === '1' || value === 'true'
  return value
}

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

function fatalCode(error: unknown): string | null {
  const code = (error as PostgrestError | null)?.code
  return typeof code === 'string' &&
    FATAL_RESPONSE_CODES.some((r) => r.test(code))
    ? code
    : null
}

export async function applyCrudEntry(
  supabase: SupabaseClient,
  entry: CrudEntry,
): Promise<{ error: PostgrestError | null }> {
  const table = supabase.from(entry.table)
  const data = forServer(entry.table, entry.opData ?? {})

  switch (entry.op) {
    case UpdateType.PUT:
      return await table.upsert({ deleted_at: null, ...data, id: entry.id })
    case UpdateType.PATCH:
      return await table.update(data).eq('id', entry.id)
    case UpdateType.DELETE:
      return await table
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', entry.id)
  }
}

export function createConnector(
  supabase: SupabaseClient,
  endpoint: string,
  onRejected: (rejection: Rejection) => void,
): PowerSyncBackendConnector {
  return {
    async fetchCredentials(): Promise<PowerSyncCredentials | null> {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      if (!data.session) return null

      return {
        endpoint,
        token: data.session.access_token,
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
        const code = fatalCode(error)
        if (code === null) throw error
        console.error(
          '[meridian] зміну не прийнято сервером, відкидаємо:',
          lastEntry,
          error,
        )
        await transaction.complete()
        if (lastEntry) {
          onRejected({
            table: lastEntry.table,
            op: lastEntry.op,
            code,
            message: (error as PostgrestError).message,
          })
        }
      }
    },
  }
}
