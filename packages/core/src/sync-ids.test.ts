/**
 * Виведені id (MER-57). Перевіряємо не UUIDv5 як алгоритм — його дає перевірена
 * бібліотека, — а рівно те, через що виведення ламається на практиці:
 * непомічену зміну імені чи простору імен, збіг id між різновидами рядків і
 * склеювання складників без розділювача.
 *
 * Тому тут стоять «золоті» значення. Вони не документація, а запобіжник:
 * простір імен і форма імені не можуть змінюватися після першого запису — id,
 * порахований новою версією застосунку, мусить збігтися з тим, що вже лежить у
 * базі, інакше повертається та сама колізія створення.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  MERIDIAN_NAMESPACE,
  derivedId,
  mealPrefId,
  planSlotId,
  recipeId,
  shoppingCheckId,
} from './sync-ids.ts'

const FAMILY = '11111111-1111-4111-8111-111111111111'
const OTHER_FAMILY = '22222222-2222-4222-8222-222222222222'
const MEAL = '33333333-3333-4333-8333-333333333333'
const PROFILE = '44444444-4444-4444-8444-444444444444'

/** UUID версії 5 з правильним варіантом — інакше колонка `uuid` його не прийме. */
const UUID_V5 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('простір імен не змінюється: на ньому тримається все виведення', () => {
  assert.equal(MERIDIAN_NAMESPACE, '08f391fa-7b00-47c8-9fc6-61847964d799')
})

test('усі виведені id — справжні UUIDv5', () => {
  assert.match(derivedId(FAMILY, 'meal', 'meal_abc'), UUID_V5)
  assert.match(mealPrefId(MEAL), UUID_V5)
  assert.match(shoppingCheckId(FAMILY, 'q:cheese|g', 'fp-1'), UUID_V5)
  assert.match(planSlotId(PROFILE, '2026-08-24', 'breakfast'), UUID_V5)
  assert.match(recipeId(MEAL), UUID_V5)
})

/* ==========================================================================
 * Золоті значення: змінилися — значить, змінилося ім'я або простір імен
 * ======================================================================== */

test('id смаку страви лишається тим самим назавжди', () => {
  assert.equal(mealPrefId(MEAL), '65dfba94-1562-5a03-99d0-2c1696b56f95')
})

test('id позначки списку покупок лишається тим самим назавжди', () => {
  assert.equal(
    shoppingCheckId(FAMILY, 'q:cheese|g', 'fp-1'),
    'f450c1f5-1245-5242-99f0-d12ff3d19307',
  )
})

test('id слота плану лишається тим самим назавжди', () => {
  assert.equal(
    planSlotId(PROFILE, '2026-08-24', 'breakfast'),
    '9603b52b-de1c-5e1d-9d63-8bb30aa7053d',
  )
})

test('id рецепта лишається тим самим назавжди', () => {
  assert.equal(recipeId(MEAL), '84647995-fc4f-5304-8868-4dcca6b0e47b')
})

test('переїзд у sync-ids не зрушив id міграції V1 (MER-48)', () => {
  // Рядки з цим id уже лежать у базах, куди міграцію вже прогнали.
  assert.equal(
    derivedId(FAMILY, 'meal', 'meal_abc'),
    '17fe1b95-92eb-567f-a8f0-1afcb59adeb4',
  )
})

/* ==========================================================================
 * Те, заради чого id виводяться
 * ======================================================================== */

test('два пристрої з того самого природного ключа рахують один id', () => {
  // Уся задача в одному рядку: обидві вставки — це upsert одного рядка, а не
  // друга вставка, яку сервер відкине на унікальному індексі.
  assert.equal(mealPrefId(MEAL), mealPrefId(MEAL))
  assert.equal(
    shoppingCheckId(FAMILY, 'q:cheese|g', 'fp-1'),
    shoppingCheckId(FAMILY, 'q:cheese|g', 'fp-1'),
  )
})

test('різні різновиди рядків не діляться одним id', () => {
  assert.notEqual(
    derivedId(FAMILY, 'meal', 'x'),
    derivedId(FAMILY, 'recipe', 'x'),
  )
  assert.notEqual(
    derivedId(FAMILY, 'profile', 'x'),
    derivedId(FAMILY, 'meal', 'x'),
  )
  // Різновиди з різних поколінь: у смаку ім'я починається з назви таблиці, у
  // міграції — з id сім'ї, тож збігтися вони не можуть.
  assert.notEqual(mealPrefId(MEAL), derivedId(FAMILY, 'meal', MEAL))
  // Рецепт тієї самої страви: id з міграції V1 (ім'я від id сім'ї) і
  // виведений id V2 (ім'я від назви таблиці) — різні рядки, і пошук за
  // `meal_id` перед записом мусить бачити обидва.
  assert.notEqual(recipeId(MEAL), derivedId(FAMILY, 'recipe', MEAL))
  // Смак і рецепт однієї страви — різні таблиці, різні id.
  assert.notEqual(recipeId(MEAL), mealPrefId(MEAL))
})

test('два пристрої рахують один id слота — і різні для різних клітинок', () => {
  // Те, заради чого MER-66 існує: перша генерація тижня офлайн на двох
  // пристроях мусить зійтись на одному наборі рядків.
  assert.equal(
    planSlotId(PROFILE, '2026-08-24', 'breakfast'),
    planSlotId(PROFILE, '2026-08-24', 'breakfast'),
  )
  // Клітинка календаря — це всі три складники ключа: зсунувся будь-який —
  // це вже інший рядок.
  assert.notEqual(
    planSlotId(PROFILE, '2026-08-24', 'breakfast'),
    planSlotId(PROFILE, '2026-08-24', 'lunch'),
  )
  assert.notEqual(
    planSlotId(PROFILE, '2026-08-24', 'breakfast'),
    planSlotId(PROFILE, '2026-08-25', 'breakfast'),
  )
  assert.notEqual(
    planSlotId(PROFILE, '2026-08-24', 'breakfast'),
    planSlotId(FAMILY, '2026-08-24', 'breakfast'),
  )
})

test('позначка іншої сім’ї — інший id, хоч позиція та сама', () => {
  // `item_key` — вільний рядок («q:cheese|g»), у двох сім'ях він збігається
  // легко, тому сім'я входить в ім'я.
  assert.notEqual(
    shoppingCheckId(FAMILY, 'q:cheese|g', 'fp-1'),
    shoppingCheckId(OTHER_FAMILY, 'q:cheese|g', 'fp-1'),
  )
})

test('позначка іншого відбитка планів — інший id', () => {
  // Перегенерували тиждень — це новий похід у магазин, і позначки старого
  // відбитка не мають ставати позначками нового.
  assert.notEqual(
    shoppingCheckId(FAMILY, 'q:cheese|g', 'fp-1'),
    shoppingCheckId(FAMILY, 'q:cheese|g', 'fp-2'),
  )
})

test('складники не склеюються: межа між ними справжня', () => {
  // Без розділювача ('ab', 'c') і ('a', 'bc') дали б те саме ім'я — тобто одна
  // позиція списку мовчки перебрала б id іншої.
  assert.notEqual(
    shoppingCheckId(FAMILY, 'ab', 'c'),
    shoppingCheckId(FAMILY, 'a', 'bc'),
  )
})
