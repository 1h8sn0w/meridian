import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MEAL_TYPES,
  NO_NUTRITION,
  mealFromRow,
  planSlotId,
} from '@meridian/core'
import type { MealType, PlanDay, WeekPlan } from '@meridian/core'
import {
  clearStaleChecks,
  insertMeal,
  saveWeek,
  updateMeal,
} from './mutations.ts'
import type { Db, MealInput } from './mutations.ts'
import { sqliteDb, testMeal } from './test-fixtures.ts'

const OWNER = 'profile-1'
const START = '2026-10-12'

function localDb() {
  const { sqlite, db } = sqliteDb(`
    CREATE TABLE week_plan (id TEXT PRIMARY KEY, family_id TEXT,
      profile_id TEXT, generated_at TEXT, start_date TEXT,
      target_calories INTEGER, corridor INTEGER, anti_repeat_days INTEGER,
      days INTEGER, used_corridor INTEGER, sources TEXT, warnings TEXT,
      deleted_at TEXT);
    CREATE TABLE plan_slot (id TEXT PRIMARY KEY, family_id TEXT,
      week_plan_id TEXT, profile_id TEXT, date TEXT, day_index INTEGER,
      slot TEXT, meal_id TEXT, swapped INTEGER, deleted_at TEXT);
    CREATE TABLE shopping_check (id TEXT PRIMARY KEY, fingerprint TEXT,
      updated_at TEXT, deleted_at TEXT);
  `)
  const slots = () =>
    sqlite
      .prepare(
        'SELECT id, week_plan_id, date, slot, meal_id, swapped, deleted_at' +
          ' FROM plan_slot ORDER BY date, slot',
      )
      .all() as Array<{
      id: string
      week_plan_id: string
      date: string
      slot: MealType
      meal_id: string
      swapped: number
      deleted_at: string | null
    }>
  return { sqlite, db, slots }
}

function week(
  days: number,
  mealPrefix: string,
  types: ReadonlyArray<MealType> = MEAL_TYPES,
): WeekPlan {
  const day = (): PlanDay => ({
    meals: Object.fromEntries(
      types.map((type) => [type, testMeal(`${mealPrefix}-${type}`, type, 100)]),
    ),
    calories: { total: 400, unknown: 0, approx: false },
  })
  return {
    days: Array.from({ length: days }, day),
    params: { targetCalories: 400, corridor: 50, antiRepeatDays: 1, days },
    usedCorridor: 50,
    sources: [],
    mixed: false,
    mixPossible: true,
    warnings: [],
  }
}

const save = (db: Db, plan: WeekPlan) =>
  saveWeek(db, 'family-1', { ownerId: OWNER, startDate: START, plan })

test('новий слот отримує виведений id з профілю, дати й прийому', async () => {
  const { db, slots } = localDb()
  await save(db, week(1, 'a'))
  for (const row of slots())
    assert.equal(row.id, planSlotId(OWNER, row.date, row.slot))
})

test('перегенерація тих самих дат переписує наявний рядок слота, а не вставляє другий', async () => {
  const { db, slots } = localDb()
  await save(db, week(2, 'a'))
  const before = slots()
  const planId = await save(db, week(2, 'b'))
  const after = slots()
  assert.deepEqual(
    after.map((row) => row.id),
    before.map((row) => row.id),
  )
  assert.ok(after.every((row) => row.week_plan_id === planId))
  assert.ok(after.every((row) => row.meal_id.startsWith('b-')))
  assert.ok(after.every((row) => row.deleted_at === null))
})

test('слот із випадковим id знаходиться за природним ключем і переписується', async () => {
  const { sqlite, db, slots } = localDb()
  sqlite
    .prepare(
      'INSERT INTO plan_slot (id, profile_id, date, slot, meal_id, swapped)' +
        ' VALUES (?, ?, ?, ?, ?, 0)',
    )
    .run('random-id', OWNER, START, 'breakfast', 'old')
  await save(db, week(1, 'a'))
  const breakfast = slots().filter((row) => row.slot === 'breakfast')
  assert.equal(breakfast.length, 1)
  assert.equal(breakfast[0].id, 'random-id')
  assert.equal(breakfast[0].meal_id, 'a-breakfast')
})

