import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parsePlanText } from './parse-plan.ts'
import type { PlanEntry } from './parse-plan.ts'
import type { Ingredient } from './types.ts'

const PLAN = [
  'МЕНЮ НА 2 ТИЖНІ',
  'Тестовий план • Для двох',
  'ТИЖДЕНЬ 1',
  'День 1',
  'Сніданок: Яєчня з помідорами і сиром + житній тост',
  'Яєчня з помідорами і сиром',
  'На 2-х (сухе/сире): 4 яйця; 150 г помідорів; 60 г твердого сиру; 2 ч. л. вершкового',
  'масла',
  'Готова порція: Ж - яєчня ~140 г + 1 скиба хліба (25 г) + помідор; Ч - яєчня ~210 г + 2 тонкі скиби хліба (50',
  'г) + помідор + 40 г бринзи',
  'Подавати одразу, поки тепле.',
  'Обід: Гарбузовий суп + запечена індичка + булгур',
  'Гарбузовий суп-пюре (вистачить на 2 дні)',
  'На 2-х (сухе/сире): 500 г гарбуза; 1 картоплина (≈100 г); 1 морква (≈70 г); пів цибулі; 100 мл',
  'вершків 10%; 700 мл овочевого бульйону; 1 ст. л. соняшникової олії',
  'Готова порція: Ж - 260 мл; Ч - 360 мл',
  'Індичка запечена',
  'На 2-х (сухе/сире): ≈700 г філе індички (цілим шматком, запекти 30 хв при 190°C з розмарином і',
  'дрібкою солі)',
  'Готова порція: Ж - 110 г; Ч - 170 г',
  'Булгур (гарнір)',
  'На 2-х (сухе/сире): ≈200 г сухого булгуру',
  'Готова порція: Ж - 90 г готового; Ч - 160 г готового',
  'Доповнення на тарілку: помідор + рукола + 1 ч. л. гірчичної олії - кожному.',
  'Вечеря: Тушкована тріска з овочами + картопляне пюре',
  'Тріска тушкована з морквою і цибулею',
  'На 2-х (сухе/сире): ≈600 г тріски; 1 морква; пів цибулі; 60 мл сметани 20%; 1 ст. л. олії; петрушка',
  'Готова порція: Ж - 140 г; Ч - 210 г',
  'Десерт: Пудинг «Хмаринка» - 1 шт. (≈100 г) кожному.',
  'День 2',
  'Сніданок: Пшоняний боул з тунцем і авокадо',
  'Пшоняний боул (холодний, на 2-х)',
  'На 2-х (сухе/сире): 140 г сухого пшона + 3 яйця варених + 120 г тунця + 1 авокадо',
  'стиглий (≈150 г) + 200 г помідорів + 90 г житнього хліба (3 скиби) + петрушка',
  'Обід',
  'Той самий, що в день 1: гарбузовий суп + індичка + булгур. Уся їжа вже зварена.',
  'Ж - 260 мл супу + 110 г індички + 90 г булгуру + помідор Ч - 360 мл супу + 170 г індички + 160 г булгуру +',
  'помідор',
  'Вечеря',
  'Та сама: тріска + пюре. Розігріти, додати свіжу петрушку.',
  'Десерт: морквяний кекс - 1 шматочок (≈60 г) кожному. ≈190 ккал.',
  'День 5',
  'Десерт: Пудинг «Хмаринка» - 1 шт. (≈100 г) кожному.',
  'ТИЖДЕНЬ 2',
  'День 8',
  'Сніданок: Вівсяні оладки з кефіром',
  'Оладки вівсяні запечені (без олії)',
  'На 2-х (сухе/сире): 200 г вівсяних пластівців; 2 яйця; 200 мл кефіру 1%; 1 ст. л.',
  'меду; дрібка солі; кориця',
  'Випікати 15 хв при 190°C на пергаменті.',
  'Обід: те саме, з неділі',
].join('\n')

const parsed = parsePlanText(PLAN)
const meals = parsed.entries.filter((e) => e.kind === 'meal')

function byName(prefix: string): PlanEntry {
  const found = meals.find((m) => m.name.startsWith(prefix))
  assert.ok(found, 'немає страви «' + prefix + '»')
  return found
}

function at<T>(list: ReadonlyArray<T>, index: number): T {
  const item = list[index]
  assert.ok(item !== undefined, 'немає елемента ' + index)
  return item
}

