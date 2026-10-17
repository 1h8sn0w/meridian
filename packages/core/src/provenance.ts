import { MEAL_TYPES, PORTION_LETTERS } from './types.ts'
import type { DayCalories, Meal, MealType } from './types.ts'

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
  return hasValue(meal.protein) || hasValue(meal.fat) || hasValue(meal.carbs)
}

export function formatMacro(value: number | null | undefined): string {
  return hasValue(value) ? (value as number).toLocaleString('uk-UA') : '—'
}

export function formatCalories(
  value: number | null | undefined,
  approx = false,
): string {
  if (!hasValue(value)) return ''
  return (approx ? '≈' : '') + String(value) + ' ккал'
}

export function formatMealCalories(meal: Meal): string {
  return formatCalories(meal.calories, meal.caloriesApprox)
}

export function formatPortionCalories(meal: Meal): string {
  return PORTION_LETTERS.filter((letter) =>
    hasValue(meal.nutrition[letter].calories),
  )
    .map(
      (letter) =>
        letter +
        ' ' +
        formatCalories(meal.nutrition[letter].calories, meal.caloriesApprox),
    )
    .join(' · ')
}

export function formatDayCalories(day: DayCalories): string {
  if (day.unknown > 0 && day.total === 0) return ''
  return formatCalories(day.total, day.approx)
}

export function dayCalories(
  meals: Partial<Record<MealType, Meal | null | undefined>>,
): DayCalories {
  let total = 0
  let unknown = 0
  let approx = false
  for (const type of MEAL_TYPES) {
    const meal = meals[type]
    if (meal === undefined) continue
    if (!meal || !hasValue(meal.calories)) {
      unknown += 1
      continue
    }
    total += meal.calories as number
    if (meal.caloriesApprox) approx = true
  }
  return { total, unknown, approx }
}

export function dayInCorridor(
  day: DayCalories,
  target: number,
  corridor: number,
): boolean {
  return day.unknown === 0 && Math.abs(day.total - target) <= corridor
}