test('перегенерація знімає позначку ручної заміни', async () => {
  const { sqlite, db, slots } = localDb()
  await save(db, week(1, 'a'))
  sqlite.exec('UPDATE plan_slot SET swapped = 1')
  await save(db, week(1, 'b'))
  assert.ok(slots().every((row) => row.swapped === 0))
})

test('хвіст коротшого тижня м’яко видаляється разом із попереднім планом', async () => {
  const { sqlite, db, slots } = localDb()
  const first = await save(db, week(2, 'a'))
  await save(db, week(1, 'b'))
  const tail = slots().filter((row) => row.date !== START)
  assert.equal(tail.length, MEAL_TYPES.length)
  assert.ok(tail.every((row) => row.deleted_at !== null))
  const old = sqlite
    .prepare('SELECT deleted_at FROM week_plan WHERE id = ?')
    .get(first) as { deleted_at: string | null }
  assert.notEqual(old.deleted_at, null)
})

test('перегенерація без перекусу м’яко видаляє перекуси попереднього плану', async () => {
  const { db, slots } = localDb()
  await save(db, week(2, 'a'))
  const planId = await save(db, week(2, 'b', ['breakfast', 'lunch', 'dinner']))
  const rows = slots()
  const snacks = rows.filter((row) => row.slot === 'snack')
  assert.equal(snacks.length, 2)
  assert.ok(snacks.every((row) => row.deleted_at !== null))
  const live = rows.filter((row) => row.deleted_at === null)
  assert.equal(live.length, 6)
  assert.ok(live.every((row) => row.week_plan_id === planId))
})

test('м’яко видалений слот із виведеним id оживає, а не вставляється наново', async () => {
  const { db, slots } = localDb()
  await save(db, week(2, 'a'))
  await save(db, week(1, 'b'))
  await save(db, week(2, 'c'))
  const rows = slots()
  assert.equal(rows.length, 2 * MEAL_TYPES.length)
  assert.ok(rows.every((row) => row.deleted_at === null))
  assert.ok(rows.every((row) => row.meal_id.startsWith('c-')))
})

const DAY = 24 * 60 * 60 * 1000
const serverMoment = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * DAY)
    .toISOString()
    .slice(0, 19)
    .replace('T', ' ') + '+00'

function withChecks(
  rows: Array<
    [
      id: string,
      fingerprint: string,
      updatedAt: string | null,
      deletedAt?: string,
    ]
  >,
) {
  const local = localDb()
  const insert = local.sqlite.prepare(
    'INSERT INTO shopping_check (id, fingerprint, updated_at, deleted_at) VALUES (?, ?, ?, ?)',
  )
  for (const [id, fingerprint, updatedAt, deletedAt] of rows)
    insert.run(id, fingerprint, updatedAt, deletedAt ?? null)
  const deleted = () =>
    Object.fromEntries(
      (
        local.sqlite
          .prepare('SELECT id, deleted_at FROM shopping_check ORDER BY id')
          .all() as Array<{ id: string; deleted_at: string | null }>
      ).map((row) => [row.id, row.deleted_at]),
    )
  return { ...local, deleted }
}

test('прибирання не чіпає свіжу позначку чужого відбитка: план іншого пристрою міг ще не приїхати', async () => {
  const { db, deleted } = withChecks([
    ['fresh', 'other', serverMoment(1)],
    ['old', 'other', serverMoment(31)],
    ['mine', 'current', serverMoment(31)],
  ])
  await clearStaleChecks(db, 'current')
  const after = deleted()
  assert.equal(after.fresh, null)
  assert.notEqual(after.old, null)
  assert.equal(after.mine, null)
})

