/**
 * Розбір дампа V1 (MER-48). Перевіряємо саме те, через що міграція зазвичай і
 * бреше: підставлений нуль замість «невідомо», тихо загублене посилання й
 * повторний запуск, що подвоює пул.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { migrateV1 } from './migrate-v1.ts'
import type { MigratedProfile, Skipped, V1Migration } from './migrate-v1.ts'
import { mealPrefId } from './sync-ids.ts'
import type { Meal } from './types.ts'

const FAMILY = '11111111-1111-4111-8111-111111111111'
const OTHER_FAMILY = '22222222-2222-4222-8222-222222222222'

/** Страва пулу V1 — форма рівно та, що її пише `createMeal`. */
const GRECHKA = {
  id: 'meal_abc',
  name: 'Гречка з куркою',
  type: 'lunch',
  calories: 520,
  caloriesApprox: true,
  protein: 38,
  fat: null,
  carbs: null,
  ingredients: [{ name: 'сирок', amount: 40, unit: 'г' }, 'овочі на вибір'],
  source: 'Тиждень 2',
  steps: [],
  prepTime: null,
  servings: null,
  portions: [{ component: null, text: 'Ж - 130 г; Ч - 200 г' }],
  photo: null,
}

const OMLET = {
  id: 'meal_def',
  name: 'Омлет',
  type: 'breakfast',
  calories: 310,
  caloriesApprox: false,
  protein: null,
  fat: null,
  carbs: null,
  ingredients: ['яйця'],
  source: 'Тиждень 1',
  steps: ['Збити яйця', 'Смажити 5 хв'],
  prepTime: 10,
  servings: 2,
  portions: [],
  photo: null,
}

const DEFAULT_PROFILE = {
  id: 'default',
  name: 'Профіль 1',
  targetCalories: 2000,
  corridor: 100,
  color: '#4f9dff',
  sharedPlanWith: null,
  portion: 'Ч',
  goals: { protein: 120, fat: null, carbs: null },
  mealIds: null,
}

const SECOND_PROFILE = {
  id: 'profile_second',
  name: 'Профіль 2',
  targetCalories: 1700,
  corridor: 120,
  color: '#e0729c',
  sharedPlanWith: 'default',
  portion: 'Ж',
  goals: { protein: null, fat: null, carbs: null },
  mealIds: ['meal_abc'],
}

function dump(data: Record<string, unknown>): unknown {
  return { format: 'meridian-v1-export', version: 1, data }
}

/** Повний дамп: пул, смаки, два профілі й ключі, які до V2 не їдуть. */
function fullDump(): unknown {
  return dump({
    'meridian.meals.v1': [GRECHKA, OMLET],
    'meridian.mealPrefs.v1': { meal_abc: 'favorite', meal_def: 'disliked' },
    'meridian.profiles.v1': {
      profiles: [DEFAULT_PROFILE, SECOND_PROFILE],
      activeId: 'default',
    },
    'meridian.week.v1.default': { days: [], params: {} },
    'meridian.calendar.v1.default': {},
    'meridian.shopping.v1': { checked: {}, fingerprint: 'abc' },
    'meridian.app.v1': { activeTab: 'today' },
  })
}

function mealNamed(result: V1Migration, name: string): Meal {
  const meal = result.meals.find((item) => item.name === name)
  assert.ok(meal, 'страву «' + name + '» не перенесено')
  return meal
}

function profileNamed(result: V1Migration, name: string): MigratedProfile {
  const profile = result.profiles.find((item) => item.name === name)
  assert.ok(profile, 'профіль «' + name + '» не перенесено')
  return profile
}

function reasons(skipped: ReadonlyArray<Skipped>, what: string): Array<string> {
  return skipped.filter((item) => item.what === what).map((item) => item.reason)
}

/* ==========================================================================
 * Страви: те, заради чого міграція й робиться
 * ======================================================================== */