function label(entry: Ingredient): string {
  if (typeof entry === 'string') return entry
  const qty = [entry.amount, entry.unit].filter((x) => x !== undefined)
  return qty.length ? entry.name + ' — ' + qty.join(' ') : entry.name
}

test('підсумок розбору: страви, повтори, дублікати, тижні й дні', () => {
  assert.deepEqual(parsed.stats, {
    weeks: 2,
    days: 4,
    meals: 7,
    repeats: 3,
    dups: 1,
  })
})

test('назви дослівно з PDF, типи — за підписом слота', () => {
  assert.equal(
    byName('Яєчня').name,
    'Яєчня з помідорами і сиром + житній тост',
  )
  assert.equal(byName('Яєчня').type, 'breakfast')
  assert.equal(byName('Гарбузовий суп').type, 'lunch')
  assert.equal(byName('Тушкована тріска').type, 'dinner')
  assert.equal(byName('Пудинг «Хмаринка»').type, 'snack')
})

test('джерело страви — номер тижня із заголовка', () => {
  assert.equal(byName('Яєчня').source, 'Тиждень 1')
  assert.equal(byName('Вівсяні оладки').source, 'Тиждень 2')
})

test('калорійність — лише де написана, решта порожня й позначена', () => {
  assert.deepEqual(byName('морквяний кекс').calories, { Ж: null, Ч: 190 })
  const unknown = meals.filter(
    (m) => m.calories.Ж === null && m.calories.Ч === null,
  )
  assert.equal(unknown.length, 6)
  for (const m of unknown) {
    assert.ok(m.flags.includes('no-kcal'))
  }
})

test('inline «N ккал» вирізається з назви (MER-41)', () => {
  const one = parsePlanText('День 1\nСніданок: Омлет — 500 ккал\nВечеря: Риба')
  assert.equal(at(one.entries, 0).name, 'Омлет')
  assert.deepEqual(at(one.entries, 0).calories, { Ж: null, Ч: 500 })
  assert.deepEqual(at(one.entries, 1).calories, { Ж: null, Ч: null })
})

test('рядок «Жінка: N ккал | … | Чоловік: N ккал» заповнює обидві порції, а жири «Ж N г» — ні', () => {
  const one = parsePlanText(
    [
      'День 1',
      'Сніданок: Каша з яблуком',
      'На 2-х (сухе/сире): 120 г вівсянки; 2 яблука',
      'Готова порція: Ж - 180 г; Ч - 280 г',
      'Жінка: 410 ккал | Б 12,5 г | Ж 9,8 г | В 66,1 г | Чоловік: 640 ккал | Б 19,5 г | Ж 15,3 г | В 103,2 г',
    ].join('\n'),
  )
  const meal = at(one.entries, 0)
  assert.deepEqual(meal.calories, { Ж: 410, Ч: 640 })
  assert.equal(meal.steps.length, 0)
  assert.ok(!meal.flags.includes('no-kcal'))
})

test('рядок «Калорійність …: Ж - ~N ккал Ч - ~N ккал» береться, денний підсумок після нього — ні', () => {
  const one = parsePlanText(
    [
      'День 1',
      'Вечеря: Риба з овочами',
      'На 2-х: 400 г риби; 300 г овочів',
      'Готова порція: Ж - 220 г; Ч - 330 г',
      'Калорійність вечері: Ж - ~520 ккал Ч -',
      '~810 ккал',
      'Всього за день: Ж - ~1650 ккал Ч - ~2500 ккал',
    ].join('\n'),
  )
  assert.deepEqual(at(one.entries, 0).calories, { Ж: 520, Ч: 810 })
})

test('підсумок дня без рядка порцій не стає калорійністю страви', () => {
  const one = parsePlanText(
    [
      'День 1',
      'Вечеря: Риба з овочами',
      'Разом за день: Ж - ~1650 ккал Ч - ~2500 ккал',
    ].join('\n'),
  )
  assert.deepEqual(at(one.entries, 0).calories, { Ж: null, Ч: null })
})

test('добова ціль «Жінка: N ккал/добу» калорійністю страви не стає', () => {
  const one = parsePlanText(
    [
      'День 1',
      'Обід: Суп',
      'Жінка: 1600 ккал/добу. Чоловік: 2600 ккал/добу.',
    ].join('\n'),
  )
  assert.deepEqual(at(one.entries, 0).calories, { Ж: null, Ч: null })
})

