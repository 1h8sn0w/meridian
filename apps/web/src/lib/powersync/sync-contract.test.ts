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

const NOT_PUBLISHED = ['family', 'family_invite', 'family_member', 'pdf_import']
const sqliteType = (type: string) =>
  /^(?:boolean|smallint|integer|bigint|int[248]?|(?:small|big)?serial)$/.test(
    type,
  )
    ? 'INTEGER'
    : /^(?:real|double|float[48]?)$/.test(type)
      ? 'REAL'
      : 'TEXT'
const KEYWORDS =
  'constraint|primary|unique|check|foreign|exclude|like|default|not|identity|expression'

const sql = readdirSync(migrationsDir)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => readFileSync(new URL(file, migrationsDir), 'utf8'))
  .join(';\n')
  .replace(/'(?:[^']|'')*'|--.*$/gm, (match) =>
    match.startsWith('--') ? '' : "''",
  )
  .toLowerCase()
  .replaceAll('"', '')
  .replace(/\b(?:public\.|only |if not exists |if exists )/g, '')
const statements = sql.split(';')

const names = (list: string) => list.trim().split(/\s*,\s*/)

const tables = new Map<string, Map<string, string>>()
const published = new Set<string>()
const readable = new Set<string>()
const parsed = { create: 0, drop: 0, publication: 0, grant: 0 }
for (const statement of statements) {
  const create = statement.match(/^\s*create table ([a-z_]\w*) \(([\s\S]*)\)/)
  if (create) {
    parsed.create++
    tables.set(
      create[1],
      new Map(
        [
          ...create[2].matchAll(
            new RegExp(
              `^\\s*(?!(?:${KEYWORDS})\\b)([a-z_]\\w*)\\s+([a-z_]\\w*(?:\\[\\])?)`,
              'gm',
            ),
          ),
        ].map(([, column, type]) => [column, type]),
      ),
    )
  }

  const drop = statement.match(
    /^\s*drop table ([\w\s,]+?)(?:\s+(?:cascade|restrict))?\s*$/,
  )
  if (drop) {
    parsed.drop++
    for (const table of names(drop[1])) {
      tables.delete(table)
      published.delete(table)
      readable.delete(table)
    }
  }

  const [, altered = '', clauses = ''] =
    statement.match(/^\s*alter table ([a-z_]\w*) ([\s\S]*)/) ?? []
  for (const [, action, column, type] of clauses.matchAll(
    new RegExp(
      `\\b(add|drop)(?:\\s+column)?\\s+(?!(?:${KEYWORDS})\\b)([a-z_]\\w*)(?:\\s+([a-z_]\\w*(?:\\[\\])?))?`,
      'g',
    ),
  )) {
    if (action === 'drop') tables.get(altered)?.delete(column)
    else tables.get(altered)?.set(column, type)
  }

  const publication = statement.match(
    /publication powersync (for|add|set|drop) table\s+([\w\s,]+)$/,
  )
  if (publication) {
    parsed.publication++
    const [, action, list] = publication
    if (action === 'for' || action === 'set') published.clear()
    for (const table of names(list)) {
      if (action === 'drop') published.delete(table)
      else published.add(table)
    }
  }

  const grant = statement.match(
    /^\s*(grant|revoke)\s+(grant option for\s+)?([a-z, ]+?)\s+on table\s+([\w\s,]+?)\s+(?:to|from)\s+([\w\s,]+)$/,
  )
  if (grant && names(grant[5]).includes('powersync_role')) {
    parsed.grant++
    if (!grant[2] && /\b(?:select|all)\b/.test(grant[3])) {
      for (const table of names(grant[4])) {
        if (grant[1] === 'grant') readable.add(table)
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
const columnsWhere = (predicate: (type: string) => boolean) =>
  sorted(
    synced.flatMap((table) =>
      [...(tables.get(table) ?? [])]
        .filter(([, type]) => predicate(type))
        .map(([column]) => `${table}.${column}`),
    ),
  )
const count = (pattern: RegExp) =>
  statements.filter((statement) => pattern.test(statement)).length

test('міграції розібрано повністю', () => {
  assert.equal(parsed.create, count(/\bcreate (?:\w+ )?table (?!\w+\.)/))
  assert.equal(parsed.drop, count(/(?<!powersync )\bdrop table\b/))
  assert.equal(parsed.publication, count(/\bpublication powersync\b/))
  assert.equal(
    parsed.grant,
    count(/\bon (?:all )?tables?\b[\s\S]*\bpowersync_role\b/),
  )
})

test('кожна таблиця міграцій або синхронізується, або названа винятком', () => {
  assert.deepEqual(
    sorted(tables.keys()),
    sorted([...synced, ...NOT_PUBLISHED]),
  )
})

test('публікація powersync = рівно синхронізовані таблиці', () => {
  assert.deepEqual(sorted(published), synced)
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
          .map(([column, type]) => `${column}:${sqliteType(type)}`),
      ),
      table.name,
    )
  }
})

test('JSON_COLUMNS і BOOLEAN_COLUMNS — рівно json-, масивні й boolean-колонки', () => {
  assert.deepEqual(
    pairs(JSON_COLUMNS),
    columnsWhere(
      (type) => type === 'json' || type === 'jsonb' || type.endsWith('[]'),
    ),
  )
  assert.deepEqual(
    pairs(BOOLEAN_COLUMNS),
    columnsWhere((type) => type === 'boolean'),
  )
})
