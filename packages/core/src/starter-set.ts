import { MEAL_TYPES } from './types.ts'
import type {
  Ingredient,
  Meal,
  MealType,
  Portion,
  Recipe,
  Result,
} from './types.ts'

const STARTER_SET_VERSION = 1

export type StarterRecipe = Pick<Recipe, 'steps' | 'prepTime' | 'servings'>

export type StarterMeal = Omit<Meal, 'id'> & {
  key: string
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
