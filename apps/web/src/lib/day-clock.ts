/**
 * Годинник дня — знак Meridian (MER-45, MER-49).
 *
 * Назва продукту — від меридіана, полудня, поділу доби; коло прийомів їжі — це
 * головний екран V1 і фактично обличчя застосунку. На вході воно каже, що це
 * взагалі за програма, ще до того як показати хоч один рядок даних.
 *
 * Тут лише **геометрія й час пристрою** — жодних страв, калорій чи планів.
 * Страву поточного прийому картка бере окремо, з локальної бази: годинник
 * відповідає лише на питання «який прийом зараз».
 */

import { MEAL_TYPE_LABELS } from '@meridian/core'
import type { MealType, Row } from '@meridian/core'

/**
 * Вікно прийому: тип із домену плюс те, чого в домені немає — межі доби й
 * родовий відмінок для підпису.
 *
 * Підпису («Сніданок») тут навмисно немає: це `MEAL_TYPE_LABELS` із
 * `@meridian/core`, і другий його примірник рано чи пізно розійшовся б із
 * першим (MER-71).
 */
export type MealWindow = {
  type: MealType
  /** Родовий відмінок для підпису «час обіду» — GENITIVE із V1. */
  genitive: string
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

export const MEAL_HOUR_STEP = 15

export const DEFAULT_MEAL_HOURS: MealHours = {
  breakfast: { start: minute(6, 0), end: minute(11, 0) },
  lunch: { start: minute(11, 0), end: minute(15, 0) },
  dinner: { start: minute(18, 0), end: minute(22, 0) },
}

const GENITIVE: Record<MealType, string> = {
  breakfast: 'сніданку',
  lunch: 'обіду',
  dinner: 'вечері',
  snack: 'перекусу',
}

export function mealWindows(hours: MealHours): Array<MealWindow> {
  const bounds: Record<MealType, { start: number; end: number }> = {
    ...hours,
    snack: { start: hours.lunch.end, end: hours.dinner.start },
  }
  return [...MEAL_HOUR_TYPES, 'snack' as const]
    .map((type) => ({
      type,
      genitive: GENITIVE[type],
      startMinute: bounds[type].start,
      endMinute: bounds[type].end,
    }))
    .filter((window) => window.startMinute < window.endMinute)
}

export const DEFAULT_MEAL_WINDOWS = mealWindows(DEFAULT_MEAL_HOURS)

export function mealHoursProblems(
  hours: MealHours,
): Partial<Record<MealHourType, string>> {
  const problems: Partial<Record<MealHourType, string>> = {}
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
      problems[type] = 'Час — від 00:00 до 24:00 із кроком 15 хвилин.'
    } else if (start >= end) {
      problems[type] = 'Початок має бути раніше за кінець.'
    } else if (previous && start < hours[previous].end) {
      problems[type] =
        MEAL_TYPE_LABELS[type] +
        ' має починатися не раніше за кінець ' +
        GENITIVE[previous] +
        ' (' +
        formatMinute(hours[previous].end) +
        ').'
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
    throw new Error('Часові вікна прийомів збережено не повністю.')
  const hours = Object.fromEntries(
    MEAL_HOUR_TYPES.map((type, index) => [
      type,
      { start: values[index * 2], end: values[index * 2 + 1] },
    ]),
  ) as MealHours
  const problem = Object.values(mealHoursProblems(hours))[0]
  if (problem) throw new Error('Часові вікна прийомів: ' + problem)
  return hours
}

/* Геометрія кільця: поле й радіус ті самі, що у V1 (SIZE 300, RING_R 95);
 * кільце тонше (у V1 — 26), щоб сонце на дузі читалося над ним. */
export const CLOCK_SIZE = 300
export const CENTER = CLOCK_SIZE / 2
export const RING_RADIUS = 95
export const RING_WIDTH = 14
/** Радіус підписів навколо кільця — LABEL_R із V1. */
const LABEL_RADIUS = 127

/** Позначки годин на циферблаті: 00, 06, 12, 18 (як у V1). */
export const HOUR_MARKS = [0, 360, 720, 1080] as const

/** Точка на колі для хвилини доби: північ угорі, далі за годинниковою. */
export function pointAt(minutes: number, radius: number): [number, number] {
  const angle = (minutes / DAY_MINUTES) * 2 * Math.PI
  return [CENTER + radius * Math.sin(angle), CENTER - radius * Math.cos(angle)]
}

/** Місце підпису вікна (або позначки години) назовні від кільця. */
export function labelPoint(minutes: number): { x: number; y: number } {
  const [x, y] = pointAt(minutes, LABEL_RADIUS)
  return { x, y }
}

/** Середина вікна — саме там стоїть його підпис. */
export function windowMiddle(window: MealWindow): number {
  return (window.startMinute + window.endMinute) / 2
}

/** Дуга кільця від хвилини `from` до `to` за годинниковою стрілкою. */
export function arcPath(from: number, to: number): string {
  const [x1, y1] = pointAt(from, RING_RADIUS)
  const [x2, y2] = pointAt(to, RING_RADIUS)
  const large = to - from > DAY_MINUTES / 2 ? 1 : 0
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${RING_RADIUS} ${RING_RADIUS} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

/** Кут хвилини доби в градусах: північ угорі, далі за годинниковою. */
export function angleOf(minutes: number): number {
  return (minutes / DAY_MINUTES) * 360
}

type ActiveSlot =
  | { type: MealType; window: MealWindow; next: null }
  | { type: null; window: null; next: MealWindow | null }

/** Який прийом іде зараз; поза вікнами — найближчий наступний (можливо, завтра). */
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

type SkyPhase = 'dawn' | 'noon' | 'golden' | 'dusk' | 'night'

const PHASE_OF: Record<MealType, SkyPhase> = {
  breakfast: 'dawn',
  lunch: 'noon',
  snack: 'golden',
  dinner: 'dusk',
}

/**
 * Фаза неба (дизайн «Сонячна дуга») — активний прийом, названий кольором:
 * світанок на сніданок, полудень на обід, золото на перекус, захід на вечерю
 * й ніч поза вікнами. Нових меж доби немає — це той самий `slotAt`.
 */
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
