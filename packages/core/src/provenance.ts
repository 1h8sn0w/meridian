import { MACRO_FIELDS, MEAL_TYPES, PORTION_LETTERS } from './types.ts'
import type {
  DayCalories,
  DayMacros,
  MacroField,
  MacroSum,
  Meal,
  MealType,
  Nutrition,
} from './types.ts'

export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

export function numberFromField(text: string): number | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  const n = Number(trimmed.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  return typeof value === 'string' ? numberFromField(value) : null
}

export function optionalNumber(
  value: unknown,
  what = 'Значення',
): number | null {
  const n = toNumber(value)
  if (n === null) return null
  if (n < 0) {
    throw new Error(
      what +
        " має бути невід'ємним числом, а тут " +
        JSON.stringify(value) +
        '.',
    )
  }
  return n
}

export function requiredNumber(value: unknown, what: string): number {
  const n = toNumber(value)
  if (n === null) throw new Error(what + ' — не число.')
  return n
}

export function hasMacros(
  meal: Pick<Meal, 'protein' | 'fat' | 'carbs'>,
): boolean {
  return MACRO_FIELDS.some((field) => hasValue(meal[field]))
}

export function nutritionChanges(
  before: Meal['nutrition'],
  after: Meal['nutrition'],
): { calories: boolean; macros: boolean } {
  const differs = (fields: ReadonlyArray<keyof Nutrition>) =>
    PORTION_LETTERS.some((letter) =>
      fields.some((field) => before[letter][field] !== after[letter][field]),
    )
  return { calories: differs(['calories']), macros: differs(MACRO_FIELDS) }
}

export function formatCalories(
  value: number | null | undefined,
  approx = false,
  unit = 'ккал',
): string {
  if (!hasValue(value)) return ''
  return (approx ? '≈' : '') + String(value) + ' ' + unit
}

export function formatMealCalories(meal: Meal, unit?: string): string {
  return formatCalories(meal.calories, meal.caloriesApprox, unit)
}

export function formatPortionCalories(meal: Meal, unit?: string): string {
  return PORTION_LETTERS.filter((letter) =>
    hasValue(meal.nutrition[letter].calories),
  )
    .map(
      (letter) =>
        letter +
        ' ' +
        formatCalories(
          meal.nutrition[letter].calories,
          meal.caloriesApprox,
          unit,
        ),
    )
    .join(' · ')
}

export function formatDayCalories(day: DayCalories, unit?: string): string {
  if (day.unknown > 0 && day.total === 0) return ''
  return formatCalories(day.total, day.approx, unit)
}

type DayMealsOrHoles = Partial<Record<MealType, Meal | null | undefined>>

function daySum(
  meals: DayMealsOrHoles,
  field: keyof Nutrition,
  approxFlag: 'caloriesApprox' | 'macrosApprox',
): MacroSum {
  const sum: MacroSum = { total: 0, known: 0, unknown: 0, approx: false }
  for (const type of MEAL_TYPES) {
    const meal = meals[type]
    if (meal === undefined) continue
    if (!meal || !hasValue(meal[field])) {
      sum.unknown += 1
      continue
    }
    sum.total += meal[field] as number
    sum.known += 1
    if (meal[approxFlag]) sum.approx = true
  }
  return sum
}

export function dayCalories(meals: DayMealsOrHoles): DayCalories {
  const { total, unknown, approx } = daySum(meals, 'calories', 'caloriesApprox')
  return { total, unknown, approx }
}

export function dayMacros(meals: DayMealsOrHoles): DayMacros {
  const sum = (field: MacroField) => daySum(meals, field, 'macrosApprox')
  return { protein: sum('protein'), fat: sum('fat'), carbs: sum('carbs') }
}

export function dayInCorridor(
  day: DayCalories,
  target: number,
  corridor: number,
): boolean {
  return day.unknown === 0 && Math.abs(day.total - target) <= corridor
}
