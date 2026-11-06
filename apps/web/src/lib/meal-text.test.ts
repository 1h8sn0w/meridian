import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import type { Ingredient } from '@meridian/core'

import { LOCALES, setLocale } from './i18n/locale.ts'
import type { Locale } from './i18n/locale.ts'
import {
  ingredientLabel,
  ingredientsFromText,
  ingredientsToText,
  portionForLetter,
  portionsFromText,
  portionsToText,
} from './meal-text.ts'

Object.assign(globalThis, {
  window: { localStorage: { setItem() {} } },
  document: { documentElement: {} },
})

afterEach(() => setLocale('uk'))

const ingredients: Array<Ingredient> = [
  { name: 'молоко', amount: 999, unit: 'мл' },
  { name: 'вода', amount: 1000, unit: 'мл' },
  { name: 'борошно', amount: 1500, unit: 'г' },
  { name: 'бульйон', amount: 1000.5, unit: 'мл' },
  { name: 'олія', amount: 1.5, unit: 'ст. л.' },
  { name: 'яйця', amount: 2 },
  { name: 'сіль', unit: 'за смаком' },
  'зелень на смак',
]

for (const locale of LOCALES) {
  test(`${locale}: кількості з форми повертаються після збереження без змін`, () => {
    setLocale(locale)
    assert.deepEqual(
      ingredientsFromText(ingredientsToText(ingredients)),
      ingredients,
    )
  })
}

test('поле форми пише кількість без розрядів однаково в усіх мовах', () => {
  const texts = LOCALES.map((locale: Locale) => {
    setLocale(locale)
    return ingredientsToText(ingredients.slice(1, 4))
  })
  for (const text of texts)
    assert.equal(text, 'вода — 1000 мл\nборошно — 1500 г\nбульйон — 1000.5 мл')
})

test('кількість, введену з пробілом між розрядами, читаємо як одне число', () => {
  assert.deepEqual(
    ingredientsFromText(
      'борошно — 1 500 г\nвода — 1\u00A0000 мл\nцукор — 2 000,5 г\nсік — 1,5 л',
    ),
    [
      { name: 'борошно', amount: 1500, unit: 'г' },
      { name: 'вода', amount: 1000, unit: 'мл' },
      { name: 'цукор', amount: 2000.5, unit: 'г' },
      { name: 'сік', amount: 1.5, unit: 'л' },
    ],
  )
})

test('показ інгредієнта — числом мовою інтерфейсу', () => {
  const flour: Ingredient = { name: 'flour', amount: 1500, unit: 'g' }
  setLocale('en')
  assert.equal(ingredientLabel(flour), 'flour — 1,500 g')
  assert.equal(ingredientsToText([flour]), 'flour — 1500 g')
  setLocale('uk')
  assert.equal(ingredientLabel(flour), 'flour — 1\u00A0500 g')
})

test('порція Ж/Ч: частина своєї літери, а нерозкладний текст — null', () => {
  assert.equal(portionForLetter('Ж — 130 г; Ч — 180 г', 'Ч'), 'Ч — 180 г')
  assert.equal(portionForLetter('Ж – 1 шт.', 'Ж'), 'Ж – 1 шт.')
  assert.equal(portionForLetter('Ж — 130 г', 'Ч'), null)
  assert.equal(portionForLetter('130 г', 'Ж'), null)
  assert.equal(portionForLetter('', 'Ж'), null)
})

test('порції з тексту форми: складник до « — », рядок «Ж — …» — текст порції', () => {
  const text = 'каша — Ж — 130 г; Ч — 180 г\nЖ — 130 г\n\nпо 1 шт.'
  const portions = portionsFromText(text)
  assert.deepEqual(portions, [
    { component: 'каша', text: 'Ж — 130 г; Ч — 180 г' },
    { component: null, text: 'Ж — 130 г' },
    { component: null, text: 'по 1 шт.' },
  ])
  assert.deepEqual(portionsFromText(portionsToText(portions)), portions)
})
