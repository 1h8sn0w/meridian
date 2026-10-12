import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_MEAL_HOURS,
  DEFAULT_MEAL_WINDOWS,
  mealHoursFromRow,
  mealHoursProblems,
  mealWindows,
  phaseAt,
  sameMealHours,
  slotAt,
} from './day-clock.ts'
import type { MealHours } from './day-clock.ts'

const EARLY: MealHours = {
  breakfast: { start: 5 * 60, end: 7 * 60 },
  lunch: { start: 12 * 60, end: 13 * 60 + 30 },
  dinner: { start: 17 * 60, end: 19 * 60 },
}

const row = (hours: MealHours | null) => ({
  breakfast_start: hours?.breakfast.start ?? null,
  breakfast_end: hours?.breakfast.end ?? null,
  lunch_start: hours?.lunch.start ?? null,
  lunch_end: hours?.lunch.end ?? null,
  dinner_start: hours?.dinner.start ?? null,
  dinner_end: hours?.dinner.end ?? null,
})

test('стандартні вікна — ті самі, що були зашиті з V1, і проходять валідацію', () => {
  assert.deepEqual(
    DEFAULT_MEAL_WINDOWS.map((w) => [w.type, w.startMinute, w.endMinute]),
    [
      ['breakfast', 360, 660],
      ['lunch', 660, 900],
      ['dinner', 1080, 1320],
      ['snack', 900, 1080],
    ],
  )
  assert.deepEqual(mealHoursProblems(DEFAULT_MEAL_HOURS), {})
  assert.ok(
    sameMealHours(structuredClone(DEFAULT_MEAL_HOURS), DEFAULT_MEAL_HOURS),
  )
  assert.ok(!sameMealHours(EARLY, DEFAULT_MEAL_HOURS))
})

test('перекус — проміжок між кінцем обіду й початком вечері', () => {
  const snack = mealWindows(EARLY).find((w) => w.type === 'snack')
  assert.deepEqual(
    [snack?.startMinute, snack?.endMinute],
    [13 * 60 + 30, 17 * 60],
  )
  assert.equal(
    mealWindows({ ...EARLY, lunch: { start: 12 * 60, end: 17 * 60 } }).some(
      (w) => w.type === 'snack',
    ),
    false,
    'обід упритул до вечері лишає перекус без вікна',
  )
})

test('поточний прийом і фаза неба визначаються власними вікнами', () => {
  const windows = mealWindows(EARLY)
  assert.equal(slotAt(5 * 60 + 15, windows).type, 'breakfast')
  assert.equal(
    slotAt(5 * 60 + 15, DEFAULT_MEAL_WINDOWS).type,
    null,
    'стандартний сніданок ще не почався',
  )
  assert.equal(slotAt(7 * 60, windows).type, null, 'кінець вікна не входить')
  assert.equal(slotAt(7 * 60, windows).next?.type, 'lunch')
  assert.equal(slotAt(14 * 60, windows).type, 'snack')
  assert.equal(phaseAt(18 * 60, windows), 'dusk')
  assert.equal(phaseAt(20 * 60, windows), 'night')
  assert.equal(
    slotAt(20 * 60, windows).next?.type,
    'breakfast',
    'після вечері — завтрашній сніданок',
  )
})

test('валідація: початок раніше за кінець', () => {
  const problems = mealHoursProblems({
    ...EARLY,
    lunch: { start: 13 * 60, end: 13 * 60 },
  })
  assert.deepEqual(Object.keys(problems), ['lunch'])
  assert.match(problems.lunch ?? '', /Початок має бути раніше за кінець/)
})

test('валідація: вікна не перетинаються й ідуть у порядку сніданок → обід → вечеря', () => {
  const overlap = mealHoursProblems({
    ...EARLY,
    lunch: { start: 6 * 60 + 30, end: 13 * 60 },
  })
  assert.deepEqual(Object.keys(overlap), ['lunch'])
  assert.equal(
    overlap.lunch,
    'Обід має починатися не раніше за кінець сніданку (07:00).',
  )

  const reversed = mealHoursProblems({
    ...EARLY,
    dinner: { start: 8 * 60, end: 9 * 60 },
  })
  assert.deepEqual(Object.keys(reversed), ['dinner'])

  assert.deepEqual(
    mealHoursProblems({ ...EARLY, lunch: { start: 7 * 60, end: 17 * 60 } }),
    {},
    'упритул — не перетин',
  )
})

test('валідація: межі доби й крок 15 хвилин', () => {
  assert.deepEqual(
    Object.keys(
      mealHoursProblems({
        ...EARLY,
        breakfast: { start: 5 * 60 + 10, end: 7 * 60 },
      }),
    ),
    ['breakfast'],
  )
  assert.deepEqual(
    Object.keys(
      mealHoursProblems({ ...EARLY, dinner: { start: 17 * 60, end: 1455 } }),
    ),
    ['dinner'],
  )
  assert.deepEqual(
    mealHoursProblems({ ...EARLY, dinner: { start: 17 * 60, end: 1440 } }),
    {},
    'вечеря може тривати до 24:00',
  )
})

test('рядок налаштувань: порожній — стандартні вікна, повний — свої, битий — помилка', () => {
  assert.equal(mealHoursFromRow(row(null)), null)
  assert.deepEqual(mealHoursFromRow(row(EARLY)), EARLY)
  assert.throws(
    () => mealHoursFromRow({ ...row(EARLY), lunch_end: null }),
    /не повністю/,
  )
  assert.throws(
    () =>
      mealHoursFromRow(
        row({ ...EARLY, lunch: { start: 6 * 60, end: 13 * 60 } }),
      ),
    /не раніше за кінець сніданку/,
  )
})
