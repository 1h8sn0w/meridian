/**
 * Список покупок (MER-62): провенанс кількостей, ключі позицій і відбиток
 * планів.
 *
 * Тести тут захищають не «формат виводу», а три обіцянки, які легко зламати
 * рефакторингом: застосунок не вигадує грамовок, ключ позиції стабільний
 * (він же `item_key` позначки в базі), і відбиток міняється рівно тоді, коли
 * похід у магазин справді новий.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  SHOPPING_CATEGORIES,
  aggregate,
  categoryOf,
  nameKey,
  planFingerprint,
} from './shopping.ts'
import { meal } from './test-support.ts'
import type { ShoppingItem } from './shopping.ts'
import type { Ingredient, Meal } from './types.ts'

/** Страва з інгредієнтами — решта полів тестам байдужа. */
function withIngredients(id: string, ingredients: Array<Ingredient>): Meal {
  return { ...meal({ id, type: 'lunch' }), ingredients }
}

/** Єдина позиція набору — з перевіркою, що вона там справді одна. */
function only(items: ReadonlyArray<ShoppingItem>): ShoppingItem {
  assert.equal(items.length, 1)
  const item = items[0]
  assert.ok(item)
  return item
}

/* ==========================================================================
 * Ключі й категорії
 * ======================================================================== */

test('ключ назви ігнорує регістр і зайві пробіли', () => {
  assert.equal(nameKey('  Гречка  '), 'гречка')
  assert.equal(nameKey('Куряче   філе'), 'куряче філе')
  assert.equal(nameKey('ГРЕЧКА'), nameKey('гречка'))
})

test('категорія — лише за точним збігом назви, без вгадування за підрядком', () => {
  assert.equal(categoryOf('гречка'), 'grain')
  assert.equal(categoryOf('Куряче філе'), 'meat')
  assert.equal(categoryOf('Сирок «Волошкове поле»'), 'sweet')
  // «сир» є всередині «сирок», але окремою назвою словник її не знає.
  assert.equal(categoryOf('сир'), 'other')
  assert.equal(categoryOf('драконів фрукт'), 'other')
})

test('кожна категорія словника оголошена в переліку секцій', () => {
  const known = new Set(SHOPPING_CATEGORIES.map((category) => category.id))
  for (const name of ['гречка', 'банан', 'яйця', 'хліба немає в словнику']) {
    assert.ok(known.has(categoryOf(name)), name)
  }
})

/* ==========================================================================
 * Збірка позицій
 * ======================================================================== */

test('однакова назва й однакова одиниця сумуються, різні одиниці — ні', () => {
  const { withQty } = aggregate([
    withIngredients('a', [{ name: 'Гречка', amount: 60, unit: 'г' }]),
    withIngredients('b', [{ name: 'гречка', amount: 40, unit: 'г' }]),
    withIngredients('c', [{ name: 'Яйця', amount: 2, unit: 'шт' }]),
    withIngredients('d', [{ name: 'яйця', amount: 50, unit: 'г' }]),
  ])

  const buckwheat = only(withQty.filter((item) => item.key === 'q:гречка|г'))
  assert.equal(buckwheat.amount, 100)

  // Яйця в штуках і в грамах — дві позиції: зводити їх нема за яким курсом.
  const eggs = withQty.filter((item) => nameKey(item.name) === 'яйця')
  assert.deepEqual(eggs.map((item) => item.key).sort(), [
    'q:яйця|г',
    'q:яйця|шт',
  ])
})

test('кожне входження страви в тиждень рахується окремо', () => {
  // Та сама страва двічі — це дві реальні потреби в магазині.
  const lunch = withIngredients('a', [
    { name: 'гречка', amount: 60, unit: 'г' },
  ])
  const { withQty } = aggregate([lunch, lunch])
  assert.equal(only(withQty).amount, 120)
})

test('інгредієнт без кількості лишається без кількості', () => {
  const { withQty, noQty } = aggregate([
    withIngredients('a', ['овочі на вибір (окрім томатів)']),
    withIngredients('b', [{ name: 'сіль', unit: 'до смаку' }]),
    withIngredients('c', ['Овочі на вибір (окрім томатів)']),
  ])

  assert.equal(withQty.length, 0)
  // Дублікат назви згорнуто, одиниця без числа теж потрапила сюди.
  assert.deepEqual(noQty.map((item) => item.key).sort(), [
    'n:овочі на вибір (окрім томатів)',
    'n:сіль',
  ])
  for (const item of noQty) {
    assert.equal(item.amount, null)
    assert.equal(item.unit, null)
  }
})

test('нуль у джерелі — це справжній нуль, а не «немає кількості»', () => {
  const { withQty, noQty } = aggregate([
    withIngredients('a', [{ name: 'цукор', amount: 0, unit: 'г' }]),
  ])
  assert.equal(noQty.length, 0)
  assert.equal(only(withQty).amount, 0)
})

test('кількість без одиниці не отримує вигаданої одиниці', () => {
  const { withQty } = aggregate([
    withIngredients('a', [{ name: 'перепілки', amount: 2 }]),
  ])
  const quail = only(withQty)
  assert.equal(quail.key, 'q:перепілки|')
  assert.equal(quail.unit, null)
  assert.equal(quail.amount, 2)
})

