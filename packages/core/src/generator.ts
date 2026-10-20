import { dayCalories } from './provenance.ts'
import {
  allWeekMeals,
  isMixedWeek,
  mixPossibleIn,
  poolPlans,
  weekSources,
} from './plans.ts'
import { generationPool, mealTypesFor, portionOf } from './profile.ts'
import { NO_PREFS } from './types.ts'
import type {
  DayMeals,
  Meal,
  MealType,
  PlanDay,
  PlannedMeal,
  Profile,
  Result,
  TastePrefs,
  WeekParams,
  WeekPlan,
  WeekWarning,
} from './types.ts'

export const DEFAULTS: Readonly<WeekParams> = {
  targetCalories: 2000,
  corridor: 100,
  antiRepeatDays: 3,
  days: 7,
}

const CORRIDOR_STEP = 50
const CORRIDOR_MAX = 500
const WEEK_TRIES_PER_CORRIDOR = 25

const DAY_VARIANTS_PER_NODE = 24
const DAY_PLACEMENTS_PER_TRY = 12000

const FAVORITE_WEIGHT = 4

export type Random = () => number

type GenerateOptions = {
  targetCalories?: number
  corridor?: number
  antiRepeatDays?: number
  days?: number
  profile?: Profile | null
  precedingDays?: ReadonlyArray<ReadonlyArray<string>>
  prefs?: TastePrefs | null
  random?: Random
}

export type GenerateFailure =
  | { code: 'invalidTarget' }
  | {
      code: 'poolShortage'
      antiRepeatDays: number
      shortage: Array<PoolShortage>
    }
  | { code: 'noFit'; target: number; corridor: number }
  | { code: 'emptyPool' }

export type GenerateResult = Result<WeekPlan, GenerateFailure>

type ByType = ReadonlyArray<{ type: MealType; meals: Array<PlannedMeal> }>

type Day = DayMeals<PlannedMeal>

type WeightOf = ((meal: PlannedMeal) => number) | null

