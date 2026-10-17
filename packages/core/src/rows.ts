import { optionalNumber } from './provenance.ts'
import { MEAL_TYPES } from './types.ts'
import type {
  Ingredient,
  Meal,
  MealPrefValue,
  MealType,
  Nutrition,
  Portion,
  PortionLetter,
  Profile,
  Recipe,
  TastePrefs,
} from './types.ts'

export type Row = Record<string, unknown>

function text(row: Row, column: string): string {
  const value = row[column]
  return value === null || value === undefined ? '' : String(value)
}

function requiredText(row: Row, column: string, what: string): string {
  const value = text(row, column).trim()
  if (!value) throw new Error(what + ': порожнє поле «' + column + '».')
  return value
}

function bool(row: Row, column: string, missing = false): boolean {
  const value = row[column]
  if (value === null || value === undefined || value === '') return missing
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === '1' || value === 'true'
  return false
}

function jsonArray(row: Row, column: string, what: string): Array<unknown> {
  const value = row[column]
  if (value === null || value === undefined || value === '') return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') {
    throw new Error(what + ': поле «' + column + '» не масив.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (cause) {
    throw new Error(
      what + ': поле «' + column + '» — некоректний JSON: ' + String(cause),
      { cause },
    )
  }
  if (parsed === null) return []
  if (!Array.isArray(parsed)) {
    throw new Error(what + ': поле «' + column + '» не масив.')
  }
  return parsed
}

function mealType(value: string, what: string): MealType {
  if (!MEAL_TYPES.includes(value as MealType)) {
    throw new Error(what + ': невідомий тип слота «' + value + '».')
  }
  return value as MealType
}

function ingredient(entry: unknown): Ingredient | null {
  if (typeof entry === 'string') {
    const name = entry.trim()
    return name ? name : null
  }
  if (entry && typeof entry === 'object') {
    const raw = entry as Record<string, unknown>
    const name = String(raw.name ?? '').trim()
    if (!name) return null
    const amount = optionalNumber(raw.amount)
    const unit = String(raw.unit ?? '').trim()
    const out: Ingredient = { name }
    if (amount !== null) out.amount = amount
    if (unit) out.unit = unit
    return out
  }
  return null
}

function portion(entry: unknown): Portion | null {
  if (typeof entry === 'string' || typeof entry === 'number') {
    const value = String(entry).trim()
    return value ? { component: null, text: value } : null
  }
  if (entry && typeof entry === 'object') {
    const raw = entry as Record<string, unknown>
    const value = String(raw.text ?? '').trim()
    if (!value) return null
    const component = String(raw.component ?? '').trim()
    return { component: component || null, text: value }
  }
  return null
}

function nutritionFromRow(row: Row, suffix: '' | '_w'): Nutrition {
  return {
    calories: optionalNumber(row['calories' + suffix]),
    protein: optionalNumber(row['protein' + suffix]),
    fat: optionalNumber(row['fat' + suffix]),
    carbs: optionalNumber(row['carbs' + suffix]),
  }
}

export function mealFromRow(row: Row): Meal {
  const what = 'Страва «' + text(row, 'id') + '»'
  const nutritionCh = nutritionFromRow(row, '')
  return {
    id: requiredText(row, 'id', 'Страва'),
    name: requiredText(row, 'name', what),
    type: mealType(requiredText(row, 'type', what), what),
    ...nutritionCh,
    caloriesApprox: bool(row, 'calories_approx'),
    nutrition: { Ч: nutritionCh, Ж: nutritionFromRow(row, '_w') },
    ingredients: jsonArray(row, 'ingredients', what)
      .map(ingredient)
      .filter((x): x is Ingredient => x !== null),
    source: text(row, 'source').trim(),
    portions: jsonArray(row, 'portions', what)
      .map(portion)
      .filter((x): x is Portion => x !== null),
    gerd: bool(row, 'gerd'),
    sourceIssues: jsonArray(row, 'source_issues', what)
      .filter((x): x is string => typeof x === 'string')
      .map((x) => x.trim())
      .filter((x) => x.length > 0),
  }
}

export function recipeFromRow(row: Row): Recipe {
  const what = 'Рецепт «' + text(row, 'id') + '»'
  return {
    id: requiredText(row, 'id', 'Рецепт'),
    mealId: requiredText(row, 'meal_id', what),
    steps: jsonArray(row, 'steps', what)
      .map((step) => String(step).trim())
      .filter((step) => step.length > 0),
    prepTime: optionalNumber(row.prep_time),
    servings: optionalNumber(row.servings),
    photo: text(row, 'photo').trim() || null,
  }
}

export function profileFromRow(row: Row): Profile {
  const what = 'Профіль «' + text(row, 'id') + '»'
  const letter = text(row, 'portion').trim()
  if (letter && letter !== 'Ж' && letter !== 'Ч') {
    throw new Error(what + ': невідома порційна літера «' + letter + '».')
  }
  const target = optionalNumber(row.target_calories)
  if (target === null || target <= 0) {
    throw new Error(what + ': цільова калорійність має бути додатною.')
  }
  const rawMealIds = row.meal_ids
  return {
    id: requiredText(row, 'id', 'Профіль'),
    name: requiredText(row, 'name', what),
    targetCalories: target,
    corridor: optionalNumber(row.corridor) ?? 0,
    portion: letter ? (letter as PortionLetter) : null,
    mealIds:
      rawMealIds === null || rawMealIds === undefined || rawMealIds === ''
        ? null
        : jsonArray(row, 'meal_ids', what).map(String),
    sharedPlanWith: text(row, 'shared_plan_with').trim() || null,
    goalProtein: optionalNumber(row.goal_protein),
    goalFat: optionalNumber(row.goal_fat),
    goalCarbs: optionalNumber(row.goal_carbs),
    withSnack: bool(row, 'with_snack', true),
  }
}

export function prefsFromRows(rows: ReadonlyArray<Row>): TastePrefs {
  const favorites = new Set<string>()
  const disliked = new Set<string>()
  for (const row of rows) {
    const mealId = text(row, 'meal_id').trim()
    if (!mealId) continue
    const value: string = text(row, 'value').trim()
    if (value === ('favorite' satisfies MealPrefValue)) favorites.add(mealId)
    else if (value === ('disliked' satisfies MealPrefValue))
      disliked.add(mealId)
  }
  return { favorites, disliked }
}
