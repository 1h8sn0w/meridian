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
const SQLITE_TYPES: Readonly<Record<string, string>> = {
  integer: 'INTEGER',
  boolean: 'INTEGER',
  double: 'REAL',
}

const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(new URL(file, migrationsDir), 'utf8'))
  .join(';\n')
  .replace(/'(?:[^']|'')*'|--.*$/gm, (match) =>
    match.startsWith('--') ? '' : "''",
  )
  .replaceAll('"', '')
  .replace(/\b(?:public\.|ONLY |IF NOT EXISTS |IF EXISTS )/g, '')
const statements = sql.split(';')

const names = (list: string) => list.trim().split(/\s*,\s*/)

const tables = new Map<string, Map<string, string>>()
const published = new Set<string>()
const readable = new Set<string>()
const parsed = { create: 0, publication: 0, grant: 0 }
for (const statement of statements) {
  const create = statement.match(/^\s*CREATE TABLE ([a-z_]\w*) \(([\s\S]*)\)/)
  if (create) {
    parsed.create++
    tables.set(
      create[1],
      new Map(
        [...create[2].matchAll(/^\s*([a-z_]\w*) ([a-z]+(?:\[\])?)/gm)].map(
          ([, column, type]) => [column, type],
        ),
      ),
    )
  }

  const drop = statement.match(/^\s*DROP TABLE ([\w\s,]+?)(?: CASCADE)?\s*$/)
  for (const table of drop ? names(drop[1]) : []) {
    tables.delete(table)
    published.delete(table)
    readable.delete(table)
  }

  const [, altered = '', clauses = ''] =
    statement.match(/^\s*ALTER TABLE ([a-z_]\w*) ([\s\S]*)/) ?? []
  for (const [, action, column, type] of clauses.matchAll(
    /(ADD|DROP)(?: COLUMN)? ([a-z_]\w*)(?: ([a-z]+(?:\[\])?))?/g,
  )) {
    if (action === 'DROP') tables.get(altered)?.delete(column)
    else tables.get(altered)?.set(column, type)
  }

  const publication = statement.match(
    /PUBLICATION powersync (FOR|ADD|SET|DROP) TABLE\s+([\w\s,]+)$/,
  )
  if (publication) {
    parsed.publication++
    const [, action, list] = publication
    if (action === 'FOR' || action === 'SET') published.clear()
    for (const table of names(list)) {
      if (action === 'DROP') published.delete(table)
      else published.add(table)
    }
  }

  const grant = statement.match(
    /^\s*(GRANT|REVOKE) ([A-Z, ]+) ON TABLE\s+([\w\s,]+?)\s+(?:TO|FROM)\s+([\w\s,]+)$/,
  )
  if (grant && names(grant[4]).includes('powersync_role')) {
    parsed.grant++
    if (/\b(?:SELECT|ALL)\b/.test(grant[2])) {
      for (const table of names(grant[3])) {
        if (grant[1] === 'GRANT') readable.add(table)
        else readable.delete(table)
      }
    }
  }
}

const streamQueries = [
  ...readFileSync(new URL('infra/powersync/sync-config.yaml', root), 'utf8')
    .replace(/(^|\s)#.*$/gm, '$1')
    .matchAll(
      /^\s*(?:-|query:)\s*(?:[|>][+-]?\s*)?SELECT\s+(.+?)\s+FROM\s+(?:public\.)?(\w+)/gims,
    ),
]

const sorted = (values: Iterable<string>) => [...values].sort()
const synced = sorted(SYNCED_TABLES)

const pairs = (record: Readonly<Record<string, ReadonlyArray<string>>>) =>
  sorted(
    Object.entries(record).flatMap(([table, columns]) =>
      columns.map((column) => `${table}.${column}`),
    ),
  )
const columnsOfType = (...types: Array<string>) =>
  sorted(
    synced.flatMap((table) =>
      [...(tables.get(table) ?? [])]
        .filter(([, type]) => types.includes(type))
        .map(([column]) => `${table}.${column}`),
    ),
  )
const count = (pattern: RegExp) =>
  statements.filter((statement) => pattern.test(statement)).length

test('міграції розібрано повністю', () => {
  assert.doesNotMatch(
    sql,
    /\b(?:create|alter|drop)\s+(?:\w+\s+)?table\b|\bpublication\b|\b(?:grant|revoke)\b/,
    'ключові слова DDL — великими літерами',
  )
  assert.equal(parsed.create, count(/CREATE (?:\w+ )?TABLE (?!\w+\.)/))
  assert.equal(parsed.publication, count(/PUBLICATION powersync/))
  assert.equal(
    parsed.grant,
    count(/\bON (?:ALL )?TABLES?\b[\s\S]*\bpowersync_role\b/),
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

test('powersync_role читає рівно опубліковані таблиці', () => {
  assert.deepEqual(sorted(readable), sorted(published))
})

test('стріми sync-config вибирають рівно синхронізовані таблиці, усі колонки', () => {
  assert.deepEqual(sorted(streamQueries.map(([, , table]) => table)), synced)
  for (const [query, columns] of streamQueries) {
    assert.equal(columns, '*', query)
  }
})

test('колонки й типи клієнтської схеми збігаються з міграціями', () => {
  for (const table of AppSchema.tables) {
    assert.deepEqual(
      sorted(table.columns.map((column) => `${column.name}:${column.type}`)),
      sorted(
        [...(tables.get(table.name) ?? [])]
          .filter(([column]) => column !== 'id')
          .map(([column, type]) => `${column}:${SQLITE_TYPES[type] ?? 'TEXT'}`),
      ),
      table.name,
    )
  }
})

test('JSON_COLUMNS і BOOLEAN_COLUMNS — рівно json- і boolean-колонки', () => {
  assert.deepEqual(pairs(JSON_COLUMNS), columnsOfType('json', 'jsonb'))
  assert.deepEqual(pairs(BOOLEAN_COLUMNS), columnsOfType('boolean'))
})
