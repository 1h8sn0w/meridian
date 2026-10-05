/**
 * Стартовий набір страв (MER-77): формат файлу й його перевірка.
 *
 * Набір — це страви з планів дієтолога, якими засівається пул нової сім'ї.
 * Файл живе на сервері self-host ПОЗА репозиторієм (плани — персональні дані),
 * а застосунок отримує його через RPC і засіває пул сам. Формат описано в
 * `packages/core/README.md` — за ним файл і збирають.
 *
 * Перевірка сувора, бо це медичні дані, які людина збирає руками: помилка в
 * назві поля («calorie» замість «calories») інакше тихо загубила б значення.
 * Тому:
 *  - кожне поле страви обов'язкове, навіть порожнє (`null`, `[]`, `""`): так
 *    у файлі видно, що значення в джерелі справді немає, а не що його забули;
 *  - невідоме поле — помилка;
 *  - типи й межі — ті самі, що в схемі БД (`integer`, `>= 0`, `servings > 0`),
 *    інакше сервер відкинув би запис уже після засіву.
 * Помилки збираються всі одразу, а не до першої: файл виправляють за один
 * прохід.
 */

import { MEAL_TYPES } from './types.ts'
import type {
  Ingredient,
  Meal,
  MealType,
  Portion,
  Recipe,
  Result,
} from './types.ts'

/** Версія формату. Змінюється лише несумісною зміною формату. */
export const STARTER_SET_VERSION = 1

/** Рецептна частина страви з набору — поля таблиці `recipe` без фото. */
export type StarterRecipe = Pick<Recipe, 'steps' | 'prepTime' | 'servings'>

/**
 * Страва набору — усі поля `Meal`, лише замість `id` стабільний `key`. З нього
 * та сім'я виводить id рядка (`starterMealId`), тож повторний засів і другий
 * пристрій потрапляють на той самий рядок, а не дублюють страву.
 */
export type StarterMeal = Omit<Meal, 'id'> & {
  key: string
  /** null — рецепта в джерелі немає. */
  recipe: StarterRecipe | null
}

export type StarterSet = {
  version: typeof STARTER_SET_VERSION
  meals: Array<StarterMeal>
}

const MEAL_FIELDS = [
  'key',
  'name',
  'type',
  'calories',
  'caloriesApprox',
  'protein',
  'fat',
  'carbs',
  'ingredients',
  'portions',
  'source',
  'gerd',
  'sourceIssues',
  'recipe',
] as const

const RECIPE_FIELDS = ['steps', 'prepTime', 'servings'] as const

/** Скільки помилок показати: решта однаково з'явиться після виправлення. */
const MAX_ERRORS = 30

type Raw = Record<string, unknown>

