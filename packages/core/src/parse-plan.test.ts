/**
 * Розбір PDF-плану (MER-52).
 *
 * Фікстура й перевірки перенесені з самотесту V1 (секція 19 в `index.html`):
 * це дослівні рядки з `Menu_2_tyzhni.pdf` у тому вигляді, як їх віддає
 * текстовий шар pdf.js — із жорсткими переносами посеред речень. Тести
 * захищають не «формат виводу», а обіцянки провенансу: калорійність лише де
 * написано, БЖВ ніде, кількості дослівно, порції дослівно.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parsePlanText } from './parse-plan.ts'
import type { PlanEntry } from './parse-plan.ts'
import type { Ingredient } from './types.ts'

const PLAN = [
  'МЕНЮ НА 2 ТИЖНІ',
  'З урахуванням ГЕРХ • Для двох',
  'ТИЖДЕНЬ 1',
  'День 1',
  'Сніданок: Омлет з лососем і шпинатом + цільнозерновий тост',
  'Омлет з лососем і шпинатом',
  'На 2-х (сухе/сире): 5 яєць; 100 г слабосоленого лосося; жменя шпинату (~60 г); 2 ч. л. оливкової',
  'олії',
  'Готова порція: Ж - омлет ~150 г + 1 скиба хліба (35 г) + огірок; Ч - омлет ~230 г + 2 скиби хліба (70',
  'г) + огірок + 50 г творожного сиру 5%',
  'Напій без цукру на вибір.',
  'Обід: Крем-суп з цвітної капусти + куряча грудка + нешліфований рис',
  'Крем-суп з цвітної капусти (на 2 дні для двох)',
  'На 2-х (сухе/сире): 400 г цвітної капусти; 1 картоплина (≈120 г); 1 морква (≈80 г); пів цибулі; 100 мл',
  'вершків 10%; 800 мл овочевого бульйону; 1 ст. л. оливкової олії',
  'Готова порція: Ж - 250 мл; Ч - 350 мл',
  'Куряча грудка запечена',
  'На 2-х (сухе/сире): ≈830 г сирого філе (одним шматком, запекти 25 хв при 180°C з кропом і',
  'дрібкою солі)',
  'Готова порція: Ж - 120 г; Ч - 180 г',
  'Нешліфований рис (гарнір)',
  'На 2-х (сухе/сире): ≈220 г сирого рису',
  'Готова порція: Ж - 100 г готового; Ч - 175 г готового',
  'Доповнення на тарілку: огірок + листя салату + 1 ч. л. оливкової олії - кожному.',
  'Вечеря: Куряча печінка з овочами + пюре з кабачка і картоплі',
  'Тушкована куряча печінка з морквою і цибулею',
  'На 2-х (сухе/сире): ≈800 г печінки; 1 морква; пів цибулі; 50 мл сметани 15%; 1 ст. л. олії; кріп',
  'Готова порція: Ж - 130 г; Ч - 200 г',
  'Десерт: Сирок «Волошкове поле» - 1 шт. (≈40 г) кожному.',
  'День 2',
  'Сніданок: Гречаний боул з лососем і авокадо',
  'Гречаний боул (свіжий, на 2-х)',
  'На 2-х (сухе/сире): 140 г сухої гречки + 3 яйця варених + 110 г слабосоленого лосося + 1 авокадо',
  'середній (≈140 г) + 200 г огірка + 105 г цільнозернового хліба (3 скиби) + кріп',
  'Обід',
  'Той самий, що в день 1: крем-суп з цвітної капусти + куряча грудка + рис. Уся їжа вже зварена.',
  'Ж - 250 мл супу + 120 г курки + 100 г рису + огірок Ч - 350 мл супу + 180 г курки + 175 г рису +',
  'огірок',
  'Вечеря',
  'Та сама: куряча печінка + пюре. Розігріти, додати свіжий кріп.',
  'Десерт: банановий хліб - 1 скибочка (≈50 г) кожному. ≈185 ккал.',
  'День 5',
  'Десерт: Сирок «Волошкове поле» - 1 шт. (≈40 г) кожному.',
  'ТИЖДЕНЬ 2',
  'День 8',
  'Сніданок: Запечені сирники з йогуртом',
  'Сирники запечені (без обсмажування)',
  'На 2-х (сухе/сире): 350 г сиру кисломолочного 5–9%; 1 яйце; 3 ст. л. вівсяного борошна; 1 ст. л.',
  'цукру; дрібка солі; ваніль',
  'Випікати 20 хв при 180°C на пергаменті.',
  'Обід: те саме, з суботи',
].join('\n')

const parsed = parsePlanText(PLAN)
const meals = parsed.entries.filter((e) => e.kind === 'meal')

/** Страва за початком назви — так само, як шукав самотест V1. */
function byName(prefix: string): PlanEntry {
  const found = meals.find((m) => m.name.startsWith(prefix))
  assert.ok(found, 'немає страви «' + prefix + '»')
  return found
}

