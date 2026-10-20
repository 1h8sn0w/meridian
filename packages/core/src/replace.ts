import { dayCalories, hasValue } from './provenance.ts'
import { plansCovering, poolPlans, weekSources } from './plans.ts'
import { DEFAULTS } from './generator.ts'
import { MEAL_TYPES, NO_PREFS } from './types.ts'
import type {
  Meal,
  MealType,
  PlanDay,
  PlannedMeal,
  Result,
  TastePrefs,
  WeekPlan,
} from './types.ts'

export type SwapReason =
  'dayIncomplete' | 'outsideCorridor' | 'repeatSoon' | 'breaksMix'

export type SlotFailure =
  | { code: 'noDay'; day: number }
  | { code: 'unknownSlot'; slot: string }
  | { code: 'noSlot'; day: number; slot: MealType }
  | { code: 'typeMismatch'; meal: string; mealType: MealType; slot: MealType }

type ReplacementCandidate = {
  meal: PlannedMeal
  dayCalories: number
  withinCorridor: boolean
  repeatSoon: boolean
  mixOk: boolean
  favorite: boolean
  disliked: boolean
  valid: boolean
  reasons: Array<SwapReason>
}

type Replacements = {
  current: Meal
  target: number
  corridor: number
  mixRequired: boolean
  candidates: Array<ReplacementCandidate>
}

function findSlot(
  plan: WeekPlan,
  dayIndex: number,
  slotType: MealType,
): Result<{ day: PlanDay; current: Meal }, SlotFailure> {
  const day = plan.days[dayIndex]
  if (!Number.isInteger(dayIndex) || !day) {
    return { ok: false, error: { code: 'noDay', day: dayIndex + 1 } }
  }
  if (!MEAL_TYPES.includes(slotType)) {
    return { ok: false, error: { code: 'unknownSlot', slot: slotType } }
  }
  const current = day.meals[slotType]
  if (!current) {
    return {
      ok: false,
      error: { code: 'noSlot', day: dayIndex + 1, slot: slotType },
    }
  }
  return { ok: true, day, current }
}

export function suggestReplacements(
  pool: ReadonlyArray<Meal>,
  plan: WeekPlan,
  dayIndex: number,
  slotType: MealType,
  prefs: TastePrefs = NO_PREFS,
): Result<Replacements, SlotFailure> {
  const found = findSlot(plan, dayIndex, slotType)
  if (!found.ok) return found
  const { day, current } = found
  const target = plan.params.targetCalories
  const corridor = Number.isFinite(plan.usedCorridor)
    ? plan.usedCorridor
    : DEFAULTS.corridor

  let others = 0
  let othersUnknown = 0
  for (const type of MEAL_TYPES) {
    if (type === slotType) continue
    const meal = day.meals[type]
    if (!meal) continue
    if (hasValue(meal.calories)) others += meal.calories as number
    else othersUnknown += 1
  }
  const dayComparable = othersUnknown === 0

  const anti = Math.max(1, Math.floor(plan.params.antiRepeatDays) || 1)
  const nearIds = new Set<string>()
  const from = Math.max(0, dayIndex - anti + 1)
  const to = Math.min(plan.days.length - 1, dayIndex + anti - 1)
  for (let d = from; d <= to; d++) {
    if (d === dayIndex) continue
    const other = plan.days[d]
    if (!other) continue
    for (const meal of Object.values(other.meals)) nearIds.add(meal.id)
  }

  const universe = poolPlans(pool)
  const mixRequired =
    universe.size >= 2 && plansCovering(pool, universe).size === 0
  const fixedWeekMeals: Array<Meal> = []
  plan.days.forEach((planDay, di) => {
    for (const type of MEAL_TYPES) {
      const meal = planDay.meals[type]
      if (meal && !(di === dayIndex && type === slotType)) {
        fixedWeekMeals.push(meal)
      }
    }
  })

  const candidates = pool
    .filter(
      (meal): meal is PlannedMeal =>
        meal.type === slotType &&
        meal.id !== current.id &&
        hasValue(meal.calories),
    )
    .map((meal): ReplacementCandidate => {
      const forecast = others + meal.calories
      const withinCorridor =
        dayComparable && Math.abs(forecast - target) <= corridor
      const repeatSoon = nearIds.has(meal.id)
      const mixOk =
        !mixRequired ||
        plansCovering(fixedWeekMeals.concat([meal]), universe).size === 0
      const reasons: Array<SwapReason> = []
      if (!dayComparable) reasons.push('dayIncomplete')
      else if (!withinCorridor) reasons.push('outsideCorridor')
      if (repeatSoon) reasons.push('repeatSoon')
      if (!mixOk) reasons.push('breaksMix')
      return {
        meal,
        dayCalories: forecast,
        withinCorridor,
        repeatSoon,
        mixOk,
        favorite: prefs.favorites.has(meal.id),
        disliked: prefs.disliked.has(meal.id),
        valid: reasons.length === 0,
        reasons,
      }
    })
    .sort(
      (a, b) =>
        Number(b.valid) - Number(a.valid) ||
        Number(a.disliked) - Number(b.disliked) ||
        Number(b.favorite) - Number(a.favorite) ||
        Number(b.withinCorridor) - Number(a.withinCorridor) ||
        Number(a.repeatSoon) - Number(b.repeatSoon) ||
        Math.abs(a.dayCalories - target) - Math.abs(b.dayCalories - target),
    )

  return { ok: true, current, target, corridor, mixRequired, candidates }
}

export function replaceSlot(
  plan: WeekPlan,
  dayIndex: number,
  slotType: MealType,
  meal: Meal,
): Result<{ plan: WeekPlan }, SlotFailure> {
  const found = findSlot(plan, dayIndex, slotType)
  if (!found.ok) return found
  if (meal.type !== slotType) {
    return {
      ok: false,
      error: {
        code: 'typeMismatch',
        meal: meal.name,
        mealType: meal.type,
        slot: slotType,
      },
    }
  }

  const meals = { ...found.day.meals, [slotType]: meal }
  const nextDay: PlanDay = { meals, calories: dayCalories(meals) }
  const days = plan.days.map((d, i) => (i === dayIndex ? nextDay : d))

  return {
    ok: true,
    plan: { ...plan, days, sources: weekSources(days) },
  }
}