function isObject(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Поля об'єкта: відсутні обов'язкові й невідомі зайві. */
function checkFields(
  raw: Raw,
  fields: ReadonlyArray<string>,
  at: string,
  errors: Array<string>,
): void {
  for (const field of fields) {
    if (!(field in raw)) errors.push(at + ': немає поля «' + field + '».')
  }
  for (const field of Object.keys(raw)) {
    if (!fields.includes(field)) {
      errors.push(at + ': невідоме поле «' + field + '».')
    }
  }
}

/** Число `>= 0` або null; `integer` — як колонка в БД. */
function checkAmount(
  value: unknown,
  label: string,
  integer: boolean,
  errors: Array<string>,
): number | null {
  if (value === null) return null
  if (!isNumber(value) || value < 0 || (integer && !Number.isInteger(value))) {
    errors.push(
      label +
        (integer
          ? ' — ціле невід’ємне число або null.'
          : ' — невід’ємне число або null.'),
    )
    return null
  }
  return value
}

function checkStrings(
  value: unknown,
  label: string,
  errors: Array<string>,
): Array<string> {
  if (!Array.isArray(value) || !value.every(isText)) {
    errors.push(label + ' — масив непорожніх рядків.')
    return []
  }
  return value.map((entry) => entry.trim())
}

function checkIngredient(
  entry: unknown,
  label: string,
  errors: Array<string>,
): Ingredient | null {
  if (isText(entry)) return entry.trim()
  if (!isObject(entry) || !isText(entry.name)) {
    errors.push(
      label + ' — рядок або {name, amount?, unit?} з непорожнім name.',
    )
    return null
  }
  for (const field of Object.keys(entry)) {
    if (!['name', 'amount', 'unit'].includes(field)) {
      errors.push(label + ': невідоме поле «' + field + '».')
    }
  }
  const out: Ingredient = { name: entry.name.trim() }
  // Кількість і одиниця — лише якщо вони є в джерелі (як і в `rows.ts`).
  if ('amount' in entry) {
    if (!isNumber(entry.amount) || entry.amount < 0) {
      errors.push(label + ': amount — невід’ємне число.')
    } else out.amount = entry.amount
  }
  if ('unit' in entry) {
    if (!isText(entry.unit)) errors.push(label + ': unit — непорожній рядок.')
    else out.unit = entry.unit.trim()
  }
  return out
}

function checkPortion(
  entry: unknown,
  label: string,
  errors: Array<string>,
): Portion | null {
  if (
    !isObject(entry) ||
    !isText(entry.text) ||
    !(entry.component === null || isText(entry.component)) ||
    Object.keys(entry).some(
      (field) => field !== 'text' && field !== 'component',
    )
  ) {
    errors.push(label + ' — {component: рядок або null, text: рядок}.')
    return null
  }
  return {
    component: entry.component === null ? null : entry.component.trim(),
    text: entry.text.trim(),
  }
}

function checkRecipe(
  value: unknown,
  at: string,
  errors: Array<string>,
): StarterRecipe | null {
  if (value === null) return null
  if (!isObject(value)) {
    errors.push(at + ': recipe — об’єкт {steps, prepTime, servings} або null.')
    return null
  }
  checkFields(value, RECIPE_FIELDS, at + ', recipe', errors)
  const servings = checkAmount(
    value.servings,
    at + ': recipe.servings',
    true,
    errors,
  )
  if (servings === 0) errors.push(at + ': recipe.servings — від 1 або null.')
  return {
    steps: checkStrings(value.steps, at + ': recipe.steps', errors),
    prepTime: checkAmount(
      value.prepTime,
      at + ': recipe.prepTime',
      true,
      errors,
    ),
    servings,
  }
}

function checkMeal(
  raw: unknown,
  index: number,
  errors: Array<string>,
): StarterMeal | null {
  if (!isObject(raw)) {
    errors.push('Страва #' + (index + 1) + ': не об’єкт.')
    return null
  }
  const at =
    'Страва #' +
    (index + 1) +
    (isText(raw.name) ? ' «' + raw.name.trim() + '»' : '')
  checkFields(raw, MEAL_FIELDS, at, errors)

  if (!isText(raw.key)) errors.push(at + ': key — непорожній рядок.')
  if (!isText(raw.name)) errors.push(at + ': name — непорожній рядок.')
  if (!MEAL_TYPES.includes(raw.type as MealType)) {
    errors.push(at + ': type — одне з ' + MEAL_TYPES.join(' / ') + '.')
  }
  const calories = checkAmount(raw.calories, at + ': calories', true, errors)
  if (typeof raw.caloriesApprox !== 'boolean') {
    errors.push(at + ': caloriesApprox — true або false.')
  } else if (raw.caloriesApprox && raw.calories === null) {
    // «≈» без числа — позначка ні про що (MER-26).
    errors.push(at + ': caloriesApprox: true без calories.')
  }
  if (typeof raw.gerd !== 'boolean') {
    errors.push(at + ': gerd — true або false.')
  }
  if (typeof raw.source !== 'string') {
    errors.push(at + ': source — рядок (порожній, якщо плану не вказано).')
  }

  const ingredients = Array.isArray(raw.ingredients)
    ? raw.ingredients.map((entry, i) =>
        checkIngredient(entry, at + ': ingredients[' + i + ']', errors),
      )
    : (errors.push(at + ': ingredients — масив.'), [])
  const portions = Array.isArray(raw.portions)
    ? raw.portions.map((entry, i) =>
        checkPortion(entry, at + ': portions[' + i + ']', errors),
      )
    : (errors.push(at + ': portions — масив.'), [])

  return {
    key: String(raw.key ?? '').trim(),
    name: String(raw.name ?? '').trim(),
    type: raw.type as MealType,
    calories,
    caloriesApprox: raw.caloriesApprox === true,
    protein: checkAmount(raw.protein, at + ': protein', false, errors),
    fat: checkAmount(raw.fat, at + ': fat', false, errors),
    carbs: checkAmount(raw.carbs, at + ': carbs', false, errors),
    ingredients: ingredients.filter((x): x is Ingredient => x !== null),
    portions: portions.filter((x): x is Portion => x !== null),
    source: typeof raw.source === 'string' ? raw.source.trim() : '',
    gerd: raw.gerd === true,
    sourceIssues: checkStrings(raw.sourceIssues, at + ': sourceIssues', errors),
    recipe: checkRecipe(raw.recipe, at, errors),
  }
}

/**
 * Розібраний JSON → стартовий набір. Будь-яка помилка — увесь набір
 * відкидається: засіяти половину медичних даних гірше, ніж не засіяти нічого.
 */
export function parseStarterSet(input: unknown): Result<{ set: StarterSet }> {
  const errors: Array<string> = []
  if (!isObject(input)) {
    return { ok: false, error: 'Стартовий набір: очікується JSON-об’єкт.' }
  }
  checkFields(input, ['version', 'meals'], 'Стартовий набір', errors)
  if (input.version !== STARTER_SET_VERSION) {
    errors.push(
      'Стартовий набір: version має бути ' + STARTER_SET_VERSION + '.',
    )
  }
  const raws = Array.isArray(input.meals) ? input.meals : []
  if (!Array.isArray(input.meals)) {
    errors.push('Стартовий набір: meals — масив страв.')
  }

  const meals: Array<StarterMeal> = []
  const keys = new Set<string>()
  raws.forEach((raw, index) => {
    const meal = checkMeal(raw, index, errors)
    if (!meal) return
    if (meal.key && keys.has(meal.key)) {
      errors.push(
        'Страва #' + (index + 1) + ': key «' + meal.key + '» повторюється.',
      )
    }
    keys.add(meal.key)
    meals.push(meal)
  })

  if (errors.length) {
    const shown = errors.slice(0, MAX_ERRORS)
    if (errors.length > MAX_ERRORS) {
      shown.push('…і ще ' + (errors.length - MAX_ERRORS) + '.')
    }
    return { ok: false, error: shown.join('\n') }
  }
  return { ok: true, set: { version: STARTER_SET_VERSION, meals } }
}

/** Чи є в рецепті хоч щось — порожній рядок `recipe` засів не створює. */
export function hasRecipe(
  recipe: StarterRecipe | null,
): recipe is StarterRecipe {
  return (
    recipe !== null &&
    (recipe.steps.length > 0 ||
      recipe.prepTime !== null ||
      recipe.servings !== null)
  )
}
