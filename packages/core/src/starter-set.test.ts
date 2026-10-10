import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { hasRecipe, parseStarterSet } from './starter-set.ts'
import { starterMealId } from './sync-ids.ts'

const example: unknown = JSON.parse(
  readFileSync(
    new URL('../../../infra/starter-set.example.json', import.meta.url),
    'utf8',
  ),
)

function withMeal(patch: Record<string, unknown>, drop?: string): unknown {
  const set = structuredClone(example) as {
    meals: Array<Record<string, unknown>>
  }
  const meal = { ...set.meals[0], ...patch }
  if (drop) delete meal[drop]
  set.meals = [meal]
  return set
}

function errorOf(input: unknown): string {
  const parsed = parseStarterSet(input)
  assert.ok(!parsed.ok)
  return parsed.error
}

test('приклад з репозиторію — валідний набір', () => {
  const parsed = parseStarterSet(example)
  assert.ok(parsed.ok)
  const [breakfast, lunch, snack] = parsed.set.meals
  assert.ok(breakfast && lunch && snack)
  assert.equal(parsed.set.meals.length, 3)
  assert.equal(breakfast.gerd, true)
  assert.deepEqual(breakfast.recipe?.steps.length, 2)
  assert.equal(lunch.caloriesApprox, true)
  assert.deepEqual(lunch.sourceIssues, [
    'У складі сочевиця 60 г, у рецепті — 80 г',
  ])
  assert.equal(
    snack.calories,
    null,
    'Порожнє лишається порожнім: null — не нуль.',
  )
  assert.equal(snack.protein, null)
  assert.equal(hasRecipe(snack.recipe), false)
})

test('пропущене й невідоме поле — помилка, а не тихе значення', () => {
  assert.match(errorOf(withMeal({}, 'gerd')), /немає поля «gerd»/)
  assert.match(errorOf(withMeal({ calorie: 300 })), /невідоме поле «calorie»/)
})

test('межі — ті самі, що в схемі БД', () => {
  assert.match(errorOf(withMeal({ calories: 310.5 })), /calories/)
  assert.match(errorOf(withMeal({ protein: -1 })), /protein/)
  assert.match(errorOf(withMeal({ type: 'brunch' })), /type/)
  assert.match(
    errorOf(withMeal({ recipe: { steps: [], prepTime: null, servings: 0 } })),
    /servings/,
  )
  assert.match(
    errorOf(withMeal({ calories: null, caloriesApprox: true })),
    /caloriesApprox/,
    '«≈» без числа — позначка ні про що (MER-26).',
  )
})

test('key повторюється — помилка: інакше дві страви злилися б в один рядок', () => {
  const set = structuredClone(example) as { meals: Array<{ key: string }> }
  const [first, second] = set.meals
  assert.ok(first && second)
  second.key = first.key
  assert.match(errorOf(set), /повторюється/)
})

test('помилки збираються всі, а не до першої', () => {
  const error = errorOf(withMeal({ gerd: 'так', source: 5, ingredients: {} }))
  assert.match(error, /gerd/)
  assert.match(error, /source/)
  assert.match(error, /ingredients/)
})

test('id страви набору стабільний і свій для кожної сім’ї', () => {
  assert.equal(starterMealId('f1', 'k'), starterMealId('f1', 'k'))
  assert.notEqual(starterMealId('f1', 'k'), starterMealId('f2', 'k'))
  assert.notEqual(starterMealId('f1', 'k'), starterMealId('f1', 'k2'))
})