test('страва переїжджає дослівно — план, «≈», порції, інгредієнти', () => {
  const meal = mealNamed(migrateV1(fullDump(), FAMILY), 'Гречка з куркою')
  assert.equal(meal.type, 'lunch')
  assert.equal(meal.calories, 520)
  // MER-26: прапорець приблизності не можна загубити — інакше оцінка почне
  // видавати себе за цифру дієтолога.
  assert.equal(meal.caloriesApprox, true)
  assert.equal(meal.protein, 38)
  assert.equal(meal.fat, null)
  // `source` — план дієтолога, а не провенанс-енум.
  assert.equal(meal.source, 'Тиждень 2')
  assert.deepEqual(meal.ingredients, [
    { name: 'сирок', amount: 40, unit: 'г' },
    'овочі на вибір',
  ])
  assert.deepEqual(meal.portions, [
    { component: null, text: 'Ж - 130 г; Ч - 200 г' },
  ])
})

test('нечислова калорійність стає NULL, а не нулем; нуль лишається нулем', () => {
  const result = migrateV1(
    dump({
      'meridian.meals.v1': [
        { ...GRECHKA, id: 'm_none', name: 'Без калорій', calories: '' },
        { ...GRECHKA, id: 'm_junk', name: 'Сміття', calories: 'бозна' },
        { ...GRECHKA, id: 'm_zero', name: 'Справжній нуль', calories: 0 },
      ],
    }),
    FAMILY,
  )
  assert.equal(mealNamed(result, 'Без калорій').calories, null)
  assert.equal(mealNamed(result, 'Сміття').calories, null)
  assert.equal(mealNamed(result, 'Справжній нуль').calories, 0)
})

test('пробіли, масив і boolean у полі числа — це NULL, а не нуль', () => {
  // `Number('   ')`, `Number([])` і `Number(false)` дають нуль, `Number(true)` —
  // одиницю. Тобто наївний `Number()` вигадав би тут справжню цифру.
  const result = migrateV1(
    dump({
      'meridian.meals.v1': [
        { ...GRECHKA, id: 'm_space', name: 'Пробіли', calories: '   ' },
        { ...GRECHKA, id: 'm_arr', name: 'Масив', calories: [] },
        { ...GRECHKA, id: 'm_bool', name: 'Булеве', calories: true },
        { ...GRECHKA, id: 'm_str', name: 'Числовий рядок', calories: ' 420 ' },
      ],
    }),
    FAMILY,
  )
  assert.equal(mealNamed(result, 'Пробіли').calories, null)
  assert.equal(mealNamed(result, 'Масив').calories, null)
  assert.equal(mealNamed(result, 'Булеве').calories, null)
  // Числовий рядок — це все-таки число: V1 міг зберегти його саме так.
  assert.equal(mealNamed(result, 'Числовий рядок').calories, 420)
})

test('булева ціль профілю не стає одиницею, а відкидає профіль', () => {
  const result = migrateV1(
    dump({
      'meridian.profiles.v1': {
        profiles: [{ ...DEFAULT_PROFILE, targetCalories: true }],
        activeId: 'default',
      },
    }),
    FAMILY,
  )
  assert.equal(result.profiles.length, 0)
  assert.match(
    reasons(result.skipped, 'Профіль «Профіль 1»')[0] ?? '',
    /не число/,
  )
})

