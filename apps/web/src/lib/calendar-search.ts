/**
 * Вибраний день і видимий тиждень «Календаря» в адресі (MER-88): у стані
 * екрана їх скидало б перезавантаження й повернення з рецепта. Невідоме чи
 * неіснуюче значення з адреси — просто «без параметра», а тиждень завжди
 * починається понеділком: інакше сітка поїхала б від підписів «Пн–Нд».
 */

import { addDays, startOfWeek } from '@meridian/core'

export type CalendarSearch = { day?: string; week?: string }

/** «YYYY-MM-DD», який справді існує: `addDays` кидає на сміття, а 30 лютого
 *  перекидає на березень і з собою не збігається. */
function dateFrom(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  try {
    return addDays(value, 0) === value ? value : undefined
  } catch {
    return undefined
  }
}

export function parseCalendarSearch(
  search: Record<string, unknown>,
): CalendarSearch {
  const week = dateFrom(search.week)
  return {
    day: dateFrom(search.day),
    week: week && startOfWeek(week),
  }
}
