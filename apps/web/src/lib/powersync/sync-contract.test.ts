import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import { AppSchema, BOOLEAN_COLUMNS, JSON_COLUMNS } from './schema.ts'

const root = new URL('../../../../../', import.meta.url)
const migrationsDir = new URL('packages/db/migrations/', root)

const NOT_SYNCED = ['family', 'family_invite', 'family_member', 'pdf_import']
const PUBLISHED_NOT_SYNCED = ['family', 'pdf_import']

const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(new URL(file, migrationsDir), 'utf8'))
  .join('\n')
  .replace(/--.*$/gm, '')

const tables = new Map<string, Map<string, string>>()
for (const [, table, body] of sql.matchAll(
  /CREATE TABLE (?:public\.)?"?([a-z_]+)"? \(([\s\S]*?)\n\);/g,
)) {
  tables.set(
    table,
    new Map(
      [...body.matchAll(/^\s*"?([a-z_]+)"? "?([a-z]+)/gm)].map(
        ([, column, type]) => [column, type],
      ),
    ),
  )
}
for (const [, table, column, type] of sql.matchAll(
  /ALTER TABLE (?:public\.)?"?([a-z_]+)"? ADD COLUMN "?([a-z_]+)"? "?([a-z]+)/g,
)) {
  tables.get(table)?.set(column, type)
}

const published = new Set<string>()
for (const [, action, list] of sql.matchAll(
  /PUBLICATION powersync (FOR|ADD|DROP) TABLE\s+("[a-z_]+"(?:,\s*"[a-z_]+")*)\s*;/g,
)) {
  for (const [, table] of list.matchAll(/"([a-z_]+)"/g)) {
    if (action === 'DROP') published.delete(table)
    else published.add(table)
  }
}

const syncConfig = readFileSync(
  new URL('infra/powersync/sync-config.yaml', root),
  'utf8',
).replace(/#.*$/gm, '')
const streamQueries = [...syncConfig.matchAll(/SELECT (.+?) FROM ([a-z_]+)/g)]

const synced = AppSchema.tables.map((table) => table.name).sort()
const sorted = (values: Iterable<string>) => [...values].sort()

const columnsOfType = (type: string) =>
  Object.fromEntries(
    synced
      .map((table) => [
        table,
        sorted(
          [...(tables.get(table) ?? [])]
            .filter(([, columnType]) => columnType === type)
            .map(([column]) => column),
        ),
      ])
      .filter(([, columns]) => columns.length > 0),
  )

const sortedRecord = (
  record: Readonly<Record<string, ReadonlyArray<string>>>,
) =>
  Object.fromEntries(
    Object.entries(record).map(([table, columns]) => [table, sorted(columns)]),
  )

test('кожна таблиця міграцій або синхронізується, або названа винятком', () => {
  assert.deepEqual(
    sorted([...tables.keys()].filter((table) => !NOT_SYNCED.includes(table))),
    synced,
  )
})

test('публікація powersync = синхронізовані таблиці + явні винятки', () => {
  assert.deepEqual(
    sorted(published),
    sorted([...synced, ...PUBLISHED_NOT_SYNCED]),
  )
})

test('стріми sync-config вибирають рівно синхронізовані таблиці, усі колонки', () => {
  assert.deepEqual(sorted(streamQueries.map(([, , table]) => table)), synced)
  for (const [query, columns] of streamQueries) {
    assert.equal(columns, '*', query)
  }
})

test('колонки клієнтської схеми збігаються з міграціями', () => {
  for (const table of AppSchema.tables) {
    assert.deepEqual(
      sorted(['id', ...table.columns.map((column) => column.name)]),
      sorted(tables.get(table.name)?.keys() ?? []),
      table.name,
    )
  }
})

test('JSON_COLUMNS і BOOLEAN_COLUMNS — рівно jsonb- і boolean-колонки', () => {
  assert.deepEqual(sortedRecord(JSON_COLUMNS), columnsOfType('jsonb'))
  assert.deepEqual(sortedRecord(BOOLEAN_COLUMNS), columnsOfType('boolean'))
})
