import { test } from 'node:test'
import assert from 'node:assert/strict'

import { inShoppingPeriod, shoppingPeriodOf } from './shopping-period.ts'
import type { ShoppingPeriod } from './shopping-period.ts'

const today = '2026-10-30'
const week = [
  '2026-10-27',
  '2026-10-29',
  '2026-10-30',
  '2026-10-31',
  '2026-11-01',
  '2026-11-02',
]

const kept = (period: ShoppingPeriod) =>
  week.filter((date) => inShoppingPeriod(date, period, today))

test('увесь план лишає й прожиті дні', () => {
  assert.deepEqual(kept('all'), week)
})

test('з сьогодні — без прожитих днів, сьогодні входить', () => {
  assert.deepEqual(kept('fromToday'), [
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
    '2026-11-02',
  ])
})

test('на 3 дні — сьогодні й два наступні, через межу місяця', () => {
  assert.deepEqual(kept('threeDays'), [
    '2026-10-30',
    '2026-10-31',
    '2026-11-01',
  ])
})

test('збережене невідоме значення чи порожньо — увесь план', () => {
  assert.equal(shoppingPeriodOf(null), 'all')
  assert.equal(shoppingPeriodOf('nextWeek'), 'all')
  assert.equal(shoppingPeriodOf('threeDays'), 'threeDays')
})