/**
 * Елемент за індексом. `noUncheckedIndexedAccess` вважає будь-який індекс
 * можливо-порожнім, а «елемента немає» тут — це і є провал перевірки.
 */
function at<T>(list: ReadonlyArray<T>, index: number): T {
  const item = list[index]
  assert.ok(item !== undefined, 'немає елемента ' + index)
  return item
}

/** Плоский підпис інгредієнта — щоб порівнювати обидві його форми. */
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
    byName('Омлет').name,
    'Омлет з лососем і шпинатом + цільнозерновий тост',
  )
  assert.equal(byName('Омлет').type, 'breakfast')
  assert.equal(byName('Крем-суп').type, 'lunch')
  assert.equal(byName('Куряча печінка').type, 'dinner')
  assert.equal(byName('Сирок «Волошкове поле»').type, 'snack')
})

test('джерело страви — номер тижня із заголовка', () => {
  assert.equal(byName('Омлет').source, 'Тиждень 1')
  assert.equal(byName('Запечені сирники').source, 'Тиждень 2')
})

test('калорійність — лише де написана, решта порожня й позначена', () => {
  assert.equal(byName('банановий хліб').calories, 185)
  const unknown = meals.filter((m) => m.calories === null)
  assert.equal(unknown.length, 6)
  for (const m of unknown) {
    assert.ok(m.flags.some((f) => f.code === 'no-kcal'))
  }
})

test('inline «N ккал» вирізається з назви (MER-41)', () => {
  const one = parsePlanText('День 1\nСніданок: Омлет — 500 ккал\nВечеря: Риба')
  assert.equal(at(one.entries, 0).name, 'Омлет')
  assert.equal(at(one.entries, 0).calories, 500)
  assert.equal(at(one.entries, 1).calories, null)
})

test('інгредієнти «На 2-х» дослівно, перенос рядка склеєно', () => {
  const omelet = byName('Омлет')
  assert.equal(omelet.ingredients.length, 4)
  assert.equal(omelet.ingredients[0], '5 яєць')
  assert.equal(omelet.ingredients[3], '2 ч. л. оливкової олії')
  assert.equal(label(at(omelet.ingredients, 1)), 'слабосоленого лосося — 100 г')
})

test('складники слота зібрано разом; «≈» і діапазони — дослівним рядком', () => {
  const lunch = byName('Крем-суп')
  assert.equal(lunch.ingredients.length, 9)
  assert.ok(
    lunch.ingredients.includes(
      '≈830 г сирого філе (одним шматком, запекти 25 хв при 180°C з кропом і дрібкою солі)',
    ),
  )
  assert.equal(label(at(lunch.ingredients, 0)), 'цвітної капусти — 400 г')
})

test('нотатки приготування — дослівні кроки; порції «на 2-х»', () => {
  const omelet = byName('Омлет')
  assert.deepEqual(omelet.steps, ['Напій без цукру на вибір.'])
  assert.equal(omelet.servings, 2)
  assert.equal(
    at(byName('Запечені сирники').steps, 0),
    'Випікати 20 хв при 180°C на пергаменті.',
  )
  assert.equal(byName('Сирок «Волошкове поле»').servings, null)
})

test('готові порції дослівно, з прив’язкою до складника (MER-24)', () => {
  const lunch = byName('Крем-суп')
  assert.deepEqual(lunch.portions, [
    {
      component: 'Крем-суп з цвітної капусти (на 2 дні для двох)',
      text: 'Ж - 250 мл; Ч - 350 мл',
    },
    { component: 'Куряча грудка запечена', text: 'Ж - 120 г; Ч - 180 г' },
    {
      component: 'Нешліфований рис (гарнір)',
      text: 'Ж - 100 г готового; Ч - 175 г готового',
    },
  ])
  const omelet = byName('Омлет')
  assert.equal(omelet.portions.length, 1)
  assert.ok(at(omelet.portions, 0).text.includes('Ч - омлет ~230 г'))
})

test('повтори й дублікати позначено, сирий текст збережено', () => {
  const repeats = parsed.entries.filter((e) => e.kind === 'repeat')
  assert.equal(repeats.length, 3)
  assert.ok(at(repeats, 0).raw.join('\n').includes('Той самий, що в день 1'))
  assert.equal(at(repeats, 2).name, 'те саме, з суботи')

  const dup = parsed.entries.find((e) => e.kind === 'dup')
  assert.ok(dup)
  assert.equal(dup.name, 'Сирок «Волошкове поле»')
  assert.ok(dup.flags.some((f) => f.code === 'dup'))
})

test('порожній і несхожий текст не вигадують страв', () => {
  assert.deepEqual(parsePlanText('').entries, [])
  assert.deepEqual(parsePlanText('Просто якийсь текст без слотів.').entries, [])
})
