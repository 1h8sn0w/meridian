/**
 * Календар: дати без UTC-зсувів і перенесення антиповтору через межу тижнів
 * (MER-29, MER-31).
 *
 * Дата тут — рядок «YYYY-MM-DD», як `date` у схемі (`plan_slot.date`,
 * `week_plan.start_date`). Арифметика — на числах року/місяця/дня через
 * `Date.UTC`: це календарний зсув, який не залежить від переведення годинників,
 * бо в UTC літнього часу немає. Локальний `new Date(y, m, d)` для показу робить
 * викликач; ядро дат-об'єктів не повертає взагалі.
 */

import { MEAL_TYPES } from './types.ts'
import type { MealType } from './types.ts'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Ключ дати «YYYY-MM-DD» → [рік, місяць (1-12), день]. Кидає на сміття. */
function parseDate(key: string): [number, number, number] {
  const m = DATE_RE.exec(key)
  if (!m) {
    throw new Error('Очікувалась дата у форматі YYYY-MM-DD, отримано: ' + key)
  }
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/** Локальна дата → ключ «YYYY-MM-DD» (без UTC-зсувів; сортується як дата). */
export function dateKey(date: Date): string {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  )
}

/**
 * Зсув ключа дати на `n` днів. Через `Date.UTC`, а не локальний конструктор:
 * у ніч переведення годинників локальна доба не дорівнює 24 годинам, і
 * наївне «+86400000» дає позавчора або той самий день (MER-31).
 */
export function addDays(key: string, n: number): string {
  const [y, m, d] = parseDate(key)
  const shifted = new Date(Date.UTC(y, m - 1, d + n))
  return (
    shifted.getUTCFullYear() +
    '-' +
    String(shifted.getUTCMonth() + 1).padStart(2, '0') +
    '-' +
    String(shifted.getUTCDate()).padStart(2, '0')
  )
}

/** Понеділок тижня, куди належить дата (тиждень в Україні — з понеділка). */
export function startOfWeek(key: string): string {
  const [y, m, d] = parseDate(key)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = неділя
  return addDays(key, -((weekday + 6) % 7))
}

/**
 * Слот календаря — рядок `plan_slot`, зведений до того, що потрібно домену.
 * Це той самий запис, що лежить у локальному SQLite; мапу з рядка робить
 * `rows.ts`.
 */
export type CalendarSlot = {
  date: string
  slot: MealType
  mealId: string
}

/**
 * MER-29 — id страв останніх `count` календарних днів ПЕРЕД `startDate`,
 * найближчий день перший.
 *
 * Навіщо: набір заборонених страв генератор будував лише з днів поточного
 * виклику, тож перший день новоствореного тижня міг повторити страву вчорашнього
 * дня, хоча вікно антиповтору мало б це заборонити. Цей масив іде в
 * `generateWeek({ precedingDays })` і заповнює вікно перед днем 0.
 *
 * `count` — це `antiRepeatDays - 1`: сам день 0 у вікно не входить. Дні без
 * запису дають порожній список, а не пропуск — позиція в масиві означає
 * «наскільки давно», тож зсовувати її не можна.
 */
export function precedingMealIds(
  slots: ReadonlyArray<CalendarSlot>,
  startDate: string,
  count: number,
): Array<Array<string>> {
  const byDate = new Map<string, Array<string>>()
  for (const slot of slots) {
    const ids = byDate.get(slot.date)
    if (ids) ids.push(slot.mealId)
    else byDate.set(slot.date, [slot.mealId])
  }

  const out: Array<Array<string>> = []
  for (let k = 1; k <= count; k++) {
    out.push(byDate.get(addDays(startDate, -k)) ?? [])
  }
  return out
}

/**
 * Скільки попередніх днів потрібно генератору при заданому антиповторі.
 * Окремою функцією, щоб «-1» не переписували на місці виклику (у V1 саме там
 * його й забули).
 */
export function precedingWindow(antiRepeatDays: number): number {
  return Math.max(0, Math.floor(antiRepeatDays || 1) - 1)
}

/**
 * Слоти згенерованого тижня для запису в календар: день `i` плану лягає на
 * `startDate + i`. Це те, що викликач вставляє в `plan_slot` (по рядку на слот
 * — саме тому LWW працює на рівні слота, MER-46).
 */
export function planSlots(
  days: ReadonlyArray<{ meals: Record<MealType, { id: string }> }>,
  startDate: string,
): Array<CalendarSlot & { dayIndex: number }> {
  const out: Array<CalendarSlot & { dayIndex: number }> = []
  days.forEach((day, dayIndex) => {
    const date = addDays(startDate, dayIndex)
    for (const slot of MEAL_TYPES) {
      out.push({ date, dayIndex, slot, mealId: day.meals[slot].id })
    }
  })
  return out
}
