import { MEAL_TYPES } from './types.ts'
import type { MealType } from './types.ts'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export function dateKeyParts(key: string): [number, number, number] | null {
  const m = DATE_RE.exec(key)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function parseDate(key: string): [number, number, number] {
  const parts = dateKeyParts(key)
  if (!parts) {
    throw new Error('Очікувалась дата у форматі YYYY-MM-DD, отримано: ' + key)
  }
  return parts
}

export function dateKey(date: Date): string {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  )
}

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

export function startOfWeek(key: string): string {
  const [y, m, d] = parseDate(key)
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return addDays(key, -((weekday + 6) % 7))
}

export type CalendarSlot = {
  date: string
  slot: MealType
  mealId: string
}

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

export function precedingWindow(antiRepeatDays: number): number {
  return Math.max(0, Math.floor(antiRepeatDays || 1) - 1)
}

export function planSlots(
  days: ReadonlyArray<{ meals: Partial<Record<MealType, { id: string }>> }>,
  startDate: string,
): Array<CalendarSlot & { dayIndex: number }> {
  const out: Array<CalendarSlot & { dayIndex: number }> = []
  days.forEach((day, dayIndex) => {
    const date = addDays(startDate, dayIndex)
    for (const slot of MEAL_TYPES) {
      const meal = day.meals[slot]
      if (meal) out.push({ date, dayIndex, slot, mealId: meal.id })
    }
  })
  return out
}