function weightedShuffle(
  items: ReadonlyArray<PlannedMeal>,
  weightOf: WeightOf,
  random: Random,
): Array<PlannedMeal> {
  return items
    .map((item) => {
      const w = weightOf ? Number(weightOf(item)) : 1
      return { item, key: Math.pow(random(), 1 / (w > 0 ? w : 1)) }
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item)
}

function dayCandidates(
  byType: ByType,
  bannedIds: ReadonlySet<string>,
  minSum: number,
  maxSum: number,
  limit: number,
  weightOf: WeightOf,
  random: Random,
): Array<Day> {
  const slots = byType.map(({ type, meals }) => ({
    type,
    candidates: weightedShuffle(
      meals.filter((meal) => !bannedIds.has(meal.id)),
      weightOf,
      random,
    ),
  }))
  if (slots.some((slot) => slot.candidates.length === 0)) return []
  slots.sort((a, b) => a.candidates.length - b.candidates.length)

  const minRest = new Array<number>(slots.length + 1).fill(0)
  const maxRest = new Array<number>(slots.length + 1).fill(0)
  for (let i = slots.length - 1; i >= 0; i--) {
    const cals = (slots[i] as (typeof slots)[number]).candidates.map(
      (meal) => meal.calories,
    )
    minRest[i] = (minRest[i + 1] as number) + Math.min(...cals)
    maxRest[i] = (maxRest[i + 1] as number) + Math.max(...cals)
  }

  const out: Array<Day> = []
  const chosen: Day = {}

  function dfs(i: number, sum: number): void {
    if (out.length >= limit) return
    if (i === slots.length) {
      if (sum >= minSum && sum <= maxSum) {
        out.push({ ...chosen })
      }
      return
    }
    const slot = slots[i] as (typeof slots)[number]
    for (const meal of slot.candidates) {
      if (out.length >= limit) return
      const next = sum + meal.calories
      if (next + (minRest[i + 1] as number) > maxSum) continue
      if (next + (maxRest[i + 1] as number) < minSum) continue
      chosen[slot.type] = meal
      dfs(i + 1, next)
    }
  }

  dfs(0, 0)
  return out
}

function tryBuildWeek(
  byType: ByType,
  days: number,
  antiRepeatDays: number,
  minSum: number,
  maxSum: number,
  precedingDays: ReadonlyArray<ReadonlyArray<string>>,
  weightOf: WeightOf,
  random: Random,
): Array<Day> | null {
  const week: Array<Day> = []
  let budget = DAY_PLACEMENTS_PER_TRY

  function bansFor(d: number): Set<string> {
    const banned = new Set<string>()
    for (let b = d - antiRepeatDays + 1; b < d; b++) {
      if (b >= 0) {
        for (const meal of Object.values(week[b] as Day)) banned.add(meal.id)
      } else {
        const preceding = precedingDays[-b - 1]
        if (preceding) for (const id of preceding) banned.add(id)
      }
    }
    return banned
  }

  function dfs(d: number): boolean {
    if (d === days) return true
    if (budget <= 0) return false
    const candidates = dayCandidates(
      byType,
      bansFor(d),
      minSum,
      maxSum,
      DAY_VARIANTS_PER_NODE,
      weightOf,
      random,
    )
    for (const meals of candidates) {
      if (budget <= 0) return false
      budget--
      week.push(meals)
      if (dfs(d + 1)) return true
      week.pop()
    }
    return false
  }

  return dfs(0) ? week : null
}

function toPlanDay(meals: Day): PlanDay {
  return { meals, calories: dayCalories(meals) }
}

export type PoolShortage = { type: MealType; have: number; need: number }

export function poolShortage(
  meals: ReadonlyArray<Meal>,
  need: number,
  types: ReadonlyArray<MealType>,
): Array<PoolShortage> {
  return types
    .map((type) => ({
      type,
      have: meals.filter(
        (meal) =>
          meal.type === type &&
          typeof meal.calories === 'number' &&
          Number.isFinite(meal.calories),
      ).length,
      need,
    }))
    .filter((entry) => entry.have < entry.need)
}

export function poolShortageFor(
  meals: ReadonlyArray<Meal>,
  profile: Profile | null | undefined,
  need: number,
): Array<PoolShortage> {
  return poolShortage(
    generationPool(meals, profile),
    need,
    mealTypesFor(profile),
  )
}

export function generateWeek(
  pool: ReadonlyArray<Meal>,
  options: GenerateOptions = {},
): GenerateResult {
  const profile = options.profile ?? null
  const random = options.random ?? Math.random

  const target = Number(
    options.targetCalories ??
      profile?.targetCalories ??
      DEFAULTS.targetCalories,
  )
  if (!Number.isFinite(target) || target <= 0) {
    return { ok: false, error: { code: 'invalidTarget' } }
  }

  const rawDays = Math.floor(Number(options.days ?? DEFAULTS.days))
  const days = Math.max(1, Number.isFinite(rawDays) ? rawDays : DEFAULTS.days)

  const rawCorridor = Number(
    options.corridor ?? profile?.corridor ?? DEFAULTS.corridor,
  )
  const corridor = Math.max(
    0,
    Number.isFinite(rawCorridor) ? rawCorridor : DEFAULTS.corridor,
  )

  const rawAnti = Math.floor(
    Number(options.antiRepeatDays ?? DEFAULTS.antiRepeatDays),
  )
  const antiRepeatDays = Math.min(
    Math.max(1, Number.isFinite(rawAnti) ? rawAnti : 1),
    days,
  )

  const precedingDays = options.precedingDays ?? []
  const prefs = options.prefs ?? NO_PREFS
  const params: WeekParams = {
    targetCalories: target,
    corridor,
    antiRepeatDays,
    days,
  }

  const visible = generationPool(pool, profile)

  const planned = visible.filter(
    (meal): meal is PlannedMeal =>
      typeof meal.calories === 'number' && Number.isFinite(meal.calories),
  )
  const withoutCalories = visible.length - planned.length

  const types = mealTypesFor(profile)
  const byTypeOf = (list: ReadonlyArray<PlannedMeal>): ByType =>
    types.map((type) => ({
      type,
      meals: list.filter((meal) => meal.type === type),
    }))

  const weightOf: WeightOf = prefs.favorites.size
    ? (meal) => (prefs.favorites.has(meal.id) ? FAVORITE_WEIGHT : 1)
    : null

  const mixPossibleFull = mixPossibleIn(planned)

  const poolWarnings: Array<WeekWarning> = []
  if (withoutCalories > 0) {
    poolWarnings.push({
      code: 'caloriesUnknown',
      portion: portionOf(profile),
      count: withoutCalories,
    })
  }

  const corridorLevels: Array<number> = []
  for (let c = corridor; c < CORRIDOR_MAX; c += CORRIDOR_STEP) {
    corridorLevels.push(c)
  }
  corridorLevels.push(Math.max(corridor, CORRIDOR_MAX))
  const maxCorridorTried = corridorLevels[corridorLevels.length - 1] as number

  function buildFrom(list: ReadonlyArray<PlannedMeal>): GenerateResult {
    const byType = byTypeOf(list)
    const shortage = poolShortage(list, antiRepeatDays, types)
    if (shortage.length) {
      return {
        ok: false,
        error: { code: 'poolShortage', antiRepeatDays, shortage },
      }
    }

    const universe = poolPlans(list)
    const mixPossible = mixPossibleIn(list)

    const finish = (
      planDays: Array<PlanDay>,
      usedCorridor: number,
      warnings: Array<WeekWarning>,
    ): GenerateResult => ({
      ok: true,
      days: planDays,
      params,
      usedCorridor,
      sources: weekSources(planDays),
      mixed: isMixedWeek(planDays, universe),
      mixPossible,
      warnings: poolWarnings.concat(warnings),
    })

    let fallback: { days: Array<PlanDay>; usedCorridor: number } | null = null

    for (const c of corridorLevels) {
      for (let attempt = 0; attempt < WEEK_TRIES_PER_CORRIDOR; attempt++) {
        const week = tryBuildWeek(
          byType,
          days,
          antiRepeatDays,
          target - c,
          target + c,
          precedingDays,
          weightOf,
          random,
        )
        if (!week) continue
        const planDays = week.map(toPlanDay)
        if (mixPossible && !isMixedWeek(planDays, universe)) {
          if (!fallback) fallback = { days: planDays, usedCorridor: c }
          continue
        }
        const warnings: Array<WeekWarning> = []
        if (c > corridor) {
          warnings.push({ code: 'corridorWidened', corridor, used: c })
        }
        if (!mixPossible) {
          warnings.push({
            code: mixPossibleFull ? 'mixBlockedByDislikes' : 'mixImpossible',
          })
        }
        return finish(planDays, c, warnings)
      }
    }

    if (fallback) {
      const warnings: Array<WeekWarning> = [{ code: 'mixFailed' }]
      if (fallback.usedCorridor > corridor) {
        warnings.push({
          code: 'mixFailedCorridorWidened',
          used: fallback.usedCorridor,
        })
      }
      return finish(fallback.days, fallback.usedCorridor, warnings)
    }

    return {
      ok: false,
      error: { code: 'noFit', target, corridor: maxCorridorTried },
    }
  }

  const attempts: Array<ReadonlyArray<PlannedMeal>> = []
  const kept = prefs.disliked.size
    ? planned.filter((meal) => !prefs.disliked.has(meal.id))
    : planned
  if (
    kept.length !== planned.length &&
    !poolShortage(kept, antiRepeatDays, types).length
  ) {
    attempts.push(kept)
  }
  attempts.push(planned)

  let last: GenerateResult = { ok: false, error: { code: 'emptyPool' } }
  for (const list of attempts) {
    last = buildFrom(list)
    if (!last.ok) continue
    if (
      prefs.disliked.size &&
      allWeekMeals(last.days).some((meal) => prefs.disliked.has(meal.id))
    ) {
      last.warnings = last.warnings.concat({ code: 'dislikedKept' })
    }
    return last
  }
  return last
}
