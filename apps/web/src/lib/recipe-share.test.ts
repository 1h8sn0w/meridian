import { test } from 'node:test'
import assert from 'node:assert/strict'

import { recipeText } from './recipe-share.ts'

const meal = {
  name: 'Гречка з овочами',
  ingredients: [
    { name: 'гречка', amount: 80, unit: 'г' },
    { name: 'олія', amount: 1.5, unit: 'ч. л.' },
    'зелень на смак',
  ],
}
const recipe = {
  steps: ['Промити гречку.', 'Варити 15 хвилин.'],
  servings: 2,
}

test('рецепт текстом: назва з порціями, інгредієнти дослівно, кроки з номерами', () => {
  assert.equal(
    recipeText(meal, recipe),
    [
      'Гречка з овочами · на 2 порції',
      '',
      'Інгредієнти',
      '• гречка — 80 г',
      `• олія — ${(1.5).toLocaleString('uk-UA')} ч. л.`,
      '• зелень на смак',
      '',
      'Приготування',
      '1. Промити гречку.',
      '2. Варити 15 хвилин.',
    ].join('\n'),
  )
})

test('без рецепта — лише назва й інгредієнти, порцій не вигадує', () => {
  assert.equal(
    recipeText(meal, null),
    [
      'Гречка з овочами',
      '',
      'Інгредієнти',
      '• гречка — 80 г',
      `• олія — ${(1.5).toLocaleString('uk-UA')} ч. л.`,
      '• зелень на смак',
    ].join('\n'),
  )
})

test('без інгредієнтів — назва й кроки', () => {
  assert.equal(
    recipeText(
      { name: 'Омлет', ingredients: [] },
      { steps: ['Збити яйця.'], servings: null },
    ),
    ['Омлет', '', 'Приготування', '1. Збити яйця.'].join('\n'),
  )
})

test('ні інгредієнтів, ні кроків — порожньо, кнопки не буде', () => {
  assert.equal(
    recipeText({ name: 'Яблуко', ingredients: [] }, { steps: [], servings: 1 }),
    '',
  )
})
