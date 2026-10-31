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

function nutrition(patch: Record<string, unknown>): Record<string, unknown> {
  return { calories: null, protein: null, fat: null, carbs: null, ...patch }
}

function withNutrition(
  letter: 'Ж' | 'Ч',
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return {
    nutrition: {
      Ж: nutrition({}),
      Ч: nutrition({}),
      [letter]: nutrition(patch),
    },
  }
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
  assert.equal(lunch.macrosApprox, true)
  assert.equal(breakfast.macrosApprox, false)
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

test('кожна порція несе свої цифри з джерела, а верхні поля страви — порція Ч', () => {
  const parsed = parseStarterSet(example)
  assert.ok(parsed.ok)
  const [breakfast] = parsed.set.meals
  assert.ok(breakfast)
  assert.deepEqual(breakfast.nutrition.Ж, {
    calories: 240,
    protein: 7,
    fat: 5,
    carbs: 40,
  })
  assert.deepEqual(breakfast.nutrition.Ч, {
    calories: 310,
    protein: 9,
    fat: 6,
    carbs: 52,
  })
  assert.equal(breakfast.calories, 310)
  assert.equal(breakfast.carbs, 52)
})

test('набір версії 1 читається: пласкі цифри — порція Ч, порція Ж порожня', () => {
  const parsed = parseStarterSet({
    version: 1,
    meals: [
      {
        key: 'flat-1',
        name: 'Страва',
        type: 'lunch',
        calories: 500,
        caloriesApprox: false,
        protein: 20,
        fat: null,
        carbs: null,
        ingredients: [],
        portions: [],
        source: '',
        gerd: false,
        sourceIssues: [],
        recipe: null,
      },
    ],
  })
  assert.ok(parsed.ok, parsed.ok ? '' : parsed.error)
  const [flat] = parsed.set.meals
  assert.ok(flat)
  assert.deepEqual(flat.nutrition.Ч, {
    calories: 500,
    protein: 20,
    fat: null,
    carbs: null,
  })
  assert.deepEqual(flat.nutrition.Ж, {
    calories: null,
    protein: null,
    fat: null,
    carbs: null,
  })
  assert.equal(parsed.set.version, 2)
})

test('невідома версія набору — одна помилка про версію', () => {
  assert.match(
    errorOf({ ...(example as object), version: 3 }),
    /^Стартовий набір: version має бути 2/,
  )
})

test('порція без цифр чи з невідомим полем — помилка з назвою порції', () => {
  assert.match(
    errorOf(withMeal({ nutrition: { Ч: nutrition({}) } })),
    /немає поля «Ж»/,
  )
  assert.match(
    errorOf(withMeal({ nutrition: { Ж: { calories: 1 }, Ч: nutrition({}) } })),
    /nutrition\.Ж: немає поля «protein»/,
  )
  assert.match(
    errorOf(withMeal({ nutrition: { Ж: nutrition({}), Ч: null } })),
    /nutrition\.Ч — об’єкт/,
  )
})

test('пропущене й невідоме поле — помилка, а не тихе значення', () => {
  assert.match(errorOf(withMeal({}, 'gerd')), /немає поля «gerd»/)
  assert.match(errorOf(withMeal({ calorie: 300 })), /невідоме поле «calorie»/)
})

test('межі — ті самі, що в схемі БД', () => {
  assert.match(
    errorOf(withMeal(withNutrition('Ч', { calories: 310.5 }))),
    /nutrition\.Ч\.calories/,
  )
  assert.match(
    errorOf(withMeal(withNutrition('Ж', { protein: -1 }))),
    /nutrition\.Ж\.protein/,
  )
  assert.match(errorOf(withMeal({ type: 'brunch' })), /type/)
  assert.match(
    errorOf(withMeal({ recipe: { steps: [], prepTime: null, servings: 0 } })),
    /servings/,
  )
  assert.match(
    errorOf(withMeal({ ...withNutrition('Ч', {}), caloriesApprox: true })),
    /caloriesApprox/,
    '«≈» без числа — позначка ні про що (MER-26).',
  )
  const approxW = parseStarterSet(
    withMeal({
      ...withNutrition('Ж', { calories: 300 }),
      caloriesApprox: true,
    }),
  )
  assert.ok(approxW.ok, '«≈» з цифрою лише порції Ж — валідна оцінка')
})

test('MER-141: macrosApprox необов’язкове — без нього БЖВ точні, з ним має бути хоч одне з БЖВ', () => {
  const plain = parseStarterSet(withMeal({}, 'macrosApprox'))
  assert.ok(plain.ok, plain.ok ? '' : plain.error)
  assert.equal(plain.set.meals[0]?.macrosApprox, false)

  const approx = parseStarterSet(
    withMeal({ ...withNutrition('Ж', { protein: 23.5 }), macrosApprox: true }),
  )
  assert.ok(approx.ok, approx.ok ? '' : approx.error)
  assert.equal(approx.set.meals[0]?.macrosApprox, true)

  assert.match(
    errorOf(
      withMeal({
        ...withNutrition('Ч', { calories: 300 }),
        macrosApprox: true,
      }),
    ),
    /macrosApprox: true без БЖВ/,
  )
  assert.match(
    errorOf(withMeal({ macrosApprox: 'так' })),
    /macrosApprox — true або false/,
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
