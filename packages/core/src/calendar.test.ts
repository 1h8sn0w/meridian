/**
 * Дати без UTC-зсувів (MER-31) і перенесення антиповтору через межу тижнів
 * (MER-29).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  addDays,
  dateKey,
  planSlots,
  precedingMealIds,
  precedingWindow,
  startOfWeek,
} from './calendar.ts'
import type { CalendarSlot } from './calendar.ts'

test('зсув дати не залежить від переведення годинників', () => {
  // Ніч на 29 березня 2026 — перехід на літній час у Києві: доба коротша за 24 год.
  assert.equal(addDays('2026-03-28', 1), '2026-03-29')
  assert.equal(addDays('2026-03-29', 1), '2026-03-30')
  assert.equal(addDays('2026-03-29', -1), '2026-03-28')
  // І назад восени.
  assert.equal(addDays('2026-10-25', 1), '2026-10-26')
})

test('зсув перетинає межі місяця, року й високосний день', () => {
  assert.equal(addDays('2026-01-31', 1), '2026-02-01')
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2027-01-01', -1), '2026-12-31')
  assert.equal(addDays('2028-02-28', 1), '2028-02-29')
  assert.equal(addDays('2026-02-28', 1), '2026-03-01')
  assert.equal(addDays('2026-08-07', 0), '2026-08-07')
})

test('тиждень починається з понеділка', () => {
  assert.equal(startOfWeek('2026-08-07'), '2026-08-03') // п’ятниця
  assert.equal(startOfWeek('2026-08-03'), '2026-08-03') // понеділок
  assert.equal(startOfWeek('2026-08-09'), '2026-08-03') // неділя
})

test('сміття замість дати — помилка, а не тиха підстановка', () => {
  assert.throws(() => addDays('07.08.2026', 1), /YYYY-MM-DD/)
  assert.throws(() => addDays('', 1), /YYYY-MM-DD/)
})

test('ключ дати береться з локального календаря, а не з UTC', () => {
  assert.equal(dateKey(new Date(2026, 7, 7, 23, 59)), '2026-08-07')
  assert.equal(dateKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01')
})

/* ==========================================================================
 * MER-29
 * ======================================================================== */

const slots: Array<CalendarSlot> = [
  { date: '2026-08-05', slot: 'breakfast', mealId: 'b-old' },
  { date: '2026-08-05', slot: 'lunch', mealId: 'l-old' },
  { date: '2026-08-06', slot: 'breakfast', mealId: 'b-yesterday' },
  { date: '2026-08-06', slot: 'dinner', mealId: 'd-yesterday' },
]

test('MER-29: попередні дні йдуть найближчим першим', () => {
  const preceding = precedingMealIds(slots, '2026-08-07', 2)
  assert.deepEqual(preceding, [
    ['b-yesterday', 'd-yesterday'],
    ['b-old', 'l-old'],
  ])
})

test('MER-29: день без записів дає порожній список, а не зсув позицій', () => {
  // 4 серпня в календарі немає — позиція має лишитись на своєму місці.
  const preceding = precedingMealIds(slots, '2026-08-07', 3)
  assert.deepEqual(preceding, [
    ['b-yesterday', 'd-yesterday'],
    ['b-old', 'l-old'],
    [],
  ])
})

test('вікно попередніх днів — це антиповтор мінус сам день 0', () => {
  assert.equal(precedingWindow(3), 2)
  assert.equal(precedingWindow(1), 0)
  assert.equal(precedingWindow(0), 0)
})

test('слоти тижня розкладаються по датах від старту', () => {
  const days = [
    {
      meals: {
        breakfast: { id: 'b0' },
        lunch: { id: 'l0' },
        dinner: { id: 'd0' },
        snack: { id: 's0' },
      },
    },
    {
      meals: {
        breakfast: { id: 'b1' },
        lunch: { id: 'l1' },
        dinner: { id: 'd1' },
        snack: { id: 's1' },
      },
    },
  ]
  const result = planSlots(days, '2026-08-07')
  assert.equal(result.length, 8)
  assert.deepEqual(result[0], {
    date: '2026-08-07',
    dayIndex: 0,
    slot: 'breakfast',
    mealId: 'b0',
  })
  assert.deepEqual(result[4], {
    date: '2026-08-08',
    dayIndex: 1,
    slot: 'breakfast',
    mealId: 'b1',
  })
})
