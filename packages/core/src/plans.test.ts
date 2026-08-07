/**
 * MER-30 — належність до планів структурно. Тут і живе той хибнопозитив, через
 * який тиждень зі страв одного плану виглядав «зміксованим».
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  isMixedWeek,
  mealPlans,
  mixPossibleIn,
  plansCovering,
  poolPlans,
  weekSources,
} from './plans.ts'
import { dayCalories } from './provenance.ts'
import type { Meal, MealType, PlanDay } from './types.ts'
import { meal } from './test-support.ts'

const plansOf = (source: string) =>
  mealPlans(meal({ id: 'x', type: 'lunch', source }))

/** День плану з довільних чотирьох страв — щоб перевіряти тиждень цілком. */
function day(meals: Record<MealType, Meal>): PlanDay {
  return { meals, calories: dayCalories(meals) }
}

function dayOf(sources: Record<MealType, string>): PlanDay {
  return day({
    breakfast: meal({ id: 'b', type: 'breakfast', source: sources.breakfast }),
    lunch: meal({ id: 'l', type: 'lunch', source: sources.lunch }),
    dinner: meal({ id: 'd', type: 'dinner', source: sources.dinner }),
    snack: meal({ id: 's', type: 'snack', source: sources.snack }),
  })
}

test('одне джерело — один план', () => {
  assert.deepEqual(plansOf('Тиждень 1'), new Set(['Тиждень 1']))
  assert.deepEqual(plansOf('План №2'), new Set(['План №2']))
})

test('діапазон у підписі розгортається в усі свої плани', () => {
  assert.deepEqual(plansOf('Тиждень 1–2'), new Set(['Тиждень 1', 'Тиждень 2']))
  assert.deepEqual(
    plansOf('Тиждень 1-3'),
    new Set(['Тиждень 1', 'Тиждень 2', 'Тиждень 3']),
  )
})

test('страва без джерела належить будь-якому плану (wildcard)', () => {
  assert.equal(plansOf(''), null)
  assert.equal(plansOf('   '), null)
})

test('абсурдний діапазон не розгортається — беремо підпис як є', () => {
  assert.deepEqual(plansOf('Тиждень 1–99'), new Set(['Тиждень 1–99']))
  assert.deepEqual(plansOf('Тиждень 5–2'), new Set(['Тиждень 5–2']))
})

test('MER-30: спільний десерт не додає третього плану до universe', () => {
  const pool = [
    meal({ id: 'a', type: 'lunch', source: 'Тиждень 1' }),
    meal({ id: 'b', type: 'snack', source: 'Тиждень 1–2' }),
  ]
  assert.deepEqual(poolPlans(pool), new Set(['Тиждень 1', 'Тиждень 2']))
  // «Тиждень 1» покриває обидві страви — отже, мікс неможливий.
  assert.deepEqual(plansCovering(pool, poolPlans(pool)), new Set(['Тиждень 1']))
  assert.equal(mixPossibleIn(pool), false)
})

test('мікс можливий, лише коли жоден план не покриває весь пул', () => {
  const pool = [
    meal({ id: 'a', type: 'lunch', source: 'Тиждень 1' }),
    meal({ id: 'b', type: 'dinner', source: 'Тиждень 2' }),
  ]
  assert.equal(mixPossibleIn(pool), true)
  assert.equal(plansCovering(pool, poolPlans(pool)).size, 0)
})

test('пул без джерел міксу не дає — планів немає взагалі', () => {
  const pool = [
    meal({ id: 'a', type: 'lunch' }),
    meal({ id: 'b', type: 'dinner' }),
  ]
  assert.equal(poolPlans(pool).size, 0)
  assert.equal(mixPossibleIn(pool), false)
})

test('MER-30: тиждень із «Тиждень 1» + спільний десерт не зміксований', () => {
  const universe = new Set(['Тиждень 1', 'Тиждень 2'])
  const week = [
    dayOf({
      breakfast: 'Тиждень 1',
      lunch: 'Тиждень 1',
      dinner: 'Тиждень 1',
      snack: 'Тиждень 1–2',
    }),
  ]
  assert.equal(isMixedWeek(week, universe), false)
})

test('тиждень зі страв обох планів — зміксований', () => {
  const universe = new Set(['Тиждень 1', 'Тиждень 2'])
  const week = [
    dayOf({
      breakfast: 'Тиждень 1',
      lunch: 'Тиждень 2',
      dinner: 'Тиждень 1',
      snack: 'Тиждень 1–2',
    }),
  ]
  assert.equal(isMixedWeek(week, universe), true)
})

test('підписи джерел для показу лишаються «сирими» й відсортованими', () => {
  const week = [
    dayOf({
      breakfast: 'Тиждень 2',
      lunch: 'Тиждень 1',
      dinner: '',
      snack: 'Тиждень 1–2',
    }),
  ]
  assert.deepEqual(weekSources(week), ['Тиждень 1', 'Тиждень 1–2', 'Тиждень 2'])
})
