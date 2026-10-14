import { mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { UpdateType } from '@powersync/web'
import type { CommonPowerSyncDatabase, CrudEntry } from '@powersync/web'
import type { SupabaseClient } from '@supabase/supabase-js'

import { applyCrudEntry, createConnector } from './connector.ts'

type Call = {
  method: 'upsert' | 'update'
  table: string
  row: unknown
  id?: unknown
}

function fakeSupabase(code?: string) {
  const calls: Array<Call> = []
  const result = { error: code ? { code, message: code } : null }
  const supabase = {
    from: (table: string) => ({
      upsert: (row: unknown) => {
        calls.push({ method: 'upsert', table, row })
        return Promise.resolve(result)
      },
      update: (row: unknown) => ({
        eq: (_column: string, id: unknown) => {
          calls.push({ method: 'update', table, row, id })
          return Promise.resolve(result)
        },
      }),
    }),
  } as unknown as SupabaseClient
  return { supabase, calls }
}

const entry = (
  op: UpdateType,
  table: string,
  opData?: Record<string, unknown>,
): CrudEntry => ({ op, table, id: 'row-1', opData }) as CrudEntry

test('PUT знімає позначку видалення з рядка, що вже лежить на сервері', async () => {
  const { supabase, calls } = fakeSupabase()
  await applyCrudEntry(
    supabase,
    entry(UpdateType.PUT, 'meal', { name: 'Омлет' }),
  )
  assert.deepEqual(calls, [
    {
      method: 'upsert',
      table: 'meal',
      row: { deleted_at: null, name: 'Омлет', id: 'row-1' },
    },
  ])
})

test('PUT з власним deleted_at передає саме його', async () => {
  const { supabase, calls } = fakeSupabase()
  const deletedAt = '2026-01-01T00:00:00.000Z'
  await applyCrudEntry(
    supabase,
    entry(UpdateType.PUT, 'meal', { deleted_at: deletedAt }),
  )
  assert.deepEqual(calls[0].row, { deleted_at: deletedAt, id: 'row-1' })
})

test('вивантаження не шле часових позначок і повертає jsonb та boolean у типи Postgres', async () => {
  const { supabase, calls } = fakeSupabase()
  await applyCrudEntry(
    supabase,
    entry(UpdateType.PATCH, 'meal', {
      created_at: '2026-01-01',
      updated_at: '2026-01-02',
      ingredients: '["яйце",{"name":"молоко","amount":100,"unit":"мл"}]',
      calories_approx: 1,
      gerd: 0,
      source_issues: null,
      calories: 250,
    }),
  )
  assert.deepEqual(calls, [
    {
      method: 'update',
      table: 'meal',
      row: {
        ingredients: ['яйце', { name: 'молоко', amount: 100, unit: 'мл' }],
        calories_approx: true,
        gerd: false,
        source_issues: null,
        calories: 250,
      },
      id: 'row-1',
    },
  ])
})

test('JSON-рядок, що не розбирається, їде як є, а не порожнім масивом', async () => {
  const { supabase, calls } = fakeSupabase()
  await applyCrudEntry(
    supabase,
    entry(UpdateType.PATCH, 'recipe', { steps: 'не json' }),
  )
  assert.deepEqual(calls[0].row, { steps: 'не json' })
})

test('локальний DELETE стає м’яким видаленням', async () => {
  const { supabase, calls } = fakeSupabase()
  await applyCrudEntry(supabase, entry(UpdateType.DELETE, 'meal_pref'))
  assert.equal(calls[0].method, 'update')
  assert.equal(calls[0].id, 'row-1')
  const { deleted_at } = calls[0].row as { deleted_at: string }
  assert.equal(new Date(deleted_at).toISOString(), deleted_at)
})

function fakeDatabase(crud: Array<CrudEntry>) {
  const complete = mock.fn(() => Promise.resolve())
  const database = {
    getNextCrudTransaction: () => Promise.resolve({ crud, complete }),
  } as unknown as CommonPowerSyncDatabase
  return { database, complete }
}

test('запис, який сервер не прийме ніколи, відкидається з гучним логом, щоб не блокувати чергу', async (t) => {
  const logged = t.mock.method(console, 'error', () => undefined)
  for (const code of ['22P02', '23514', '42501']) {
    const { supabase } = fakeSupabase(code)
    const { database, complete } = fakeDatabase([
      entry(UpdateType.PATCH, 'meal'),
    ])
    await createConnector(supabase, '').uploadData(database)
    assert.equal(complete.mock.callCount(), 1, code)
  }
  assert.equal(logged.mock.callCount(), 3)
})

test('тимчасова помилка лишає транзакцію в черзі на повтор', async () => {
  const { supabase } = fakeSupabase('PGRST000')
  const { database, complete } = fakeDatabase([entry(UpdateType.PATCH, 'meal')])
  await assert.rejects(createConnector(supabase, '').uploadData(database))
  assert.equal(complete.mock.callCount(), 0)
})

const withSession = (session: unknown) =>
  ({
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
    },
  }) as unknown as SupabaseClient

test('без сесії конектор не під’єднується, а не падає', async () => {
  assert.equal(
    await createConnector(withSession(null), 'https://sync').fetchCredentials(),
    null,
  )
})

test('час протухання токена переводиться із секунд GoTrue, щоб оновити його заздалегідь', async () => {
  const session = { access_token: 'jwt', expires_at: 1_800_000_000 }
  assert.deepEqual(
    await createConnector(
      withSession(session),
      'https://sync',
    ).fetchCredentials(),
    {
      endpoint: 'https://sync',
      token: 'jwt',
      expiresAt: new Date(1_800_000_000_000),
    },
  )
})
