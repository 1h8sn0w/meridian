/**
 * Правила провенансу (MER-47, розділ 6 інструкції каркаса) — три поведінки, а
 * не три випадкові функції:
 *
 *  1. Перевірка «значення справді є»: порожнє, відсутнє й NaN однаково
 *     означають «немає».
 *  2. Рішення, чи показувати секцію БЖВ: показувати, якщо є хоч одне з трьох;
 *     ховати цілком, якщо жодного.
 *  3. Форматування калорій: порожньо, якщо значення немає; префікс «≈» — лише
 *     коли піднято прапорець приблизності (MER-26).
 *
 * Це і є те, чим провенанс живе в коді замість колонки в БД (AGENTS.md →
 * «Провенанс даних»). Застосунок ніколи не вигадує значень: немає в джерелі —
 * поле лишається порожнім, а секція UI ховається. Нуль ≠ «невідомо», тож
 * жодного `?? 0` тут немає й бути не може.
 */

import { MEAL_TYPES } from './types.ts'
import type { DayCalories, Meal, MealType } from './types.ts'

/* ==========================================================================
 * 1 · Чи значення справді є
 * ======================================================================== */

/**
 * Порожнє, відсутнє й NaN — однаково «немає». Правило одне для всіх типів:
 *  - `null` / `undefined` — немає;
 *  - число: лише скінченне рахується (NaN та ±Infinity — немає);
 *  - рядок: лише непорожній після обрізання пробілів;
 *  - масив: лише непорожній (порожні інгредієнти/порції ховають секцію);
 *  - решта (об'єкти, `boolean`) — є.
 *
 * Нуль і `false` — це справжні значення, а не порожнеча.
 */
export function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.trim().length > 0
  if (Array.isArray(value)) return value.length > 0
  return true
}

/**
 * Число з джерела або null — `toOptionalNumber` із V1. Порожній рядок, `null`,
 * `undefined` і NaN дають null; від'ємне значення — помилка, а не тихе null,
 * бо це зіпсовані дані, і мовчки їх ковтати не можна.
 *
 * Схема БД відсікає від'ємні CHECK-обмеженнями, тож на шляху з локального
 * SQLite ця гілка недосяжна — вона для ручного вводу й імпорту.
 */
export function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  if (n < 0) {
    throw new Error(
      "Очікувалось невід'ємне число, отримано: " + JSON.stringify(value),
    )
  }
  return n
}

/* ==========================================================================
 * 2 · Чи показувати секцію БЖВ
 * ======================================================================== */

/**
 * Секція БЖВ показується, якщо є хоч одне з трьох, і ховається цілком, якщо
 * жодного. Пропуски всередині показаної секції — це «—», а не нуль (у V1 саме
 * так: `pair[1] == null ? "—" : …`).
 */
export function hasMacros(
  meal: Pick<Meal, 'protein' | 'fat' | 'carbs'>,
): boolean {
  return hasValue(meal.protein) || hasValue(meal.fat) || hasValue(meal.carbs)
}

/** Значення макроса для показу: число або «—», якщо в джерелі його немає. */
export function formatMacro(value: number | null | undefined): string {
  return hasValue(value) ? (value as number).toLocaleString('uk-UA') : '—'
}

/* ==========================================================================
 * 3 · Форматування калорій
 * ======================================================================== */

/**
 * Калорійність для показу. Порожній рядок, якщо значення немає — жодних «0
 * ккал» замість невідомого (саме цю пастку відкриває nullable `calories` у V2:
 * у V1 функція показу підставляла нуль, бо порожнього просто не бувало).
 *
 * Префікс «≈» — лише коли піднято `caloriesApprox`. Це єдиний санкціонований
 * виняток із правила провенансу, і він стосується ЛИШЕ калорій (MER-26).
 */
export function formatCalories(
  value: number | null | undefined,
  approx = false,
): string {
  if (!hasValue(value)) return ''
  return (approx ? '≈' : '') + String(value) + ' ккал'
}

/** Те саме для страви — найчастіший виклик (V1 `fmtMealKcal`). */
export function formatMealCalories(meal: Meal): string {
  return formatCalories(meal.calories, meal.caloriesApprox)
}

/**
 * Калорійність дня для показу. Порожньо, якщо не відома жодна складова: сума
 * нуля відомих — це «невідомо», а не «0 ккал».
 *
 * Неповну суму (`unknown > 0`) НЕ маркуємо через «≈»: приблизність і неповнота
 * — різні речі, і показувати одну замість іншої означає збрехати. Скільки
 * слотів лишились без цифри, викликач бачить у `DayCalories.unknown` і каже це
 * окремо.
 */
export function formatDayCalories(day: DayCalories): string {
  if (day.unknown > 0 && day.total === 0) return ''
  return formatCalories(day.total, day.approx)
}

/* ==========================================================================
 * Калорійність дня — власне підрахунок
 * ======================================================================== */

/**
 * Сума калорійності слотів дня. Рахує лише відомі значення й окремо повідомляє,
 * скільки слотів цифри не мають — щоб ніхто не сприйняв неповну суму за повну.
 * Похідне значення, у БД колонкою не зберігається (рішення MER-44).
 */
export function dayCalories(
  meals: Partial<Record<MealType, Meal | null | undefined>>,
): DayCalories {
  let total = 0
  let unknown = 0
  let approx = false
  for (const type of MEAL_TYPES) {
    const meal = meals[type]
    if (!meal || !hasValue(meal.calories)) {
      unknown += 1
      continue
    }
    total += meal.calories as number
    if (meal.caloriesApprox) approx = true
  }
  return { total, unknown, approx }
}
