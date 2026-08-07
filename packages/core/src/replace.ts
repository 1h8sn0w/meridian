/**
 * MER-12 / MER-28 — ручна заміна страви в слоті збереженого плану.
 *
 * Дві частини, як у V1:
 *  - `suggestReplacements` рахує кандидатів і **позначає кожного валідним чи
 *    ні** (коридор, антиповтор, мікс). UI блокує невалідних, тож зберегти
 *    невалідний тиждень ручною заміною не можна (MER-28);
 *  - `replaceSlot` застосовує заміну до плану й повертає НОВИЙ план — чисто, без
 *    сховища. Запис у локальний SQLite (і LWW на рівні слота, MER-46) — справа
 *    викликача; тут лише правила.
 *
 * Смак (MER-18) впливає лише на порядок і позначку: ручний вибір за
 * користувачем, тож валідності він не змінює.
 */

import { dayCalories, hasValue } from './provenance.ts'
import { plansCovering, poolPlans, weekSources } from './plans.ts'
import { DEFAULTS } from './generator.ts'
import { MEAL_TYPES, MEAL_TYPE_LABELS, NO_PREFS } from './types.ts'
import type {
  Meal,
  MealType,
  PlanDay,
  PlannedMeal,
  Result,
  TastePrefs,
  WeekPlan,
} from './types.ts'

export type ReplacementCandidate = {
  meal: PlannedMeal
  /** Якою стане калорійність дня після заміни. */
  dayCalories: number
  withinCorridor: boolean
  /** Страва вже стоїть у сусідньому дні вікна антиповтору. */
  repeatSoon: boolean
  /** Заміна не ламає мікс планів (або мікс і не вимагався). */
  mixOk: boolean
  favorite: boolean
  disliked: boolean
  /** false — заміна порушила б коридор/антиповтор/мікс; UI її блокує. */
  valid: boolean
  reasons: Array<string>
}

export type Replacements = {
  current: Meal
  target: number
  corridor: number
  mixRequired: boolean
  candidates: Array<ReplacementCandidate>
}

/**
 * Кандидати на заміну слота `slotType` у дні `dayIndex` плану.
 *
 * Сортування: спершу валідні, далі не-небажані, далі улюблені, далі ті, що
 * тримають коридор, далі без повтору поруч, далі ближчі до цілі.
 */
export function suggestReplacements(
  pool: ReadonlyArray<Meal>,
  plan: WeekPlan,
  dayIndex: number,
  slotType: MealType,
  prefs: TastePrefs = NO_PREFS,
): Result<Replacements> {
  const day = plan.days[dayIndex]
  if (!Number.isInteger(dayIndex) || !day) {
    return { ok: false, error: 'У плані немає дня №' + (dayIndex + 1) + '.' }
  }
  if (!MEAL_TYPES.includes(slotType)) {
    return { ok: false, error: 'Невідомий тип слота: «' + slotType + '».' }
  }
  const current = day.meals[slotType]
  const target = plan.params.targetCalories
  const corridor = Number.isFinite(plan.usedCorridor)
    ? plan.usedCorridor
    : DEFAULTS.corridor

  // Сума решти слотів дня: прогноз дня для кандидата = решта + кандидат.
  let others = 0
  let othersUnknown = 0
  for (const type of MEAL_TYPES) {
    if (type === slotType) continue
    const meal = day.meals[type]
    if (hasValue(meal.calories)) others += meal.calories as number
    else othersUnknown += 1
  }
  /* Провенанс: якщо сусідній слот без калорійності, прогноз дня — не число, а
   * здогад. Коридор тоді не перевіряємо (нічого підставляти замість цифри) і
   * кажемо це прямо в причинах. */
  const dayComparable = othersUnknown === 0

  // Страви сусідніх днів у вікні антиповтору (в обидва боки від дня dayIndex).
  const anti = Math.max(1, Math.floor(plan.params.antiRepeatDays) || 1)
  const nearIds = new Set<string>()
  const from = Math.max(0, dayIndex - anti + 1)
  const to = Math.min(plan.days.length - 1, dayIndex + anti - 1)
  for (let d = from; d <= to; d++) {
    if (d === dayIndex) continue
    const other = plan.days[d]
    if (!other) continue
    for (const type of MEAL_TYPES) nearIds.add(other.meals[type].id)
  }

  // MER-28/30: чи план узагалі вимагає міксу — щоб перевіряти, що заміна його не
  // зламає. Решта страв тижня (крім цього слота) — база для перевірки.
  const universe = poolPlans(pool)
  const mixRequired =
    universe.size >= 2 && plansCovering(pool, universe).size === 0
  const fixedWeekMeals: Array<Meal> = []
  plan.days.forEach((planDay, di) => {
    for (const type of MEAL_TYPES) {
      if (di === dayIndex && type === slotType) continue
      fixedWeekMeals.push(planDay.meals[type])
    }
  })

  const candidates = pool
    .filter(
      (meal): meal is PlannedMeal =>
        meal.type === slotType &&
        meal.id !== current.id &&
        // Страву без калорійності в слот не ставимо: коридор дня став би
        // невідомим, а вигадати нуль не можна (правило провенансу).
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
      const reasons: Array<string> = []
      if (!dayComparable) reasons.push('калорійність дня неповна')
      else if (!withinCorridor) reasons.push('поза коридором')
      if (repeatSoon) reasons.push('повтор поруч')
      if (!mixOk) reasons.push('ламає мікс планів')
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

/**
 * Застосувати заміну: повертає НОВИЙ план (вхідний не мутується). Набір джерел
 * після заміни перераховується чесно — він міг змінитися.
 *
 * Валідність кандидата тут не переперевіряється: рішення ухвалює UI за
 * `suggestReplacements`, і користувач має право свідомо поставити страву, яку
 * генератор не обрав би. Що перевіряємо — це цілісність: чи є такий день, такий
 * слот і чи збігається тип страви.
 */
export function replaceSlot(
  plan: WeekPlan,
  dayIndex: number,
  slotType: MealType,
  meal: Meal,
): Result<{ plan: WeekPlan }> {
  const day = plan.days[dayIndex]
  if (!Number.isInteger(dayIndex) || !day) {
    return { ok: false, error: 'У плані немає дня №' + (dayIndex + 1) + '.' }
  }
  if (!MEAL_TYPES.includes(slotType)) {
    return { ok: false, error: 'Невідомий тип слота: «' + slotType + '».' }
  }
  if (meal.type !== slotType) {
    return {
      ok: false,
      error:
        'Страва «' +
        meal.name +
        '» — це ' +
        MEAL_TYPE_LABELS[meal.type].toLowerCase() +
        ', а слот — «' +
        MEAL_TYPE_LABELS[slotType] +
        '».',
    }
  }

  const meals = { ...day.meals, [slotType]: meal }
  const nextDay: PlanDay = { meals, calories: dayCalories(meals) }
  const days = plan.days.map((d, i) => (i === dayIndex ? nextDay : d))

  return {
    ok: true,
    plan: { ...plan, days, sources: weekSources(days) },
  }
}