test('невивантажена позначка без updated_at не прибирається', async () => {
  const { db, deleted } = withChecks([['local', 'other', null]])
  await clearStaleChecks(db, 'current')
  assert.equal(deleted().local, null)
})

test('порожній відбиток не прибирає нічого: «плану ще немає» не означає «список порожній»', async () => {
  const { db, deleted } = withChecks([['old', 'other', serverMoment(31)]])
  await clearStaleChecks(db, ' ')
  assert.equal(deleted().old, null)
})

test('уже видалений рядок не отримує нової позначки часу видалення', async () => {
  const at = '2026-01-01T00:00:00.000Z'
  const { db, deleted } = withChecks([['gone', 'other', serverMoment(60), at]])
  await clearStaleChecks(db, 'current')
  assert.equal(deleted().gone, at)
})

const MEAL_TABLE =
  'CREATE TABLE meal (id TEXT PRIMARY KEY, family_id TEXT, name TEXT,' +
  ' type TEXT, calories INTEGER, calories_approx INTEGER, protein REAL,' +
  ' fat REAL, carbs REAL, macros_approx INTEGER, calories_w INTEGER,' +
  ' protein_w REAL, fat_w REAL, carbs_w REAL, ingredients TEXT,' +
  ' source TEXT, portions TEXT, gerd INTEGER, source_issues TEXT,' +
  ' deleted_at TEXT)'

test('MER-79: страва зберігає й оновлює цифри порцій Ж і Ч окремо', async () => {
  const { sqlite, db } = sqliteDb(MEAL_TABLE)
  const input: MealInput = {
    name: 'Гречка',
    type: 'lunch',
    nutrition: {
      Ч: { calories: 520, protein: 38, fat: null, carbs: null },
      Ж: { calories: 390, protein: 28.5, fat: null, carbs: null },
    },
    ingredients: [],
    source: '',
    portions: [],
    gerd: false,
    sourceIssues: [],
  }
  const read = () =>
    mealFromRow({ ...sqlite.prepare('SELECT * FROM meal').get() })

  const id = await insertMeal(db, 'f1', input)
  assert.deepEqual(read().nutrition, input.nutrition)

  sqlite.prepare('UPDATE meal SET calories_approx = 1').run()
  const nutrition = {
    Ч: input.nutrition.Ч,
    Ж: { ...input.nutrition.Ж, calories: 400 },
  }
  await updateMeal(
    db,
    id,
    { ...input, nutrition },
    { calories: true, macros: false },
  )
  assert.deepEqual(read().nutrition, nutrition)
  assert.equal(read().caloriesApprox, false)
})

test('MER-141: правка калорій знімає лише «≈» калорій, правка БЖВ — лише «≈» БЖВ', async () => {
  const { sqlite, db } = sqliteDb(MEAL_TABLE)
  const input: MealInput = {
    name: 'Коктейль',
    type: 'snack',
    nutrition: {
      Ч: { calories: 300, protein: 23.5, fat: null, carbs: null },
      Ж: { ...NO_NUTRITION },
    },
    ingredients: [],
    source: '',
    portions: [],
    gerd: false,
    sourceIssues: [],
  }
  const read = () =>
    mealFromRow({ ...sqlite.prepare('SELECT * FROM meal').get() })

  const id = await insertMeal(db, 'f1', input)
  assert.equal(read().macrosApprox, false)

  sqlite.prepare('UPDATE meal SET calories_approx = 1, macros_approx = 1').run()
  await updateMeal(db, id, input, { calories: true, macros: false })
  assert.equal(read().caloriesApprox, false)
  assert.equal(read().macrosApprox, true)

  sqlite.prepare('UPDATE meal SET calories_approx = 1').run()
  await updateMeal(db, id, input, { calories: false, macros: true })
  assert.equal(read().caloriesApprox, true)
  assert.equal(read().macrosApprox, false)
})
