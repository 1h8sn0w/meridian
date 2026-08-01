/**
 * Годинник дня — знак Meridian (MER-45).
 *
 * Назва продукту — від меридіана, полудня, поділу доби; коло прийомів їжі — це
 * головний екран V1 і фактично обличчя застосунку. На вході воно каже, що це
 * взагалі за програма, ще до того як показати хоч один рядок даних.
 *
 * Тут лише **геометрія й час пристрою** — жодних страв, калорій чи планів:
 * до входу їх немає, а малювати правдоподібне замість справжнього не можна
 * (правило провенансу). Вікна — `DEFAULT_WINDOWS` із V1, підписи —
 * `MEAL_TYPE_LABELS`; коли користувач увійде, він зможе змінити вікна під себе,
 * і показувати чужі значення до того нема сенсу.
 *
 * Це презентаційна копія, а не порт доменної логіки: справжній `MealClock`
 * переїде в `packages/core` у MER-47, і тоді цей файл візьме вікна звідти.
 */

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export type MealWindow = {
  type: MealType
  /** MEAL_TYPE_LABELS із V1. */
  label: string
  /** Родовий відмінок для підпису «час обіду» — GENITIVE із V1. */
  genitive: string
  startMinute: number
  endMinute: number
}

const minute = (hh: number, mm: number) => hh * 60 + mm

/** DEFAULT_WINDOWS із V1, у хвилинах доби. Порядок — MEAL_TYPES. */
export const MEAL_WINDOWS: Array<MealWindow> = [
  {
    type: 'breakfast',
    label: 'Сніданок',
    genitive: 'сніданку',
    startMinute: minute(6, 0),
    endMinute: minute(11, 0),
  },
  {
    type: 'lunch',
    label: 'Обід',
    genitive: 'обіду',
    startMinute: minute(11, 0),
    endMinute: minute(15, 0),
  },
  {
    type: 'dinner',
    label: 'Вечеря',
    genitive: 'вечері',
    startMinute: minute(18, 0),
    endMinute: minute(22, 0),
  },
  {
    type: 'snack',
    label: 'Перекус',
    genitive: 'перекусу',
    startMinute: minute(15, 0),
    endMinute: minute(18, 0),
  },
]

/* Геометрія кільця — та сама, що у V1 (SIZE 300, RING_R 95, RING_W 26). */
export const CLOCK_SIZE = 300
const CENTER = CLOCK_SIZE / 2
export const RING_RADIUS = 95
export const RING_WIDTH = 26
const DAY_MINUTES = 1440

/** Точка на колі для хвилини доби: північ угорі, далі за годинниковою. */
function pointAt(minutes: number, radius: number): [number, number] {
  const angle = (minutes / DAY_MINUTES) * 2 * Math.PI
  return [CENTER + radius * Math.sin(angle), CENTER - radius * Math.cos(angle)]
}

/** Дуга кільця від хвилини `from` до `to` за годинниковою стрілкою. */
export function arcPath(from: number, to: number): string {
  const [x1, y1] = pointAt(from, RING_RADIUS)
  const [x2, y2] = pointAt(to, RING_RADIUS)
  const large = to - from > DAY_MINUTES / 2 ? 1 : 0
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${RING_RADIUS} ${RING_RADIUS} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

/** Риска поточного часу впоперек кільця. */
export function handPoints(minutes: number) {
  const [x1, y1] = pointAt(minutes, RING_RADIUS - RING_WIDTH / 2 - 4)
  const [x2, y2] = pointAt(minutes, RING_RADIUS + RING_WIDTH / 2 + 4)
  return { x1, y1, x2, y2 }
}

export type ActiveSlot =
  | { type: MealType; window: MealWindow; next: null }
  | { type: null; window: null; next: MealWindow | null }

/** Який прийом іде зараз; поза вікнами — найближчий наступний (можливо, завтра). */
export function slotAt(minutes: number): ActiveSlot {
  for (const w of MEAL_WINDOWS) {
    if (minutes >= w.startMinute && minutes < w.endMinute) {
      return { type: w.type, window: w, next: null }
    }
  }
  let best: { window: MealWindow; delta: number } | null = null
  for (const w of MEAL_WINDOWS) {
    const delta =
      (w.startMinute - minutes + DAY_MINUTES) % DAY_MINUTES || DAY_MINUTES
    if (!best || delta < best.delta) best = { window: w, delta }
  }
  return { type: null, window: null, next: best ? best.window : null }
}

export function formatMinute(minutes: number): string {
  const hh = Math.floor(minutes / 60)
  const mm = minutes % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
