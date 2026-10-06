/**
 * Список покупок текстом (MER-85). Ламається він тихо: людина в магазині не
 * знає, що позиції бракує, — тож перевіряємо саме те, що потрапляє в текст.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { ShoppingItem } from '@meridian/core'
import { shoppingListText } from './shopping-share.ts'

const item = (
  key: string,
  name: string,
  category: string,
  amount: number | null = null,
  unit: string | null = null,
): ShoppingItem => ({ key, name, category, amount, unit })

const withQty = [
  item('q:морква|г', 'Морква', 'veg', 300, 'г'),
  item('q:яйця|шт', 'Яйця', 'dairy', 6, 'шт'),
  item('q:гречка|г', 'Гречка', 'grain', 1500, 'г'),
]
const noQty = [item('n:кріп', 'Кріп', 'veg'), item('n:сіль', 'Сіль', 'pantry')]

test('розділи в порядку екрана, кількість лише там, де вона є', () => {
  assert.equal(
    shoppingListText({
      range: '6–12 жовт. 2026',
      withQty,
      noQty,
      checks: new Map(),
    }),
    [
      'Список покупок · 6–12 жовт. 2026',
      '',
      'Овочі та зелень',
      '• Морква — 300 г',
      '',
      'Молочне та яйця',
      '• Яйця — 6 шт',
      '',
      'Крупи та бобові',
      // Розділювач розрядів — з локалі (нерозривний пробіл), як на екрані.
      `• Гречка — ${(1500).toLocaleString('uk-UA')} г`,
      '',
      'Без точної кількості',
      '• Кріп',
      '• Сіль',
    ].join('\n'),
  )
})

test('куплене в текст не потрапляє, порожній розділ зникає', () => {
  const text = shoppingListText({
    range: '',
    withQty,
    noQty,
    checks: new Map([
      ['q:яйця|шт', true],
      ['n:кріп', true],
      ['q:морква|г', false],
    ]),
  })
  assert.doesNotMatch(text, /Яйця|Молочне|Кріп/)
  assert.match(text, /^Список покупок\n/)
  assert.match(text, /• Морква — 300 г/)
  assert.match(text, /Без точної кількості\n• Сіль$/)
})

test('усе куплено — ділитися нічим', () => {
  const checks = new Map(
    [...withQty, ...noQty].map((entry) => [entry.key, true]),
  )
  assert.equal(shoppingListText({ range: '', withQty, noQty, checks }), '')
})
