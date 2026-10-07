import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

import {
  AppSchema,
  BOOLEAN_COLUMNS,
  JSON_COLUMNS,
  SYNCED_TABLES,
} from './schema.ts'

const root = new URL('../../../../../', import.meta.url)
const migrationsDir = new URL('packages/db/migrations/', root)

const PUBLISHED_NOT_SYNCED = ['family', 'pdf_import']
const NOT_PUBLISHED = ['family_invite', 'family_member']

const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(new URL(file, migrationsDir), 'utf8'))
  .join('\n')
  .replace(/'(?:[^']|'')*'|--.*$/gm, (match) =>
    match.startsWith('--') ? '' : match,
  )
  .replaceAll('"', '')
  .replace(/\b(?:public\.|ONLY |IF NOT EXISTS |IF EXISTS )/g, '')

const TYPE_KINDS: Readonly<Record<string, string>> = {
  jsonb: 'json',
  bool: 'boolean',
}
const typeKind = (type: string) => TYPE_KINDS[type] ?? type

const tables = new Map<string, Map<string, string>>()
for (const [, table, body] of sql.matchAll(
  /CREATE TABLE ([a-z_]\w*) \(([\s\S]*?)\n\)/g,
)) {
  tables.set(
    table,
    new Map(
      [...body.matchAll(/^\s*([a-z_]\w*) ([a-z]+)/gm)].map(
        ([, column, type]) => [column, typeKind(type)],
      ),
    ),
  )
}
for (const [, table, clauses] of sql.matchAll(
  /ALTER TABLE ([a-z_]\w*) ([^;]*);/g,
)) {
  for (const [, action, column, type] of clauses.matchAll(
    /(ADD|DROP)(?: COLUMN)? ([a-z_]\w*)(?: ([a-z]+))?/g,
  )) {
    if (action === 'DROP') tables.get(table)?.delete(column)
    else tables.get(table)?.set(column, typeKind(type))
  }
}

const publicationStatements = [
  ...sql.matchAll(
    /PUBLICATION powersync (FOR|ADD|SET|DROP) TABLE\s+([\w\s,]+?)\s*;/g,
  ),
]
const published = new Set<string>()
for (const [, action, list] of publicationStatements) {
  if (action === 'FOR' || action === 'SET') published.clear()
  for (const table of list.split(/\s*,\s*/)) {
    if (action === 'DROP') published.delete(table)
    else published.add(table)
  }
}

const streamQueries = [
  ...readFileSync(new URL('infra/powersync/sync-config.yaml', root), 'utf8')
    .replace(/(^|\s)#.*$/gm, '$1')
    .matchAll(/^\s*-\s*SELECT\s+(.+?)\s+FROM\s+(?:public\.)?(\w+)/gms),
]

const sorted = (values: Iterable<string>) => [...values].sort()
const synced = sorted(SYNCED_TABLES)

const pairs = (record: Readonly<Record<string, ReadonlyArray<string>>>) =>
  sorted(
    Object.entries(record).flatMap(([table, columns]) =>
      columns.map((column) => `${table}.${column}`),
    ),
  )
const columnsOfKind = (kind: string) =>
  sorted(
    synced.flatMap((table) =>
      [...(tables.get(table) ?? [])]
        .filter(([, columnKind]) => columnKind === kind)
        .map(([column]) => `${table}.${column}`),
    ),
  )

test('міграції розібрано повністю', () => {
  assert.equal(
    tables.size,
    sql.match(/CREATE TABLE (?!\w+\.)/g)?.length,
    'CREATE TABLE',
  )
  assert.equal(
    publicationStatements.length,
    sql.match(/PUBLICATION powersync/g)?.length,
    'PUBLICATION powersync',
  )
})

test('кожна таблиця міграцій або синхронізується, або названа винятком', () => {
  assert.deepEqual(
    sorted(tables.keys()),
    sorted([...synced, ...PUBLISHED_NOT_SYNCED, ...NOT_PUBLISHED]),
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

test('JSON_COLUMNS і BOOLEAN_COLUMNS — рівно json- і boolean-колонки', () => {
  assert.deepEqual(pairs(JSON_COLUMNS), columnsOfKind('json'))
  assert.deepEqual(pairs(BOOLEAN_COLUMNS), columnsOfKind('boolean'))
})
