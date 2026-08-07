/**
 * MER-30 — належність страви до планів дієтолога, СТРУКТУРНО.
 *
 * `meal.source` — це підпис плану («Тиждень 2»), і у V1 мікс рахувався просто
 * за кількістю різних підписів. Це давало хибнопозитив: спільний десерт із
 * джерелом «Тиждень 1–2» належить ОБОМ тижням, а рахувався третім окремим
 * джерелом. Тиждень зі страв Тижня 1 плюс такий десерт виглядав «зміксованим»,
 * не містячи жодної страви саме Тижня 2.
 *
 * Тому належність — це множина планів, а мікс — властивість перетину:
 * **тиждень зміксований ⇔ жоден єдиний план не покриває всі його страви.**
 *
 * `source` лишається планом дієтолога і НЕ стає provenance-енумом
 * (`'pdf' | 'manual'`) — це зламало б саме цю логіку (інструкція каркаса, §9).
 */

import { MEAL_TYPES } from './types.ts'
import type { Meal, PlanDay } from './types.ts'

/** Найширший діапазон номерів, який ще розгортаємо («Тиждень 1–12»). */
const MAX_PLAN_RANGE = 12

/**
 * Плани, яким належить страва. Діапазон номерів у підписі («Тиждень 1–2»)
 * розгортається підстановкою кожного номера в шаблон, тож спільний десерт
 * належить і «Тиждень 1», і «Тиждень 2».
 *
 * `null` — страва без джерела: вона «власна», належить будь-якому плану й
 * single-source не ламає (wildcard).
 */
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
  return new Set([src]) // одне джерело = один план
}

/** Усі плани, згадані в пулі — universe для логіки міксу. */
export function poolPlans(meals: ReadonlyArray<Meal>): Set<string> {
  const all = new Set<string>()
  for (const meal of meals) {
    const plans = mealPlans(meal)
    if (plans) for (const plan of plans) all.add(plan)
  }
  return all
}

/**
 * Плани, кожен з яких САМ покриває всі страви набору. Порожній результат
 * означає, що набір зміксований. Wildcard-страви (без джерела) належать усім
 * планам, тож перетину не звужують.
 */
export function plansCovering(
  meals: ReadonlyArray<Meal>,
  universe: ReadonlySet<string>,
): Set<string> {
  let inter: Set<string> | null = null
  for (const meal of meals) {
    const plans = mealPlans(meal)
    if (!plans) continue // wildcard
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

/** Усі страви тижня одним масивом. */
export function allWeekMeals(days: ReadonlyArray<PlanDay>): Array<Meal> {
  const out: Array<Meal> = []
  for (const day of days) {
    for (const type of MEAL_TYPES) out.push(day.meals[type])
  }
  return out
}

/** Тиждень зміксований ⇔ жоден єдиний план не покриває всі його страви. */
export function isMixedWeek(
  days: ReadonlyArray<PlanDay>,
  universe: ReadonlySet<string>,
): boolean {
  return plansCovering(allWeekMeals(days), universe).size === 0
}

/**
 * Чи мікс узагалі можливий на цьому пулі: планів має бути щонайменше два, і
 * жоден із них не має покривати весь пул. Спільні десерти «Тиждень 1–2» самі
 * міксу не роблять — вони належать обом планам.
 */
export function mixPossibleIn(meals: ReadonlyArray<Meal>): boolean {
  const universe = poolPlans(meals)
  return universe.size >= 2 && plansCovering(meals, universe).size === 0
}

/**
 * «Сирі» підписи джерел, ужиті в тижні — для показу (`week_plan.sources`).
 * Порожні не рахуємо. Для логіки міксу служить усе вище, а не цей набір.
 */
export function weekSources(days: ReadonlyArray<PlanDay>): Array<string> {
  const sources = new Set<string>()
  for (const meal of allWeekMeals(days)) {
    if (meal.source) sources.add(meal.source)
  }
  return [...sources].sort()
}
