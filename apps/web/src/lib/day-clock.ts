import { messages } from './i18n/locale.ts'
import type { MealType, Row } from '@meridian/core'

export type MealWindow = {
  type: MealType
  startMinute: number
  endMinute: number
}

const DAY_MINUTES = 1440

const minute = (hh: number, mm: number) => hh * 60 + mm

export type MealHourType = 'breakfast' | 'lunch' | 'dinner'

export type MealHours = Record<MealHourType, { start: number; end: number }>

export const MEAL_HOUR_TYPES: ReadonlyArray<MealHourType> = [
  'breakfast',
  'lunch',
  'dinner',
]

const MEAL_HOUR_STEP = 15

export const MEAL_HOUR_MARKS = Array.from(
  { length: DAY_MINUTES / MEAL_HOUR_STEP + 1 },
  (_, index) => index * MEAL_HOUR_STEP,
)

export const DEFAULT_MEAL_HOURS: MealHours = {
  breakfast: { start: minute(6, 0), end: minute(11, 0) },
  lunch: { start: minute(11, 0), end: minute(15, 0) },
  dinner: { start: minute(18, 0), end: minute(22, 0) },
}

export function mealWindows(hours: MealHours): Array<MealWindow> {
  const bounds: Record<MealType, { start: number; end: number }> = {
    ...hours,
    snack: { start: hours.lunch.end, end: hours.dinner.start },
  }
  return [...MEAL_HOUR_TYPES, 'snack' as const]
    .map((type) => ({
      type,
      startMinute: bounds[type].start,
      endMinute: bounds[type].end,
    }))
    .filter((window) => window.startMinute < window.endMinute)
}

export const DEFAULT_MEAL_WINDOWS = mealWindows(DEFAULT_MEAL_HOURS)

export function sameMealHours(a: MealHours, b: MealHours): boolean {
  return MEAL_HOUR_TYPES.every(
    (type) => a[type].start === b[type].start && a[type].end === b[type].end,
  )
}

export function mealHoursProblems(
  hours: MealHours,
): Partial<Record<MealHourType, string>> {
  const problems: Partial<Record<MealHourType, string>> = {}
  const t = messages().mealHours
  MEAL_HOUR_TYPES.forEach((type, index) => {
    const { start, end } = hours[type]
    const previous = index ? MEAL_HOUR_TYPES[index - 1] : null
    if (
      ![start, end].every(
        (value) =>
          Number.isInteger(value) &&
          value >= 0 &&
          value <= DAY_MINUTES &&
          value % MEAL_HOUR_STEP === 0,
      )
    ) {
      problems[type] = t.timeRange
    } else if (start >= end) {
      problems[type] = t.startBeforeEnd
    } else if (previous && start < hours[previous].end) {
      problems[type] = t.afterPrevious(
        type,
        previous,
        formatMinute(hours[previous].end),
      )
    }
  })
  return problems
}

export function mealHoursFromRow(row: Row): MealHours | null {
  const values = MEAL_HOUR_TYPES.flatMap((type) => [
    row[type + '_start'],
    row[type + '_end'],
  ])
  if (values.every((value) => value === null || value === undefined))
    return null
  if (!values.every((value): value is number => typeof value === 'number'))
    throw new Error(messages().mealHours.savedPartly)
  const hours = Object.fromEntries(
    MEAL_HOUR_TYPES.map((type, index) => [
      type,
      { start: values[index * 2], end: values[index * 2 + 1] },
    ]),
  ) as MealHours
  const problem = Object.values(mealHoursProblems(hours))[0]
  if (problem) throw new Error(messages().mealHours.savedBroken(problem))
  return hours
}

export const CLOCK_SIZE = 300
export const CENTER = CLOCK_SIZE / 2
export const RING_RADIUS = 95
export const RING_WIDTH = 14
const LABEL_RADIUS = 127

export const HOUR_MARKS = [0, 360, 720, 1080] as const

export function pointAt(minutes: number, radius: number): [number, number] {
  const angle = (minutes / DAY_MINUTES) * 2 * Math.PI
  return [CENTER + radius * Math.sin(angle), CENTER - radius * Math.cos(angle)]
}

export function labelPoint(minutes: number): { x: number; y: number } {
  const [x, y] = pointAt(minutes, LABEL_RADIUS)
  return { x, y }
}

export function windowMiddle(window: MealWindow): number {
  return (window.startMinute + window.endMinute) / 2
}

export function arcPath(from: number, to: number): string {
  const [x1, y1] = pointAt(from, RING_RADIUS)
  const [x2, y2] = pointAt(to, RING_RADIUS)
  const large = to - from > DAY_MINUTES / 2 ? 1 : 0
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${RING_RADIUS} ${RING_RADIUS} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

export function angleOf(minutes: number): number {
  return (minutes / DAY_MINUTES) * 360
}

type ActiveSlot =
  | { type: MealType; window: MealWindow; next: null }
  | { type: null; window: null; next: MealWindow | null }

export function slotAt(
  minutes: number,
  windows: ReadonlyArray<MealWindow>,
): ActiveSlot {
  for (const w of windows) {
    if (minutes >= w.startMinute && minutes < w.endMinute) {
      return { type: w.type, window: w, next: null }
    }
  }
  let best: { window: MealWindow; delta: number } | null = null
  for (const w of windows) {
    const delta =
      (w.startMinute - minutes + DAY_MINUTES) % DAY_MINUTES || DAY_MINUTES
    if (!best || delta < best.delta) best = { window: w, delta }
  }
  return { type: null, window: null, next: best ? best.window : null }
}

export function windowsAfter(
  windows: ReadonlyArray<MealWindow>,
  type: MealType,
): Array<MealWindow> {
  const shown = windows.find((w) => w.type === type)
  if (!shown) return []
  return windows
    .filter((w) => w.startMinute > shown.startMinute)
    .sort((a, b) => a.startMinute - b.startMinute)
}

type SkyPhase = 'dawn' | 'noon' | 'golden' | 'dusk' | 'night'

const PHASE_OF: Record<MealType, SkyPhase> = {
  breakfast: 'dawn',
  lunch: 'noon',
  snack: 'golden',
  dinner: 'dusk',
}

export function phaseAt(
  minutes: number,
  windows: ReadonlyArray<MealWindow>,
): SkyPhase {
  const type = slotAt(minutes, windows).type
  return type ? PHASE_OF[type] : 'night'
}

export function formatMinute(minutes: number): string {
  const hh = Math.floor(minutes / 60)
  const mm = minutes % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
