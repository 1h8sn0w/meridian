/**
 * Спільне для юніт-тестів ядра: детерміноване джерело випадковості, фабрики
 * страв і профілів, перевірка тижня на всі чотири правила дієтолога.
 *
 * У `dist` не потрапляє (виключено в `tsconfig.build.json`), але типи й лінт
 * проходить на загальних підставах.
 */

import { MEAL_TYPES } from './types.ts'
import type { Meal, MealType, Profile, TastePrefs, WeekPlan } from './types.ts'
import type { Random } from './generator.ts'

/**
 * Детермінований PRNG (mulberry32). Генератор навмисно приймає `random`
 * параметром саме заради цього: інакше «жадібно + випадковість» неможливо
 * перевірити тестом, і кожен прогін перевіряв би інший тиждень.
 */
export function seeded(seed: number): Random {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Кілька різних зерен — щоб тест ловив не одну щасливу розстановку. */
export const SEEDS: ReadonlyArray<number> = [1, 7, 42, 1234, 20260807]

type MealInput = {
  id: string
  type: MealType
  calories?: number | null
  source?: string
  name?: string
  caloriesApprox?: boolean
  protein?: number | null
  fat?: number | null
  carbs?: number | null
}

export function meal(input: MealInput): Meal {
  return {
    id: input.id,
    name: input.name ?? input.id,
    type: input.type,
    calories: input.calories === undefined ? 500 : input.calories,
    caloriesApprox: input.caloriesApprox ?? false,
    protein: input.protein ?? null,
    fat: input.fat ?? null,
    carbs: input.carbs ?? null,
    ingredients: [],
    source: input.source ?? '',
    portions: [],
  }
}

export function profile(input: Partial<Profile> & { id: string }): Profile {
  return {
    name: input.id,
    targetCalories: 2000,
    corridor: 100,
    portion: null,
    mealIds: null,
    sharedPlanWith: null,
    goalProtein: null,
    goalFat: null,
    goalCarbs: null,
    ...input,
  }
}

export function prefs(
  favorites: Array<string> = [],
  disliked: Array<string> = [],
): TastePrefs {
  return { favorites: new Set(favorites), disliked: new Set(disliked) }
}

/**
 * Пул, у якому мікс планів можливий: по чотири страви кожного типу, порівну з
 * «Тиждень 1» і «Тиждень 2». Денна сума лежить у 2000…2120 ккал.
 */
export function mixedPool(): Array<Meal> {
  const base: Record<MealType, number> = {
    breakfast: 400,
    lunch: 600,
    dinner: 700,
    snack: 300,
  }
  const out: Array<Meal> = []
  for (const type of MEAL_TYPES) {
    for (let i = 0; i < 4; i++) {
      out.push(
        meal({
          id: type + '-' + i,
          type,
          calories: base[type] + i * 10,
          source: 'Тиждень ' + (i % 2 === 0 ? 1 : 2),
        }),
      )
    }
  }
  return out
}

/** Усі страви тижня одним масивом (тестам зручніше, ніж імпорт із `plans`). */
export function weekMealIds(plan: WeekPlan): Array<Array<string>> {
  return plan.days.map((day) => MEAL_TYPES.map((type) => day.meals[type].id))
}

export type WeekViolation = string

/**
 * Перевірити зібраний тиждень на правила 1–3 дієтолога: тип слота, коридор дня
 * і антиповтор. Правило 4 (мікс) перевіряють окремі тести — воно єдине, яке
 * генератор має право свідомо послабити.
 *
 * `precedingDays` (MER-29) враховуються так само, як у генераторі: вони
 * заповнюють вікно антиповтору перед днем 0.
 */
export function weekViolations(
  plan: WeekPlan,
  precedingDays: ReadonlyArray<ReadonlyArray<string>> = [],
): Array<WeekViolation> {
  const problems: Array<WeekViolation> = []
  const { targetCalories, antiRepeatDays, days } = plan.params

  if (plan.days.length !== days) {
    problems.push('днів ' + plan.days.length + ', очікувалось ' + days)
  }

  plan.days.forEach((day, i) => {
    for (const type of MEAL_TYPES) {
      const slot = day.meals[type]
      if (slot.type !== type) {
        problems.push('день ' + i + ': у слот «' + type + '» став ' + slot.type)
      }
    }
    if (day.calories.unknown > 0) {
      problems.push('день ' + i + ': слот без калорійності')
    }
    if (Math.abs(day.calories.total - targetCalories) > plan.usedCorridor) {
      problems.push(
        'день ' +
          i +
          ': ' +
          day.calories.total +
          ' ккал поза коридором ±' +
          plan.usedCorridor,
      )
    }
  })

  const ids = weekMealIds(plan)
  ids.forEach((today, i) => {
    for (let back = 1; back < antiRepeatDays; back++) {
      const previous =
        i - back >= 0 ? ids[i - back] : precedingDays[back - i - 1]
      if (!previous) continue
      for (const id of today) {
        if (previous.includes(id)) {
          problems.push(
            'день ' + i + ': повтор «' + id + '» через ' + back + ' дн.',
          )
        }
      }
    }
  })

  return problems
}
