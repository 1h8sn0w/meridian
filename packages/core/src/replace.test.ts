/**
 * MER-12 / MER-28 — ручна заміна: кандидати з чесними позначками валідності й
 * застосування заміни без мутації плану.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { generateWeek } from './generator.ts'
import { replaceSlot, suggestReplacements } from './replace.ts'
import { MEAL_TYPES } from './types.ts'
import type { Meal, MealType, WeekPlan } from './types.ts'
import { meal, mixedPool, prefs, seeded } from './test-support.ts'

function plan(pool: Array<Meal>, targetCalories = 2050): WeekPlan {
  const result = generateWeek(pool, {
    targetCalories,
    corridor: 100,
    random: seeded(101),
  })
  assert.ok(result.ok, result.ok ? '' : result.error)
  return result
}

test('кандидати — лише страви того ж слота, без поточної', () => {
  const pool = mixedPool()
  const week = plan(pool)
  const result = suggestReplacements(pool, week, 2, 'lunch')
  assert.ok(result.ok, result.ok ? '' : result.error)

  assert.equal(result.current.id, week.days[2]?.meals.lunch.id)
  assert.ok(result.candidates.length > 0)
  for (const candidate of result.candidates) {
    assert.equal(candidate.meal.type, 'lunch')
    assert.notEqual(candidate.meal.id, result.current.id)
  }
})

test('MER-28: порушення названі поіменно, а кандидат позначений невалідним', () => {
  const pool = mixedPool()
  // Обід, який гарантовано вибиває день із коридору ±100.
  pool.push(
    meal({
      id: 'lunch-huge',
      type: 'lunch',
      calories: 1600,
      source: 'Тиждень 2',
    }),
  )
  const week = plan(pool)
  const result = suggestReplacements(pool, week, 3, 'lunch')
  assert.ok(result.ok, result.ok ? '' : result.error)

  const huge = result.candidates.find((c) => c.meal.id === 'lunch-huge')
  assert.ok(huge, 'кандидата не знайдено')
  assert.equal(huge.withinCorridor, false)
  assert.equal(huge.valid, false)
  assert.ok(huge.reasons.includes('поза коридором'))
})

test('MER-28: повтор у сусідньому дні позначається, а не мовчки дозволяється', () => {
  const pool = mixedPool()
  const week = plan(pool)
  const neighbourId = week.days[2]?.meals.lunch.id as string

  const result = suggestReplacements(pool, week, 3, 'lunch')
  assert.ok(result.ok, result.ok ? '' : result.error)
  const neighbour = result.candidates.find((c) => c.meal.id === neighbourId)
  assert.ok(neighbour, 'сусідній обід мав бути серед кандидатів')
  assert.equal(neighbour.repeatSoon, true)
  assert.equal(neighbour.valid, false)
  assert.ok(neighbour.reasons.includes('повтор поруч'))
})

test('валідні кандидати стоять першими', () => {
  const pool = mixedPool()
  const week = plan(pool)
  const result = suggestReplacements(pool, week, 4, 'dinner')
  assert.ok(result.ok, result.ok ? '' : result.error)

  const validity = result.candidates.map((c) => c.valid)
  const firstInvalid = validity.indexOf(false)
  if (firstInvalid !== -1) {
    assert.ok(
      !validity.slice(firstInvalid).includes(true),
      'валідний кандидат опинився після невалідного',
    )
  }
})

test('MER-18: смак впливає лише на порядок і позначку, не на валідність', () => {
  const pool = mixedPool()
  const week = plan(pool)
  const disliked = pool.find(
    (m) => m.type === 'snack' && m.id !== week.days[0]?.meals.snack.id,
  ) as Meal

  const neutral = suggestReplacements(pool, week, 0, 'snack')
  const tasted = suggestReplacements(
    pool,
    week,
    0,
    'snack',
    prefs([], [disliked.id]),
  )
  assert.ok(neutral.ok && tasted.ok)

  const before = neutral.candidates.find((c) => c.meal.id === disliked.id)
  const after = tasted.candidates.find((c) => c.meal.id === disliked.id)
  assert.ok(before && after)
  assert.equal(after.disliked, true)
  assert.equal(after.valid, before.valid, 'смак не має змінювати валідність')
})

test('страву без калорійності в кандидати не пускаємо', () => {
  const pool = mixedPool()
  pool.push(meal({ id: 'no-kcal', type: 'dinner', calories: null }))
  const week = plan(pool)
  const result = suggestReplacements(pool, week, 1, 'dinner')
  assert.ok(result.ok, result.ok ? '' : result.error)
  assert.ok(!result.candidates.some((c) => c.meal.id === 'no-kcal'))
})

test('неіснуючий день і невідомий слот — зрозуміла відмова', () => {
  const pool = mixedPool()
  const week = plan(pool)

  const noDay = suggestReplacements(pool, week, 42, 'lunch')
  assert.equal(noDay.ok, false)
  assert.match(noDay.error, /немає дня №43/)

  const noSlot = suggestReplacements(
    pool,
    week,
    0,
    'brunch' as unknown as 'lunch',
  )
  assert.equal(noSlot.ok, false)
  assert.match(noSlot.error, /Невідомий тип слота/)
})

/* ==========================================================================
 * Застосування заміни
 * ======================================================================== */

