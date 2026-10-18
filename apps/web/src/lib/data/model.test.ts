import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  antiRepeatDaysFromRow,
  buildCalendarDays,
  buildWeekView,
  manualSwapsAhead,
  snackSettingDrift,
  toWeekPlan,
  windowsInPlan,
} from './model.ts'
import { DEFAULT_MEAL_WINDOWS as WINDOWS } from '../day-clock.ts'
import { testMeal } from './test-fixtures.ts'
import type { Meal, Row } from '@meridian/core'

const MEALS = new Map<string, Meal>([
  ['b', testMeal('b', 'breakfast', 300)],
  ['l', testMeal('l', 'lunch', 500)],
  ['s', testMeal('s', 'snack', 100)],
  ['d', testMeal('d', 'dinner', 400)],
])

const slot = (
  id: string,
  date: string,
  dayIndex: number,
  type: string,
  mealId: string,
): Row => ({ id, date, day_index: dayIndex, slot: type, meal_id: mealId })

const ROWS: Array<Row> = [
  slot('1', '2026-09-01', 0, 'breakfast', 'b'),
  slot('2', '2026-09-01', 0, 'lunch', 'l'),
  slot('3', '2026-09-01', 0, 'dinner', 'gone'),
  slot('4', '2026-09-01', 0, 'brunch', 'b'),
  slot('5', '2026-09-02', 1, 'dinner', 'd'),
  slot('6', '2026-09-02', 1, 'snack', 's'),
  slot('7', '2026-09-02', 1, 'breakfast', 'b'),
  slot('8', '2026-09-02', 1, 'lunch', 'l'),
]

const PLAN: Row = { id: 'w', profile_id: 'p', start_date: '2026-09-01' }

test('«Тиждень» і «Календар» дають ті самі слоти й калорії', () => {
  const week = buildWeekView(PLAN, ROWS, MEALS, '2026-09-02')
  const calendar = buildCalendarDays(ROWS, MEALS)

  assert.deepEqual(
    week.days.map((day) => day.date),
    ['2026-09-01', '2026-09-02'],
  )
  assert.equal(calendar.size, week.days.length)

  for (const day of week.days) {
    const same = calendar.get(day.date)
    assert.ok(same, `календар не знає день ${day.date}`)
    assert.deepEqual(same.slots, day.slots)
    assert.deepEqual(same.calories, day.calories)
  }
})

test('порядок слотів хронологічний, а не той, у якому приїхали рядки', () => {
  const day = buildCalendarDays(ROWS, MEALS).get('2026-09-02')
  assert.deepEqual(
    day?.slots.map((view) => view.slot),
    ['breakfast', 'lunch', 'snack', 'dinner'],
  )
})

test('дірка в плані рахується, а чужий тип слота — ні', () => {
  const week = buildWeekView(PLAN, ROWS, MEALS, '2026-09-02')
  assert.equal(week.missing, 1)
  assert.deepEqual(
    week.days[0]?.slots.map((view) => view.slot),
    ['breakfast', 'lunch', 'dinner'],
  )
  assert.equal(week.days[0]?.byType.dinner?.meal, null)
  assert.equal(week.days[0]?.dayIndex, 0)
  assert.equal(week.days[0]?.isPast, true)
  assert.equal(week.days[1]?.isToday, true)
})

test('ручні заміни рахуються лише в сьогоднішньому й наступних днях', () => {
  const rows: Array<Row> = [
    { ...slot('1', '2026-09-01', 0, 'breakfast', 'b'), swapped: 1 },
    { ...slot('2', '2026-09-02', 1, 'breakfast', 'b'), swapped: 1 },
    { ...slot('3', '2026-09-02', 1, 'lunch', 'l'), swapped: 0 },
    { ...slot('4', '2026-09-03', 2, 'dinner', 'd'), swapped: 1 },
  ]
  const week = buildWeekView(PLAN, rows, MEALS, '2026-09-02')
  assert.equal(manualSwapsAhead(week), 2)
  assert.equal(week.days[0]?.byType.breakfast?.swapped, true)
})

test('слот, що приїхав без колонки swapped (до міграції), — не ручна заміна', () => {
  const week = buildWeekView(PLAN, ROWS, MEALS, '2026-09-01')
  assert.equal(manualSwapsAhead(week), 0)
})

test("антиповтор сім'ї: NULL — стандартний, 1–7 — як є, решта — помилка", () => {
  assert.equal(antiRepeatDaysFromRow({ anti_repeat_days: null }), null)
  assert.equal(antiRepeatDaysFromRow({}), null)
  assert.equal(antiRepeatDaysFromRow({ anti_repeat_days: 1 }), 1)
  assert.equal(antiRepeatDaysFromRow({ anti_repeat_days: 7 }), 7)
  for (const broken of [0, 8, 2.5, '3']) {
    assert.throws(
      () => antiRepeatDaysFromRow({ anti_repeat_days: broken }),
      /Антиповтор/,
      String(broken),
    )
  }
})

const NO_SNACK_ROWS: Array<Row> = [
  slot('1', '2026-09-01', 0, 'breakfast', 'b'),
  slot('2', '2026-09-01', 0, 'lunch', 'l'),
  slot('3', '2026-09-01', 0, 'dinner', 'd'),
]

test('план без перекусу ховає вікно перекусу, а без плану вікна лишаються всі', () => {
  const week = buildWeekView(PLAN, NO_SNACK_ROWS, MEALS, '2026-09-01')
  assert.deepEqual(
    windowsInPlan(WINDOWS, week).map((w) => w.type),
    ['breakfast', 'lunch', 'dinner'],
  )
  const full = buildWeekView(PLAN, ROWS, MEALS, '2026-09-02')
  assert.equal(windowsInPlan(WINDOWS, full).length, 4)
  assert.equal(windowsInPlan(WINDOWS, null), WINDOWS)
})

test('перекус, увімкнений чи вимкнений після генерації, помітний за слотами плану', () => {
  const noSnack = buildWeekView(PLAN, NO_SNACK_ROWS, MEALS, '2026-09-01')
  const withSnack = buildWeekView(PLAN, ROWS, MEALS, '2026-09-02')
  assert.equal(snackSettingDrift(noSnack, { withSnack: true }), 'on')
  assert.equal(snackSettingDrift(withSnack, { withSnack: false }), 'off')
  assert.equal(snackSettingDrift(noSnack, { withSnack: false }), null)
  assert.equal(snackSettingDrift(withSnack, { withSnack: true }), null)
  assert.equal(snackSettingDrift(withSnack, null), null)
  const empty = buildWeekView(PLAN, [], MEALS, '2026-09-01')
  assert.equal(snackSettingDrift(empty, { withSnack: true }), null)
})

test('день без перекусу стає днем плану для заміни, а дірка в слоті — ні', () => {
  const week = buildWeekView(PLAN, NO_SNACK_ROWS, MEALS, '2026-09-01')
  const plan = toWeekPlan(week, null)
  assert.ok(plan)
  assert.deepEqual(Object.keys(plan.days[0]?.meals ?? {}), [
    'breakfast',
    'lunch',
    'dinner',
  ])
  assert.deepEqual(plan.days[0]?.calories, {
    total: 1200,
    unknown: 0,
    approx: false,
  })
  assert.equal(
    toWeekPlan(buildWeekView(PLAN, ROWS, MEALS, '2026-09-01'), null),
    null,
  )
})
