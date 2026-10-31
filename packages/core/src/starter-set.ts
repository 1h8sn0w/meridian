import { hasMacros } from './provenance.ts'
import {
  DEFAULT_PORTION,
  MEAL_TYPES,
  NO_NUTRITION,
  PORTION_LETTERS,
} from './types.ts'
import type {
  Ingredient,
  Meal,
  MealType,
  Nutrition,
  Portion,
  PortionLetter,
  Recipe,
  Result,
} from './types.ts'

const STARTER_SET_VERSION = 2

const FLAT_NUTRITION_VERSION = 1

export type StarterRecipe = Pick<Recipe, 'steps' | 'prepTime' | 'servings'>

export type StarterMeal = Omit<Meal, 'id'> & {
  key: string
  recipe: StarterRecipe | null
}

export type StarterSet = {
  version: typeof STARTER_SET_VERSION
  meals: Array<StarterMeal>
}

const NUTRITION_FIELDS = ['calories', 'protein', 'fat', 'carbs'] as const

const COMMON_MEAL_FIELDS = [
  'key',
  'name',
  'type',
  'caloriesApprox',
  'ingredients',
  'portions',
  'source',
  'gerd',
  'sourceIssues',
  'recipe',
] as const

const MEAL_FIELDS: Readonly<Record<number, ReadonlyArray<string>>> = {
  [FLAT_NUTRITION_VERSION]: [...COMMON_MEAL_FIELDS, ...NUTRITION_FIELDS],
  [STARTER_SET_VERSION]: [...COMMON_MEAL_FIELDS, 'nutrition'],
}

const OPTIONAL_MEAL_FIELDS = ['macrosApprox'] as const

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
  optional: ReadonlyArray<string> = [],
): void {
  for (const field of fields) {
    if (!(field in raw)) errors.push(at + ': немає поля «' + field + '».')
  }
  for (const field of Object.keys(raw)) {
    if (!fields.includes(field) && !optional.includes(field)) {
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

function checkNutrition(
  raw: Raw,
  prefix: string,
  errors: Array<string>,
): Nutrition {
  return {
    calories: checkAmount(raw.calories, prefix + 'calories', true, errors),
    protein: checkAmount(raw.protein, prefix + 'protein', false, errors),
    fat: checkAmount(raw.fat, prefix + 'fat', false, errors),
    carbs: checkAmount(raw.carbs, prefix + 'carbs', false, errors),
  }
}

function checkPortionNutrition(
  value: unknown,
  at: string,
  errors: Array<string>,
): Record<PortionLetter, Nutrition> {
  const out: Record<PortionLetter, Nutrition> = {
    Ж: { ...NO_NUTRITION },
    Ч: { ...NO_NUTRITION },
  }
  if (!isObject(value)) {
    errors.push(at + ': nutrition — об’єкт {Ж, Ч}.')
    return out
  }
  checkFields(value, PORTION_LETTERS, at + ', nutrition', errors)
  for (const letter of PORTION_LETTERS) {
    const entry = value[letter]
    if (!isObject(entry)) {
      errors.push(
        at +
          ': nutrition.' +
          letter +
          ' — об’єкт {calories, protein, fat, carbs}.',
      )
      continue
    }
    checkFields(entry, NUTRITION_FIELDS, at + ', nutrition.' + letter, errors)
    out[letter] = checkNutrition(
      entry,
      at + ': nutrition.' + letter + '.',
      errors,
    )
  }
  return out
}

function checkMeal(
  raw: unknown,
  index: number,
  version: number,
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
  checkFields(
    raw,
    MEAL_FIELDS[version] as ReadonlyArray<string>,
    at,
    errors,
    OPTIONAL_MEAL_FIELDS,
  )

  if (!isText(raw.key)) errors.push(at + ': key — непорожній рядок.')
  if (!isText(raw.name)) errors.push(at + ': name — непорожній рядок.')
  if (!MEAL_TYPES.includes(raw.type as MealType)) {
    errors.push(at + ': type — одне з ' + MEAL_TYPES.join(' / ') + '.')
  }
  const nutrition =
    version === FLAT_NUTRITION_VERSION
      ? { Ж: { ...NO_NUTRITION }, Ч: checkNutrition(raw, at + ': ', errors) }
      : checkPortionNutrition(raw.nutrition, at, errors)
  if (typeof raw.caloriesApprox !== 'boolean') {
    errors.push(at + ': caloriesApprox — true або false.')
  } else if (
    raw.caloriesApprox &&
    PORTION_LETTERS.every((letter) => nutrition[letter].calories === null)
  ) {
    errors.push(at + ': caloriesApprox: true без калорійності жодної порції.')
  }
  if (raw.macrosApprox !== undefined && typeof raw.macrosApprox !== 'boolean') {
    errors.push(at + ': macrosApprox — true або false.')
  } else if (
    raw.macrosApprox &&
    !PORTION_LETTERS.some((letter) => hasMacros(nutrition[letter]))
  ) {
    errors.push(at + ': macrosApprox: true без БЖВ жодної порції.')
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
    ...nutrition[DEFAULT_PORTION],
    caloriesApprox: raw.caloriesApprox === true,
    macrosApprox: raw.macrosApprox === true,
    nutrition,
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
  const version = input.version
  if (typeof version !== 'number' || !(version in MEAL_FIELDS)) {
    return {
      ok: false,
      error:
        'Стартовий набір: version має бути ' +
        STARTER_SET_VERSION +
        ' (або ' +
        FLAT_NUTRITION_VERSION +
        ' — цифри лише порції Ч).',
    }
  }
  const raws = Array.isArray(input.meals) ? input.meals : []
  if (!Array.isArray(input.meals)) {
    errors.push('Стартовий набір: meals — масив страв.')
  }

  const meals: Array<StarterMeal> = []
  const keys = new Set<string>()
  raws.forEach((raw, index) => {
    const meal = checkMeal(raw, index, version, errors)
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