test('заміна повертає новий план і не чіпає вхідний', () => {
  const pool = mixedPool()
  const week = plan(pool)
  const before = structuredClone(week)

  const target = pool.find(
    (m) => m.type === 'lunch' && m.id !== week.days[1]?.meals.lunch.id,
  ) as Meal
  const result = replaceSlot(week, 1, 'lunch', target)
  assert.ok(result.ok, result.ok ? '' : result.error)

  assert.equal(result.plan.days[1]?.meals.lunch.id, target.id)
  assert.deepEqual(week, before, 'вхідний план мутовано')
  // Решта днів — ті самі об'єкти: заміна торкається одного дня.
  assert.equal(result.plan.days[0], week.days[0])
})

test('калорійність дня після заміни перерахована', () => {
  const pool = mixedPool()
  const week = plan(pool)
  const target = pool.find(
    (m) => m.type === 'snack' && m.id !== week.days[2]?.meals.snack.id,
  ) as Meal

  const result = replaceSlot(week, 2, 'snack', target)
  assert.ok(result.ok, result.ok ? '' : result.error)

  const day = result.plan.days[2]
  assert.ok(day)
  const expected = MEAL_TYPES.reduce(
    (sum, type) => sum + (day.meals[type].calories as number),
    0,
  )
  assert.equal(day.calories.total, expected)
  assert.equal(day.calories.unknown, 0)
})

test('набір джерел після заміни перераховується чесно', () => {
  /* План з одного дня, увесь із «Тиждень 1». Ставимо в обід страву «Тиждень 2»
   * — джерело має з'явитись; повертаємо назад — має зникнути. Тиждень тут
   * зібраний руками, а не генератором: інакше правило міксу саме затягнуло б у
   * план другий план, і перевірка вимірювала б не те. */
  const one = (type: MealType, id: string, source: string) =>
    meal({ id, type, calories: 500, source })

  const meals: Record<MealType, Meal> = {
    breakfast: one('breakfast', 'b1', 'Тиждень 1'),
    lunch: one('lunch', 'l1', 'Тиждень 1'),
    dinner: one('dinner', 'd1', 'Тиждень 1'),
    snack: one('snack', 's1', 'Тиждень 1'),
  }
  const week: WeekPlan = {
    days: [{ meals, calories: { total: 2000, unknown: 0, approx: false } }],
    params: { targetCalories: 2000, corridor: 100, antiRepeatDays: 1, days: 1 },
    usedCorridor: 100,
    sources: ['Тиждень 1'],
    mixed: false,
    mixPossible: false,
    warnings: [],
  }

  const odd = one('lunch', 'l2', 'Тиждень 2')
  const patched = replaceSlot(week, 0, 'lunch', odd)
  assert.ok(patched.ok, patched.ok ? '' : patched.error)
  assert.deepEqual(patched.plan.sources, ['Тиждень 1', 'Тиждень 2'])

  const reverted = replaceSlot(patched.plan, 0, 'lunch', meals.lunch)
  assert.ok(reverted.ok, reverted.ok ? '' : reverted.error)
  assert.deepEqual(reverted.plan.sources, ['Тиждень 1'])
})

test('страва чужого типу в слот не стає', () => {
  const pool = mixedPool()
  const week = plan(pool)
  const dinner = pool.find((m) => m.type === 'dinner') as Meal

  const result = replaceSlot(week, 0, 'lunch', dinner)
  assert.equal(result.ok, false)
  assert.match(result.error, /це вечеря, а слот — «Обід»/)
})
