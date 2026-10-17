import { MEAL_TYPES } from './types.ts'
import type { Meal, PlanDay } from './types.ts'

const MAX_PLAN_RANGE = 12

export function mealPlans(meal: Meal): Set<string> | null {
  const src = meal.source.trim()
  if (!src) return null

  const range = /(\d+)\s*[–—-]\s*(\d+)/.exec(src)
  if (range) {
    const whole = range[0]
    const from = Number.parseInt(range[1] as string, 10)
    const to = Number.parseInt(range[2] as string, 10)
    if (to >= from && to - from <= MAX_PLAN_RANGE) {
      const set = new Set<string>()
      for (let n = from; n <= to; n++) set.add(src.replace(whole, String(n)))
      return set
    }
  }
  return new Set([src])
}

export function poolPlans(meals: ReadonlyArray<Meal>): Set<string> {
  const all = new Set<string>()
  for (const meal of meals) {
    const plans = mealPlans(meal)
    if (plans) for (const plan of plans) all.add(plan)
  }
  return all
}

export function plansCovering(
  meals: ReadonlyArray<Meal>,
  universe: ReadonlySet<string>,
): Set<string> {
  let inter: Set<string> | null = null
  for (const meal of meals) {
    const plans = mealPlans(meal)
    if (!plans) continue
    if (inter === null) {
      inter = new Set(plans)
      continue
    }
    const next = new Set<string>()
    for (const plan of inter) if (plans.has(plan)) next.add(plan)
    inter = next
  }
  return inter === null ? new Set(universe) : inter
}

export function allWeekMeals(days: ReadonlyArray<PlanDay>): Array<Meal> {
  const out: Array<Meal> = []
  for (const day of days) {
    for (const type of MEAL_TYPES) {
      const meal = day.meals[type]
      if (meal) out.push(meal)
    }
  }
  return out
}

export function isMixedWeek(
  days: ReadonlyArray<PlanDay>,
  universe: ReadonlySet<string>,
): boolean {
  return plansCovering(allWeekMeals(days), universe).size === 0
}

export function mixPossibleIn(meals: ReadonlyArray<Meal>): boolean {
  const universe = poolPlans(meals)
  return universe.size >= 2 && plansCovering(meals, universe).size === 0
}

export function weekSources(days: ReadonlyArray<PlanDay>): Array<string> {
  const sources = new Set<string>()
  for (const meal of allWeekMeals(days)) {
    if (meal.source) sources.add(meal.source)
  }
  return [...sources].sort()
}
