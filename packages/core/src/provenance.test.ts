/**
 * Три поведінки модуля провенансу (розділ 6 інструкції каркаса) + підрахунок
 * калорійності дня. Головне, що тут перевіряється: нуль ≠ «невідомо», і жодне
 * порожнє значення не перетворюється на правдоподібне.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  dayCalories,
  formatCalories,
  formatDayCalories,
  formatMacro,
  formatMealCalories,
  hasMacros,
  hasValue,
  optionalNumber,
} from './provenance.ts'
import { meal } from './test-support.ts'

/* ==========================================================================
 * 1 · Чи значення справді є
 * ======================================================================== */

test('порожнє, відсутнє й NaN однаково означають «немає»', () => {
  for (const value of [null, undefined, '', '   ', Number.NaN, Infinity, []]) {
    assert.equal(
      hasValue(value),
      false,
      JSON.stringify(value) + ' мало бути «немає»',
    )
  }
})

test('нуль і false — справжні значення, а не порожнеча', () => {
  assert.equal(hasValue(0), true)
  assert.equal(hasValue(false), true)
  assert.equal(hasValue('0'), true)
  assert.equal(hasValue([0]), true)
})

test('optionalNumber: порожнє → null, число → число, від’ємне → помилка', () => {
  assert.equal(optionalNumber(''), null)
  assert.equal(optionalNumber(null), null)
  assert.equal(optionalNumber(undefined), null)
  assert.equal(optionalNumber('не число'), null)
  assert.equal(optionalNumber(0), 0)
  assert.equal(optionalNumber('185'), 185)
  assert.equal(optionalNumber(12.5), 12.5)
  assert.throws(() => optionalNumber(-1), /невід'ємне число/)
})

/* ==========================================================================
 * 2 · Секція БЖВ
 * ======================================================================== */

test('секція БЖВ показується, якщо є хоч одне з трьох', () => {
  assert.equal(hasMacros({ protein: 38, fat: null, carbs: null }), true)
  assert.equal(hasMacros({ protein: null, fat: 14.5, carbs: null }), true)
  assert.equal(hasMacros({ protein: null, fat: null, carbs: 60 }), true)
  // Нуль — це значення: секцію показуємо.
  assert.equal(hasMacros({ protein: 0, fat: null, carbs: null }), true)
})

test('секція БЖВ ховається цілком, якщо немає жодного', () => {
  assert.equal(hasMacros({ protein: null, fat: null, carbs: null }), false)
})

test('пропуск усередині показаної секції — «—», а не нуль', () => {
  assert.equal(formatMacro(null), '—')
  assert.equal(formatMacro(undefined), '—')
  assert.equal(formatMacro(0), '0')
  assert.equal(formatMacro(38), '38')
})

/* ==========================================================================
 * 3 · Форматування калорій
 * ======================================================================== */

test('калорійності немає — порожньо, а не «0 ккал»', () => {
  assert.equal(formatCalories(null), '')
  assert.equal(formatCalories(undefined), '')
  assert.equal(formatCalories(Number.NaN), '')
  assert.equal(formatCalories(null, true), '')
})

test('MER-26: «≈» лише коли піднято прапорець приблизності', () => {
  assert.equal(formatCalories(185, false), '185 ккал')
  assert.equal(formatCalories(460, true), '≈460 ккал')
  // Банановий хліб — єдина цифра з PDF, тож без «≈».
  assert.equal(
    formatMealCalories(
      meal({ id: 'demo-wb-s2', type: 'snack', calories: 185 }),
    ),
    '185 ккал',
  )
  assert.equal(
    formatMealCalories(
      meal({
        id: 'demo-l1',
        type: 'lunch',
        calories: 850,
        caloriesApprox: true,
      }),
    ),
    '≈850 ккал',
  )
})

test('нуль калорій — це «0 ккал», а не порожньо', () => {
  assert.equal(formatCalories(0), '0 ккал')
})

/* ==========================================================================
 * Калорійність дня
 * ======================================================================== */

test('денна сума рахує лише відомі значення й каже, скільки їх бракує', () => {
  const day = {
    breakfast: meal({ id: 'b', type: 'breakfast', calories: 400 }),
    lunch: meal({ id: 'l', type: 'lunch', calories: 600 }),
    dinner: meal({ id: 'd', type: 'dinner', calories: null }),
    snack: meal({ id: 's', type: 'snack', calories: 300 }),
  }
  assert.deepEqual(dayCalories(day), { total: 1300, unknown: 1, approx: false })
})

test('приблизна складова робить приблизною всю денну суму', () => {
  const day = {
    breakfast: meal({
      id: 'b',
      type: 'breakfast',
      calories: 400,
      caloriesApprox: true,
    }),
    lunch: meal({ id: 'l', type: 'lunch', calories: 600 }),
    dinner: meal({ id: 'd', type: 'dinner', calories: 700 }),
    snack: meal({ id: 's', type: 'snack', calories: 300 }),
  }
  const sum = dayCalories(day)
  assert.deepEqual(sum, { total: 2000, unknown: 0, approx: true })
  assert.equal(formatDayCalories(sum), '≈2000 ккал')
})

test('неповна сума не маркується через «≈» — це різні речі', () => {
  const partial = { total: 1300, unknown: 1, approx: false }
  assert.equal(formatDayCalories(partial), '1300 ккал')
  // Не відома жодна складова — показувати нічого.
  assert.equal(formatDayCalories({ total: 0, unknown: 4, approx: false }), '')
})