test('рядок порцій має перевагу над «N ккал» у заголовку, але лише для порцій, які називає', () => {
  const both = parsePlanText(
    [
      'День 1',
      'Обід: Суп — 500 ккал',
      'Жінка: 380 ккал | Чоловік: 590 ккал',
    ].join('\n'),
  )
  assert.deepEqual(at(both.entries, 0).calories, { Ж: 380, Ч: 590 })
  const onlyW = parsePlanText(
    ['День 1', 'Обід: Суп — 500 ккал', 'Жінка: 380 ккал'].join('\n'),
  )
  assert.deepEqual(at(onlyW.entries, 0).calories, { Ж: 380, Ч: 500 })
})

test('у страви береться лише перший рядок порцій', () => {
  const one = parsePlanText(
    [
      'День 1',
      'Обід: Суп',
      'Жінка: 380 ккал | Чоловік: 590 ккал',
      'Жінка: 999 ккал | Чоловік: 999 ккал',
    ].join('\n'),
  )
  assert.deepEqual(at(one.entries, 0).calories, { Ж: 380, Ч: 590 })
})

test('рядок порцій у повторі («Той самий…») нічого не заповнює', () => {
  const one = parsePlanText(
    [
      'День 2',
      'Обід',
      'Той самий, що в день 1.',
      'Жінка: 380 ккал | Чоловік: 590 ккал',
    ].join('\n'),
  )
  assert.equal(at(one.entries, 0).kind, 'repeat')
  assert.deepEqual(at(one.entries, 0).calories, { Ж: null, Ч: null })
})

test('інгредієнти «На 2-х» дослівно, перенос рядка склеєно', () => {
  const eggs = byName('Яєчня')
  assert.equal(eggs.ingredients.length, 4)
  assert.equal(eggs.ingredients[0], '4 яйця')
  assert.equal(eggs.ingredients[3], '2 ч. л. вершкового масла')
  assert.equal(label(at(eggs.ingredients, 1)), 'помідорів — 150 г')
})

test('складники слота зібрано разом; «≈» і діапазони — дослівним рядком', () => {
  const lunch = byName('Гарбузовий суп')
  assert.equal(lunch.ingredients.length, 9)
  assert.ok(
    lunch.ingredients.includes(
      '≈700 г філе індички (цілим шматком, запекти 30 хв при 190°C з розмарином і дрібкою солі)',
    ),
  )
  assert.equal(label(at(lunch.ingredients, 0)), 'гарбуза — 500 г')
})

test('нотатки приготування — дослівні кроки; порції «на 2-х»', () => {
  const eggs = byName('Яєчня')
  assert.deepEqual(eggs.steps, ['Подавати одразу, поки тепле.'])
  assert.equal(eggs.servings, 2)
  assert.equal(
    at(byName('Вівсяні оладки').steps, 0),
    'Випікати 15 хв при 190°C на пергаменті.',
  )
  assert.equal(byName('Пудинг «Хмаринка»').servings, null)
})

test('готові порції дослівно, з прив’язкою до складника (MER-24)', () => {
  const lunch = byName('Гарбузовий суп')
  assert.deepEqual(lunch.portions, [
    {
      component: 'Гарбузовий суп-пюре (вистачить на 2 дні)',
      text: 'Ж - 260 мл; Ч - 360 мл',
    },
    { component: 'Індичка запечена', text: 'Ж - 110 г; Ч - 170 г' },
    {
      component: 'Булгур (гарнір)',
      text: 'Ж - 90 г готового; Ч - 160 г готового',
    },
  ])
  const eggs = byName('Яєчня')
  assert.equal(eggs.portions.length, 1)
  assert.ok(at(eggs.portions, 0).text.includes('Ч - яєчня ~210 г'))
})

test('повтори й дублікати позначено, сирий текст збережено', () => {
  const repeats = parsed.entries.filter((e) => e.kind === 'repeat')
  assert.equal(repeats.length, 3)
  assert.ok(at(repeats, 0).raw.join('\n').includes('Той самий, що в день 1'))
  assert.equal(at(repeats, 2).name, 'те саме, з неділі')

  const dup = parsed.entries.find((e) => e.kind === 'dup')
  assert.ok(dup)
  assert.equal(dup.name, 'Пудинг «Хмаринка»')
  assert.ok(dup.flags.includes('dup'))
})

test('порожній і несхожий текст не вигадують страв', () => {
  assert.deepEqual(parsePlanText('').entries, [])
  assert.deepEqual(parsePlanText('Просто якийсь текст без слотів.').entries, [])
})
