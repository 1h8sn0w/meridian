import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildCalendarDays, buildWeekView, manualSwapsAhead } from './model.ts'
import type { Meal, Row } from '@meridian/core'

const meal = (id: string, type: Meal['type'], calories: number): Meal => ({
  id,
  name: id,
  type,
  calories,
  caloriesApprox: false,
  protein: null,
  fat: null,
  carbs: null,
  ingredients: [],
  source: '',
  portions: [],
  gerd: false,
  sourceIssues: [],
})

const MEALS = new Map<string, Meal>([
  ['b', meal('b', 'breakfast', 300)],
  ['l', meal('l', 'lunch', 500)],
  ['s', meal('s', 'snack', 100)],
  ['d', meal('d', 'dinner', 400)],
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
