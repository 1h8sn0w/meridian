/**
 * Міст «рядок локального SQLite → доменний об'єкт». Головне тут — що SQLite не
 * має ні boolean, ні jsonb, і що NULL мусить лишитись порожнечею, а не стати
 * нулем.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mealFromRow, prefsFromRows, profileFromRow } from './rows.ts'

const mealRow = {
  id: 'm1',
  family_id: 'f1',
  name: 'Гречка з куркою',
  type: 'lunch',
  calories: 520,
  calories_approx: 0,
  protein: 38,
  fat: null,
  carbs: null,
  ingredients: '[{"name":"сирок","amount":40,"unit":"г"},"овочі на вибір"]',
  source: 'Тиждень 2',
  portions: '[{"component":null,"text":"Ж - 130 г; Ч - 200 г"}]',
}

test('рядок страви розбирається зі значень, які реально дає SQLite', () => {
  const meal = mealFromRow(mealRow)
  assert.equal(meal.id, 'm1')
  assert.equal(meal.type, 'lunch')
  assert.equal(meal.calories, 520)
  assert.equal(meal.caloriesApprox, false)
  assert.equal(meal.protein, 38)
  assert.equal(meal.source, 'Тиждень 2')
  assert.deepEqual(meal.ingredients, [
    { name: 'сирок', amount: 40, unit: 'г' },
    'овочі на вибір',
  ])
  assert.deepEqual(meal.portions, [
    { component: null, text: 'Ж - 130 г; Ч - 200 г' },
  ])
})

test('NULL лишається порожнечею — жодних нулів замість «невідомо»', () => {
  const meal = mealFromRow({
    ...mealRow,
    calories: null,
    protein: null,
    fat: null,
    carbs: null,
    ingredients: null,
    portions: null,
    source: null,
  })
  assert.equal(meal.calories, null)
  assert.equal(meal.protein, null)
  assert.equal(meal.fat, null)
  assert.equal(meal.carbs, null)
  assert.deepEqual(meal.ingredients, [])
  assert.deepEqual(meal.portions, [])
  assert.equal(meal.source, '')
})

test('boolean приїздить і як 1/0, і як true/false', () => {
  assert.equal(
    mealFromRow({ ...mealRow, calories_approx: 1 }).caloriesApprox,
    true,
  )
  assert.equal(
    mealFromRow({ ...mealRow, calories_approx: 0 }).caloriesApprox,
    false,
  )
  assert.equal(
    mealFromRow({ ...mealRow, calories_approx: true }).caloriesApprox,
    true,
  )
  assert.equal(
    mealFromRow({ ...mealRow, calories_approx: '1' }).caloriesApprox,
    true,
  )
})

test('jsonb приймається і рядком, і вже розібраним масивом', () => {
  const parsed = mealFromRow({
    ...mealRow,
    ingredients: [{ name: 'яйце', amount: 2 }],
  })
  assert.deepEqual(parsed.ingredients, [{ name: 'яйце', amount: 2 }])
})

test('кількість і одиниця кладуться лише тоді, коли є в джерелі', () => {
  const meal = mealFromRow({
    ...mealRow,
    ingredients: '[{"name":"овочі"},{"name":"сир","amount":null,"unit":""}]',
  })
  assert.deepEqual(meal.ingredients, [{ name: 'овочі' }, { name: 'сир' }])
})

test('зіпсований рядок — помилка з поясненням, а не тихе значення', () => {
  assert.throws(
    () => mealFromRow({ ...mealRow, ingredients: '{не json' }),
    /некоректний JSON/,
  )
  assert.throws(
    () => mealFromRow({ ...mealRow, ingredients: '"рядок"' }),
    /не масив/,
  )
  assert.throws(() => mealFromRow({ ...mealRow, type: 'brunch' }), /тип слота/)
  assert.throws(() => mealFromRow({ ...mealRow, name: '  ' }), /порожнє поле/)
})

/* ==========================================================================
 * Профіль
 * ======================================================================== */

const profileRow = {
  id: 'p1',
  family_id: 'f1',
  name: 'Я',
  target_calories: 2000,
  corridor: 100,
  color: '#3366ff',
  shared_plan_with: null,
  portion: 'Ч',
  goal_protein: 90,
  goal_fat: null,
  goal_carbs: null,
  meal_ids: null,
}

test('профіль розбирається, порційна літера й цілі БЖВ переносяться як є', () => {
  const profile = profileFromRow(profileRow)
  assert.equal(profile.targetCalories, 2000)
  assert.equal(profile.corridor, 100)
  assert.equal(profile.portion, 'Ч')
  assert.equal(profile.goalProtein, 90)
  assert.equal(profile.goalFat, null)
  assert.equal(profile.sharedPlanWith, null)
})

test('meal_ids: NULL — увесь пул, порожній масив — жодної страви', () => {
  assert.equal(profileFromRow(profileRow).mealIds, null)
  assert.deepEqual(
    profileFromRow({ ...profileRow, meal_ids: '[]' }).mealIds,
    [],
  )
  assert.deepEqual(
    profileFromRow({ ...profileRow, meal_ids: '["m1","m2"]' }).mealIds,
    ['m1', 'm2'],
  )
})

test('невідома порційна літера й недодатна ціль — помилка', () => {
  assert.throws(
    () => profileFromRow({ ...profileRow, portion: 'X' }),
    /порційна літера/,
  )
  assert.throws(
    () => profileFromRow({ ...profileRow, target_calories: 0 }),
    /додатною/,
  )
})

/* ==========================================================================
 * Смаки
 * ======================================================================== */

test('смаки збираються в два набори, невідомі значення відкидаються', () => {
  const prefs = prefsFromRows([
    { meal_id: 'm1', value: 'favorite' },
    { meal_id: 'm2', value: 'disliked' },
    { meal_id: 'm3', value: 'whatever' },
    { meal_id: '', value: 'favorite' },
  ])
  assert.deepEqual([...prefs.favorites], ['m1'])
  assert.deepEqual([...prefs.disliked], ['m2'])
})
