import {
  DEFAULTS,
  MEAL_TYPES,
  dayCalories,
  mealForPortion,
  profileFromRow,
} from '@meridian/core'
import type {
  DayCalories,
  DayMeals,
  Meal,
  MealType,
  PlanDay,
  PortionLetter,
  Profile,
  Row,
  WeekParams,
  WeekPlan,
} from '@meridian/core'
import type { MealWindow } from '../day-clock'

export type AppProfile = Profile & { color: string }

const SLOT_ORDER: ReadonlyArray<MealType> = [
  'breakfast',
  'lunch',
  'snack',
  'dinner',
]

type SlotView = {
  id: string
  slot: MealType
  mealId: string
  meal: Meal | null
  swapped: boolean
}

export type DayView = {
  date: string
  dayIndex: number
  slots: Array<SlotView>
  byType: Partial<Record<MealType, SlotView>>
  calories: DayCalories
  isPast: boolean
  isToday: boolean
}

export type WeekView = {
  id: string
  profileId: string
  startDate: string
  generatedAt: string
  params: WeekParams
  usedCorridor: number
  sources: Array<string>
  warnings: Array<string>
  days: Array<DayView>
  missing: number
}

function text(row: Row, column: string): string {
  const value = row[column]
  return value === null || value === undefined ? '' : String(value)
}

function int(row: Row, column: string): number {
  const value = Number(row[column])
  return Number.isFinite(value) ? value : 0
}

function jsonStrings(row: Row, column: string): Array<string> {
  const value = row[column]
  if (typeof value !== 'string' || !value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

export function antiRepeatDaysFromRow(row: Row): number | null {
  const value = row.anti_repeat_days
  if (value === null || value === undefined) return null
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > DEFAULTS.days
  )
    throw new Error(
      "Антиповтор сім'ї збережено з помилкою: " + String(value) + '.',
    )
  return value
}

export function appProfileFromRow(row: Row): AppProfile {
  const color = text(row, 'color').trim().toLowerCase()
  return {
    ...profileFromRow(row),
    color: /^#[0-9a-f]{6}$/.test(color) ? color : '#4f9dff',
  }
}

type FoldedDay = {
  dayIndex: number
  byType: Partial<Record<MealType, SlotView>>
  slots: Array<SlotView>
  calories: DayCalories
}

function foldSlotRows(
  slotRows: ReadonlyArray<Row>,
  meals: ReadonlyMap<string, Meal>,
): { days: Map<string, FoldedDay>; missing: number } {
  const byDate = new Map<
    string,
    { dayIndex: number; byType: Partial<Record<MealType, SlotView>> }
  >()
  let missing = 0

  for (const row of slotRows) {
    const slot = text(row, 'slot') as MealType
    if (!MEAL_TYPES.includes(slot)) continue
    const mealId = text(row, 'meal_id')
    const meal = meals.get(mealId) ?? null
    if (!meal) missing += 1
    const view: SlotView = {
      id: text(row, 'id'),
      slot,
      mealId,
      meal,
      swapped: int(row, 'swapped') === 1,
    }
    const date = text(row, 'date')
    const found = byDate.get(date)
    if (found) found.byType[slot] = view
    else
      byDate.set(date, {
        dayIndex: int(row, 'day_index'),
        byType: { [slot]: view },
      })
  }

  const days = new Map<string, FoldedDay>()
  for (const [date, { dayIndex, byType }] of byDate) {
    const slots = SLOT_ORDER.map((type) => byType[type]).filter(
      (view): view is SlotView => view !== undefined,
    )
    const forCalories: Partial<Record<MealType, Meal | null>> = {}
    for (const view of slots) forCalories[view.slot] = view.meal
    days.set(date, {
      dayIndex,
      byType,
      slots,
      calories: dayCalories(forCalories),
    })
  }
  return { days, missing }
}

export function buildWeekView(
  planRow: Row,
  slotRows: ReadonlyArray<Row>,
  meals: ReadonlyMap<string, Meal>,
  todayKey: string,
): WeekView {
  const folded = foldSlotRows(slotRows, meals)

  const days: Array<DayView> = [...folded.days]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, day]): DayView => ({
      date,
      ...day,
      isPast: date < todayKey,
      isToday: date === todayKey,
    }))

  return {
    id: text(planRow, 'id'),
    profileId: text(planRow, 'profile_id'),
    startDate: text(planRow, 'start_date'),
    generatedAt: text(planRow, 'generated_at'),
    params: {
      targetCalories: int(planRow, 'target_calories'),
      corridor: int(planRow, 'corridor'),
      antiRepeatDays: int(planRow, 'anti_repeat_days'),
      days: int(planRow, 'days'),
    },
    usedCorridor: int(planRow, 'used_corridor'),
    sources: jsonStrings(planRow, 'sources'),
    warnings: jsonStrings(planRow, 'warnings'),
    days,
    missing: folded.missing,
  }
}

export function manualSwapsAhead(view: WeekView): number {
  return view.days
    .filter((day) => !day.isPast)
    .flatMap((day) => day.slots)
    .filter((slot) => slot.swapped).length
}

export function windowsInPlan(
  windows: ReadonlyArray<MealWindow>,
  view: WeekView | null | undefined,
): ReadonlyArray<MealWindow> {
  if (!view?.days.length) return windows
  const planned = new Set(
    view.days.flatMap((day) => day.slots.map((slot) => slot.slot)),
  )
  return windows.filter((window) => planned.has(window.type))
}

export type CalendarDayView = {
  date: string
  slots: Array<SlotView>
  calories: DayCalories
}

export function buildCalendarDays(
  slotRows: ReadonlyArray<Row>,
  meals: ReadonlyMap<string, Meal>,
): Map<string, CalendarDayView> {
  const out = new Map<string, CalendarDayView>()
  for (const [date, { slots, calories }] of foldSlotRows(slotRows, meals)
    .days) {
    out.set(date, { date, slots, calories })
  }
  return out
}

export function toWeekPlan(
  view: WeekView,
  portion: PortionLetter | null,
): WeekPlan | null {
  const days: Array<PlanDay> = []
  for (const day of view.days) {
    const meals: DayMeals = {}
    for (const slot of day.slots) {
      if (!slot.meal) return null
      meals[slot.slot] = mealForPortion(slot.meal, portion)
    }
    days.push({ meals, calories: dayCalories(meals) })
  }
  return {
    days,
    params: view.params,
    usedCorridor: view.usedCorridor,
    sources: view.sources,
    mixed: false,
    mixPossible: false,
    warnings: view.warnings,
  }
}
