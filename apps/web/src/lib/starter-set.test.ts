import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

import { hasRecipe, parseStarterSet, starterMealId } from '@meridian/core'
import type { StarterMeal } from '@meridian/core'
import { seedStarterMeals } from './data/mutations.ts'
import { autoSeed, missingStarterMeals } from './starter-set.ts'
import type { Outcome } from './messages.ts'
import type { SeedSteps, StarterFetch, StarterStatus } from './starter-set.ts'

const parsed = parseStarterSet(
  JSON.parse(
    readFileSync(
      new URL('../../../../infra/starter-set.example.json', import.meta.url),
      'utf8',
    ),
  ),
)
if (!parsed.ok) throw new Error(parsed.error)
const SET: ReadonlyArray<StarterMeal> = parsed.set.meals
const FAMILY = '00000000-0000-4000-8000-000000000001'

type World = {
  status?: StarterStatus
  poolHasMeals?: boolean
  meals?: ReadonlyArray<StarterMeal> | 'broken' | 'offline'
  seededHere?: boolean
  cancelAfter?: string
  writeFails?: boolean
}

async function run(world: World): Promise<Array<string>> {
  const calls: Array<string> = []
  let cancelled = false
  const step =
    <T>(name: string, value: () => T) =>
    async () => {
      calls.push(name)
      const result = value()
      if (world.cancelAfter === name) cancelled = true
      return result
    }
  const steps: SeedSteps = {
    cancelled: () => cancelled,
    seededHere: () => world.seededHere ?? false,
    rememberSeeded: () => void calls.push('remember'),
    firstSync: step('sync', () => undefined),
    status: step<Outcome<StarterStatus>>('status', () => ({
      ok: true,
      value: world.status ?? 'pending',
    })),
    poolHasMeals: step('pool', () => world.poolHasMeals ?? false),
    fetchMeals: step<StarterFetch>('fetch', () => {
      const meals = world.meals ?? SET
      if (meals === 'offline') return { ok: false, failure: { text: 'мережа' } }
      if (meals === 'broken') {
        return { ok: false, broken: true, failure: { text: 'зіпсовано' } }
      }
      return { ok: true, value: [...meals] }
    }),
    write: step('write', () => {
      if (world.writeFails) throw new Error('диск')
      return SET.length
    }),
    claim: step<Outcome<boolean>>('claim', () => ({ ok: true, value: true })),
  }
  const error = console.error
  console.error = () => {}
  try {
    await autoSeed(steps)
  } catch {
    calls.push('throw')
  } finally {
    console.error = error
  }
  return calls
}

test('нова сім’я з порожнім пулом: синхронізація → запис → позначка', async () => {
  assert.deepEqual(await run({}), [
    'sync',
    'status',
    'pool',
    'fetch',
    'write',
    'claim',
    'remember',
  ])
})

test('непорожній пул (сім’я до появи набору): лише позначка, без запису', async () => {
  assert.deepEqual(await run({ poolHasMeals: true }), [
    'sync',
    'status',
    'pool',
    'claim',
    'remember',
  ])
})

test('уже засіяна сім’я: кешуємо, нових страв сама не отримує', async () => {
  assert.deepEqual(await run({ status: 'seeded' }), [
    'sync',
    'status',
    'remember',
  ])
})

test('кеш пристрою: сервер не питаємо зовсім', async () => {
  assert.deepEqual(await run({ seededHere: true }), [])
})

test('набору немає: нічого не пишемо й не позначаємо', async () => {
  assert.deepEqual(await run({ status: 'none' }), ['sync', 'status'])
})

test('порожній, зіпсований чи недоступний набір засів не «спалює»', async () => {
  for (const meals of [[], 'broken', 'offline'] as const) {
    assert.deepEqual(await run({ meals }), ['sync', 'status', 'pool', 'fetch'])
  }
})

test('збій запису: позначки немає — наступне відкриття спробує знову', async () => {
  assert.deepEqual(await run({ writeFails: true }), [
    'sync',
    'status',
    'pool',
    'fetch',
    'write',
    'throw',
  ])
})

test('вийшли чи змінили сім’ю — після будь-якого кроку нічого не пишемо', async () => {
  for (const at of ['sync', 'status', 'pool', 'fetch']) {
    const calls = await run({ cancelAfter: at })
    assert.equal(calls.at(-1), at, 'зупинились одразу після ' + at)
  }
  assert.equal(
    (await run({ cancelAfter: 'write' })).at(-1),
    'write',
    'Між записом і позначкою: позначки немає, пул уже не порожній — наступне відкриття лише поставить її.',
  )
})

test('кнопка бачить лише ті страви набору, яких немає серед живих', () => {
  const [first, ...rest] = SET
  const live = new Set([starterMealId(FAMILY, first.key), 'own-meal'])
  assert.deepEqual(missingStarterMeals(FAMILY, SET, live), rest)
  assert.deepEqual(missingStarterMeals(FAMILY, SET, new Set()), SET)
})

function localDb() {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(
    'CREATE TABLE meal (id TEXT PRIMARY KEY, family_id TEXT, name TEXT,' +
      ' type TEXT, calories REAL, calories_approx INTEGER, protein REAL,' +
      ' fat REAL, carbs REAL, ingredients TEXT, source TEXT, portions TEXT,' +
      ' gerd INTEGER, source_issues TEXT, deleted_at TEXT);' +
      'CREATE TABLE recipe (id TEXT PRIMARY KEY, family_id TEXT,' +
      ' meal_id TEXT, steps TEXT, prep_time INTEGER, servings INTEGER,' +
      ' deleted_at TEXT);',
  )
  type Params = Array<null | number | string>
  const tx = {
    get: async (sql: string, params: Params = []) =>
      sqlite.prepare(sql).get(...params),
    getOptional: async (sql: string, params: Params = []) =>
      sqlite.prepare(sql).get(...params) ?? null,
    execute: async (sql: string, params: Params = []) =>
      sqlite.prepare(sql).run(...params),
  }
  const db = {
    writeTransaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as Parameters<typeof seedStarterMeals>[0]
  return { sqlite, db }
}

const nameOf = (sqlite: DatabaseSync, id: string) =>
  sqlite.prepare('SELECT name, deleted_at FROM meal WHERE id = ?').get(id)

test('засів: відредагована жива страва лишається, видалена оживає', async () => {
  const { sqlite, db } = localDb()
  assert.equal(await seedStarterMeals(db, FAMILY, SET), SET.length)

  const [edited, removed] = SET.map((meal) => starterMealId(FAMILY, meal.key))
  sqlite.prepare("UPDATE meal SET name = 'Своя назва' WHERE id = ?").run(edited)
  sqlite.prepare("UPDATE meal SET deleted_at = 'x' WHERE id = ?").run(removed)

  assert.equal(await seedStarterMeals(db, FAMILY, SET), 1)
  assert.deepEqual(
    { ...nameOf(sqlite, edited) },
    {
      name: 'Своя назва',
      deleted_at: null,
    },
  )
  assert.deepEqual(
    { ...nameOf(sqlite, removed) },
    {
      name: SET[1].name,
      deleted_at: null,
    },
  )
  assert.equal(
    await seedStarterMeals(db, FAMILY, SET),
    0,
    'Повтор нічого не додає й не дублює — ні страв, ні рецептів.',
  )
  const count = (table: string) =>
    sqlite.prepare('SELECT count(*) AS n FROM ' + table).get()?.n
  assert.equal(count('meal'), SET.length)
  assert.equal(
    count('recipe'),
    SET.filter((meal) => hasRecipe(meal.recipe)).length,
  )
})