test("від'ємне число не обнуляється, а відкидає запис із поясненням", () => {
  const result = migrateV1(
    dump({
      'meridian.meals.v1': [
        { ...GRECHKA, id: 'm_bad', name: 'Мінус', calories: -10 },
        OMLET,
      ],
    }),
    FAMILY,
  )
  assert.equal(result.meals.length, 1)
  assert.equal(result.meals[0]?.name, 'Омлет')
  assert.match(reasons(result.skipped, 'Страва «Мінус»')[0] ?? '', /невід'ємн/)
})

test('запис без назви або з невідомим слотом не переноситься мовчки', () => {
  const result = migrateV1(
    dump({
      'meridian.meals.v1': [
        { ...GRECHKA, id: 'm_noname', name: '   ' },
        { ...GRECHKA, id: 'm_badtype', name: 'Чужий слот', type: 'brunch' },
      ],
    }),
    FAMILY,
  )
  assert.equal(result.meals.length, 0)
  assert.equal(result.skipped.length, 2)
  assert.match(reasons(result.skipped, 'Страва «Чужий слот»')[0] ?? '', /слот/)
})

test('дубль id у пулі не подвоює страву', () => {
  const result = migrateV1(
    dump({ 'meridian.meals.v1': [GRECHKA, { ...GRECHKA, name: 'Копія' }] }),
    FAMILY,
  )
  assert.equal(result.meals.length, 1)
  assert.match(reasons(result.skipped, 'Страва «Копія»')[0] ?? '', /уже була/)
})

/* ==========================================================================
 * Рецепт — окрема таблиця, і порожнього рядка в ній не буває
 * ======================================================================== */

test('рецепт відділяється від страви й створюється лише за наявності полів', () => {
  const result = migrateV1(fullDump(), FAMILY)
  // У «Гречки» жодного рецептного поля немає — отже, рядка `recipe` теж.
  assert.equal(result.recipes.length, 1)
  const recipe = result.recipes[0]
  assert.ok(recipe)
  assert.equal(recipe.mealId, mealNamed(result, 'Омлет').id)
  assert.deepEqual(recipe.steps, ['Збити яйця', 'Смажити 5 хв'])
  assert.equal(recipe.prepTime, 10)
  assert.equal(recipe.servings, 2)
  assert.equal(recipe.photo, null)
})

test('фото саме по собі теж робить рецепт', () => {
  const result = migrateV1(
    dump({
      'meridian.meals.v1': [{ ...GRECHKA, photo: 'data:image/png;base64,AAA' }],
    }),
    FAMILY,
  )
  assert.equal(result.recipes.length, 1)
  assert.deepEqual(result.recipes[0]?.steps, [])
})

test('зіпсований рецепт не забирає з собою страву', () => {
  const result = migrateV1(
    dump({ 'meridian.meals.v1': [{ ...OMLET, servings: 0 }] }),
    FAMILY,
  )
  assert.equal(result.meals.length, 1)
  assert.equal(result.recipes.length, 0)
  assert.match(
    reasons(result.skipped, 'Страва «Омлет», рецепт')[0] ?? '',
    /порці/,
  )
})

/* ==========================================================================
 * Id: виведення, а не генерація
 * ======================================================================== */

test('повторний запуск дає ті самі id — імпорт ідемпотентний', () => {
  const first = migrateV1(fullDump(), FAMILY)
  const second = migrateV1(fullDump(), FAMILY)
  assert.deepEqual(
    first.meals.map((meal) => meal.id),
    second.meals.map((meal) => meal.id),
  )
  assert.deepEqual(
    first.profiles.map((profile) => profile.id),
    second.profiles.map((profile) => profile.id),
  )
  assert.deepEqual(
    first.prefs.map((pref) => pref.id),
    second.prefs.map((pref) => pref.id),
  )
})

test('id профілю «default» у різних сім’ях НЕ збігаються', () => {
  // У V1 профіль за замовчуванням має буквальний id `default` — однаковий у
  // кожного користувача. Без сім'ї в імені дві родини на одному self-host
  // зіткнулися б на первинному ключі.
  const mine = migrateV1(fullDump(), FAMILY)
  const theirs = migrateV1(fullDump(), OTHER_FAMILY)
  assert.notEqual(
    profileNamed(mine, 'Профіль 1').id,
    profileNamed(theirs, 'Профіль 1').id,
  )
})

test('id смаку виводиться зі страви, а не з ключа V1 (MER-57)', () => {
  // Той самий id має порахувати й застосунок, коли смак ставлять уже у V2, —
  // інакше друга вставка того самого смаку впаде на унікальному індексі.
  const result = migrateV1(fullDump(), FAMILY)
  const favorite = result.prefs.find((pref) => pref.value === 'favorite')
  assert.ok(favorite)
  assert.equal(favorite.id, mealPrefId(favorite.mealId))
})

/* ==========================================================================
 * Смаки (MER-18)
 * ======================================================================== */

test('смаки переїжджають із перерахованими посиланнями на страви', () => {
  const result = migrateV1(fullDump(), FAMILY)
  const favorite = result.prefs.find((pref) => pref.value === 'favorite')
  assert.ok(favorite)
  assert.equal(favorite.mealId, mealNamed(result, 'Гречка з куркою').id)
  assert.equal(result.prefs.length, 2)
})

test('смак страви, якої немає в перенесеному пулі, не переноситься', () => {
  const result = migrateV1(
    dump({
      'meridian.meals.v1': [GRECHKA],
      'meridian.mealPrefs.v1': {
        meal_gone: 'favorite',
        meal_abc: 'нісенітниця',
      },
    }),
    FAMILY,
  )
  assert.equal(result.prefs.length, 0)
  assert.match(
    reasons(result.skipped, 'Смак страви «meal_gone»')[0] ?? '',
    /немає в перенесеному пулі/,
  )
  assert.match(
    reasons(result.skipped, 'Смак страви «meal_abc»')[0] ?? '',
    /невідоме значення/,
  )
})

/* ==========================================================================
 * Профілі (MER-21, MER-17)
 * ======================================================================== */

test('профіль переїжджає з ціллю, коридором, порційною літерою й цілями БЖВ', () => {
  const profile = profileNamed(migrateV1(fullDump(), FAMILY), 'Профіль 1')
  assert.equal(profile.targetCalories, 2000)
  assert.equal(profile.corridor, 100)
  assert.equal(profile.portion, 'Ч')
  assert.equal(profile.color, '#4f9dff')
  assert.equal(profile.goalProtein, 120)
  assert.equal(profile.goalFat, null)
  assert.equal(profile.mealIds, null)
})

test('спільний план зводиться на новий id власника (MER-17)', () => {
  const result = migrateV1(fullDump(), FAMILY)
  assert.equal(
    profileNamed(result, 'Профіль 2').sharedPlanWith,
    profileNamed(result, 'Профіль 1').id,
  )
})

test('спільний план на неперенесений профіль стає власним і потрапляє в skipped', () => {
  const result = migrateV1(
    dump({
      'meridian.profiles.v1': {
        profiles: [{ ...SECOND_PROFILE, sharedPlanWith: 'profile_gone' }],
        activeId: 'profile_second',
      },
    }),
    FAMILY,
  )
  assert.equal(profileNamed(result, 'Профіль 2').sharedPlanWith, null)
  assert.match(
    reasons(result.skipped, 'Профіль «Профіль 2»')[0] ?? '',
    /власник не потрапив/,
  )
})

test('профіль, що ділив план сам із собою, отримує власний', () => {
  const result = migrateV1(
    dump({
      'meridian.profiles.v1': {
        profiles: [{ ...DEFAULT_PROFILE, sharedPlanWith: 'default' }],
        activeId: 'default',
      },
    }),
    FAMILY,
  )
  assert.equal(profileNamed(result, 'Профіль 1').sharedPlanWith, null)
  assert.match(
    reasons(result.skipped, 'Профіль «Профіль 1»')[0] ?? '',
    /сам із собою/,
  )
})

test('порожній mealIds і null — різні стани', () => {
  const result = migrateV1(
    dump({
      'meridian.meals.v1': [GRECHKA],
      'meridian.profiles.v1': {
        profiles: [
          { ...DEFAULT_PROFILE, mealIds: null },
          { ...SECOND_PROFILE, name: 'Порожня підмножина', mealIds: [] },
        ],
        activeId: 'default',
      },
    }),
    FAMILY,
  )
  assert.equal(profileNamed(result, 'Профіль 1').mealIds, null)
  assert.deepEqual(profileNamed(result, 'Порожня підмножина').mealIds, [])
})

test('підмножина страв перераховується, а загублені посилання — у skipped', () => {
  const result = migrateV1(
    dump({
      'meridian.meals.v1': [GRECHKA],
      'meridian.profiles.v1': {
        profiles: [
          {
            ...SECOND_PROFILE,
            sharedPlanWith: null,
            mealIds: ['meal_abc', 'meal_gone'],
          },
        ],
        activeId: 'profile_second',
      },
    }),
    FAMILY,
  )
  const profile = profileNamed(result, 'Профіль 2')
  assert.deepEqual(profile.mealIds, [mealNamed(result, 'Гречка з куркою').id])
  assert.match(
    reasons(result.skipped, 'Профіль «Профіль 2»').join(' '),
    /1 посил/,
  )
})

test('профіль без додатної цілі не переноситься, решта — переноситься', () => {
  const result = migrateV1(
    dump({
      'meridian.profiles.v1': {
        profiles: [
          { ...DEFAULT_PROFILE, name: 'Без цілі', targetCalories: 0 },
          SECOND_PROFILE,
        ],
        activeId: 'default',
      },
    }),
    FAMILY,
  )
  assert.equal(result.profiles.length, 1)
  assert.match(reasons(result.skipped, 'Профіль «Без цілі»')[0] ?? '', /додатн/)
})

test('невідома порційна літера відкидає профіль — вигадувати її нема з чого', () => {
  const result = migrateV1(
    dump({
      'meridian.profiles.v1': {
        profiles: [{ ...DEFAULT_PROFILE, portion: 'X' }],
        activeId: 'default',
      },
    }),
    FAMILY,
  )
  assert.equal(result.profiles.length, 0)
  assert.match(reasons(result.skipped, 'Профіль «Профіль 1»')[0] ?? '', /літер/)
})

test('битий колір не втрачає профіль — це акцент інтерфейсу, а не дані плану', () => {
  const result = migrateV1(
    dump({
      'meridian.profiles.v1': {
        profiles: [{ ...DEFAULT_PROFILE, color: 'синій' }],
        activeId: 'default',
      },
    }),
    FAMILY,
  )
  assert.equal(profileNamed(result, 'Профіль 1').color, '#4f9dff')
})

/* ==========================================================================
 * Те, що свідомо не переноситься
 * ======================================================================== */

test('тижні, календар, покупки й стан UI потрапляють у skipped із причиною', () => {
  const { skipped } = migrateV1(fullDump(), FAMILY)
  for (const key of [
    'meridian.week.v1.default',
    'meridian.calendar.v1.default',
    'meridian.shopping.v1',
    'meridian.app.v1',
  ]) {
    assert.equal(reasons(skipped, key).length, 1, key + ' не пояснено')
  }
})

test('допрофільні ключі V1 (без id профілю) теж пояснюються', () => {
  const { skipped } = migrateV1(dump({ 'meridian.week.v1': {} }), FAMILY)
  assert.equal(reasons(skipped, 'meridian.week.v1').length, 1)
})

test('нечитабельний ключ сховища не зникає мовчки', () => {
  const result = migrateV1(
    {
      data: {},
      unreadable: { 'meridian.meals.v1': '{битий' },
    },
    FAMILY,
  )
  assert.match(
    reasons(result.skipped, 'meridian.meals.v1')[0] ?? '',
    /коректним JSON/,
  )
})

/* ==========================================================================
 * Межі
 * ======================================================================== */

test('не дамп V1 — це помилка файлу, а не порожній результат', () => {
  assert.throws(() => migrateV1({ hello: 'world' }, FAMILY), /дамп Meridian V1/)
  assert.throws(() => migrateV1(null, FAMILY), /дамп Meridian V1/)
})

test("без сім'ї розбір не має сенсу: id вивести нема з чого", () => {
  assert.throws(() => migrateV1(fullDump(), '  '), /сім/)
})

test('порожній дамп дає порожній результат без помилок', () => {
  const result = migrateV1(dump({}), FAMILY)
  assert.deepEqual(result.meals, [])
  assert.deepEqual(result.profiles, [])
  assert.deepEqual(result.prefs, [])
  assert.deepEqual(result.recipes, [])
  assert.deepEqual(result.skipped, [])
})
