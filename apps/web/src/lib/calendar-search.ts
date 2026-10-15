import { addDays, startOfWeek } from '@meridian/core'

export type CalendarSearch = { day?: string; week?: string }

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
