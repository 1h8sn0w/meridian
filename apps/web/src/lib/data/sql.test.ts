import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'

import { LATEST_PLAN_ORDER, inList, placeholders } from './sql.ts'

function latestPlan(
  rows: Array<{ id: string; start_date: string; generated_at: string }>,
) {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    'CREATE TABLE week_plan (id TEXT, start_date TEXT, generated_at TEXT)',
  )
  const insert = sqlite.prepare('INSERT INTO week_plan VALUES (?, ?, ?)')
  for (const row of rows) insert.run(row.id, row.start_date, row.generated_at)
  return (
    sqlite.prepare('SELECT id FROM week_plan' + LATEST_PLAN_ORDER).get() as {
      id: string
    }
  ).id
}

test('план пристрою з «T» о 09:00 не обходить синхронізований план з пробілом о 10:00', () => {
  assert.equal(
    latestPlan([
      {
        id: 'device',
        start_date: '2026-08-29',
        generated_at: '2026-08-29T09:00:00.000Z',
      },
      {
        id: 'server',
        start_date: '2026-08-29',
        generated_at: '2026-08-29 10:00:00+00',
      },
    ]),
    'server',
  )
})

test('пізніша дата початку плану важить більше за час генерації', () => {
  assert.equal(
    latestPlan([
      {
        id: 'ahead',
        start_date: '2026-09-05',
        generated_at: '2026-08-29 08:00:00+00',
      },
      {
        id: 'current',
        start_date: '2026-08-29',
        generated_at: '2026-08-29 10:00:00+00',
      },
    ]),
    'ahead',
  )
})

test('два плани в ту саму секунду розв’язуються за id однаково на всіх пристроях', () => {
  const rows = [
    {
      id: 'a',
      start_date: '2026-08-29',
      generated_at: '2026-08-29T09:00:00.000Z',
    },
    {
      id: 'b',
      start_date: '2026-08-29',
      generated_at: '2026-08-29 09:00:00+00',
    },
  ]
  assert.equal(latestPlan(rows), 'b')
  assert.equal(latestPlan([...rows].reverse()), 'b')
})

test('порожній список під IN дає одне значення, що не збігається з жодним id', () => {
  assert.deepEqual(inList([]), [''])
  assert.equal(placeholders(inList([]).length), '?')
  assert.equal(placeholders(3), '?, ?, ?')
})
