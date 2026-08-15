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
  shoppingCheckId,
} from './sync-ids.ts'

const FAMILY = '11111111-1111-4111-8111-111111111111'
const OTHER_FAMILY = '22222222-2222-4222-8222-222222222222'
const MEAL = '33333333-3333-4333-8333-333333333333'

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