test('порожня назва не стає позицією', () => {
  const { withQty, noQty } = aggregate([
    withIngredients('a', ['   ', { name: '  ', amount: 10, unit: 'г' }]),
  ])
  assert.equal(withQty.length, 0)
  assert.equal(noQty.length, 0)
})

test('позиції йдуть за порядком секцій, усередині — за абеткою', () => {
  const order = SHOPPING_CATEGORIES.map((category) => category.id)
  const { withQty } = aggregate([
    withIngredients('a', [
      { name: 'гречка', amount: 60, unit: 'г' }, // grain
      { name: 'шпинат', amount: 50, unit: 'г' }, // veg
      { name: 'куряче філе', amount: 120, unit: 'г' }, // meat
      { name: 'банан', amount: 1, unit: 'шт' }, // fruit
      { name: 'кабачок', amount: 80, unit: 'г' }, // veg
    ]),
  ])

  const positions = withQty.map((item) => order.indexOf(item.category))
  assert.deepEqual(
    positions,
    [...positions].sort((a, b) => a - b),
  )
  // Дві позиції однієї секції — за абеткою («кабачок» перед «шпинат»).
  const veg = withQty.filter((item) => item.category === 'veg')
  assert.deepEqual(
    veg.map((item) => item.name),
    ['кабачок', 'шпинат'],
  )
})

test('назва показується як у джерелі, а нормалізується лише ключ', () => {
  const { withQty } = aggregate([
    withIngredients('a', [{ name: 'Куряче Філе', amount: 100, unit: 'г' }]),
    withIngredients('b', [{ name: 'куряче філе', amount: 20, unit: 'г' }]),
  ])
  const fillet = only(withQty)
  assert.equal(fillet.name, 'Куряче Філе')
  assert.equal(fillet.key, 'q:куряче філе|г')
})

/* ==========================================================================
 * Відбиток планів
 * ======================================================================== */

test('відбиток не залежить від порядку рядків із бази', () => {
  const a = planFingerprint([
    { slotId: 's1', mealId: 'm1' },
    { slotId: 's2', mealId: 'm2' },
  ])
  const b = planFingerprint([
    { slotId: 's2', mealId: 'm2' },
    { slotId: 's1', mealId: 'm1' },
  ])
  // Два пристрої читають ті самі рядки в різному порядку — відбиток один.
  assert.equal(a, b)
})

test('однаковий тиждень дає однаковий відбиток попри різні рядки week_plan', () => {
  /* Заради цього відбиток і рахується зі змісту. Двоє офлайн згенерували той
   * самий тиждень: слоти зійшлися на виведених id (MER-66), а рядків
   * `week_plan` лишилося два — у кожного свій випадковий. Відбиток на змісті
   * цього не помічає, тож позначка одного потрапляє в список іншого. */
  const slots = [
    { slotId: 's1', mealId: 'm1' },
    { slotId: 's2', mealId: 'm2' },
  ]
  assert.equal(planFingerprint(slots), planFingerprint([...slots].reverse()))
})

test('інша страва в клітинці — інший відбиток', () => {
  // Перегенерація (як і ручна заміна) міняє склад списку, тож позначки
  // минулого походу в магазин у новий не течуть.
  const before = planFingerprint([{ slotId: 's1', mealId: 'm1' }])
  const after = planFingerprint([{ slotId: 's1', mealId: 'm2' }])
  assert.notEqual(before, after)
})

test('інша клітинка з тією самою стравою — інший відбиток', () => {
  // Межа між складниками справжня: («s1», «m1 s2») не має збігтися з
  // («s1 m1», «s2»).
  assert.notEqual(
    planFingerprint([{ slotId: 's1', mealId: 'm1' }]),
    planFingerprint([{ slotId: 's2', mealId: 'm1' }]),
  )
  assert.notEqual(
    planFingerprint([
      { slotId: 's1', mealId: 'm1' },
      { slotId: 's2', mealId: 'm2' },
    ]),
    planFingerprint([
      { slotId: 's1', mealId: 'm1 s2' },
      { slotId: '', mealId: 'm2' },
    ]),
  )
})

test('відбиток — короткий uuid, а не весь перелік клітинок', () => {
  // Він лежить на КОЖНОМУ рядку `shopping_check` і їде в кожному вивантаженні.
  const many = Array.from({ length: 28 }, (_, i) => ({
    slotId: 'slot-' + i,
    mealId: 'meal-' + i,
  }))
  assert.match(
    planFingerprint(many),
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  )
})

test('без плану відбиток порожній', () => {
  // Порожній рядок нікуди не пишеться: `fingerprint` має CHECK на непорожнє.
  assert.equal(planFingerprint([]), '')
})

test('відбиток спільний на сім’ю: зміна в одного скидає весь список', () => {
  // Позначки спільні, тож і відбиток один на сім'ю — інакше два пристрої з
  // різним охопленням писали б їх під різними відбитками й не бачили б одне
  // одного.
  const before = planFingerprint([
    { slotId: 'p1-s1', mealId: 'm1' },
    { slotId: 'p2-s1', mealId: 'm2' },
  ])
  const after = planFingerprint([
    { slotId: 'p1-s1', mealId: 'm1' },
    { slotId: 'p2-s1', mealId: 'm3' },
  ])
  assert.notEqual(before, after)
})
