/**
 * Модель екранів поверх рядків локального SQLite (MER-49).
 *
 * `@meridian/core` описує домен — страву, профіль, тиждень. Тут те, чого домену
 * знати не треба: id рядків `plan_slot` (одиниця LWW, MER-46), колір профілю
 * (акцент інтерфейсу) і чесна відповідь на питання «а чи всі страви плану ще є
 * в пулі».
 *
 * **Дірка в плані можлива, і вона не помилка даних.** Страву видаляють м'яко,
 * але sync віддає лише живі рядки — на іншому пристрої страва просто зникає, а
 * `plan_slot` із посиланням лишається. Тому `SlotView.meal` nullable, а
 * `toWeekPlan` для доменних викликів повертає null, якщо хоч один слот порожній:
 * підставити «якусь» страву означало б вигадати план.
 */

import { MEAL_TYPES, dayCalories, profileFromRow } from '@meridian/core'
import type {
  DayCalories,
  Meal,
  MealType,
  PlanDay,
  Profile,
  Row,
  WeekParams,
  WeekPlan,
} from '@meridian/core'

/**
 * Профіль плюс колір. Колір — суто інтерфейсна річ (акцент активного профілю),
 * тож у доменному `Profile` його немає й бути не має.
 */
export type AppProfile = Profile & { color: string }

/** Порядок слотів у картці дня — хронологічний, як вікна годинника (MER-9). */
export const SLOT_ORDER: ReadonlyArray<MealType> = [
  'breakfast',
  'lunch',
  'snack',
  'dinner',
]

export type SlotView = {
  /** id рядка `plan_slot`: саме він оновлюється при заміні (LWW на слоті). */
  id: string
  slot: MealType
  mealId: string
  /** null — страви більше немає в пулі; рядок слота при цьому живий. */
  meal: Meal | null
}

export type DayView = {
  /** «YYYY-MM-DD» — локальна дата без UTC-зсувів. */
  date: string
  dayIndex: number
  /** Слоти в хронологічному порядку; типів, яких у плані немає, тут теж немає. */
  slots: Array<SlotView>
  byType: Partial<Record<MealType, SlotView>>
  calories: DayCalories
  /** MER-33: минулі дні — незмінна історія, заміни в них немає. */
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
  /** Скільки слотів лишилися без страви — показуємо це вголос. */
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
    // Джерела й попередження — довідкові підписи. Зіпсований JSON тут не привід
    // ховати весь план: план показуємо, підпис лишається порожнім.
    return []
  }
}

/** Рядок `profile` → профіль плюс колір інтерфейсу. */
export function appProfileFromRow(row: Row): AppProfile {
  const color = text(row, 'color').trim().toLowerCase()
  return {
    ...profileFromRow(row),
    // Схема тримає колір NOT NULL із CHECK на `#rrggbb`, тож сюди має приїхати
    // валідне значення. Якщо ні — беремо перший колір палітри: порожній
    // CSS-токен зробив би невидимим увесь акцент інтерфейсу.
    color: /^#[0-9a-f]{6}$/.test(color) ? color : '#4f9dff',
  }
}

/**
 * Рядки `week_plan` + `plan_slot` + пул страв → те, що малює екран «Тиждень».
 *
 * `todayKey` передається аргументом, а не читається з годинника всередині:
 * «сьогодні» — стан пристрою, і рахувати його в двох місцях по-різному — рівно
 * той клас помилки, на якому V1 уже наступав (MER-34).
 */
export function buildWeekView(
  planRow: Row,
  slotRows: ReadonlyArray<Row>,
  meals: ReadonlyMap<string, Meal>,
  todayKey: string,
): WeekView {
  const byDate = new Map<string, Array<SlotView>>()
  const dayIndexOf = new Map<string, number>()
  let missing = 0

  for (const row of slotRows) {
    const slot = text(row, 'slot') as MealType
    if (!MEAL_TYPES.includes(slot)) continue
    const mealId = text(row, 'meal_id')
    const meal = meals.get(mealId) ?? null
    if (!meal) missing += 1
    const date = text(row, 'date')
    const view: SlotView = { id: text(row, 'id'), slot, mealId, meal }
    const list = byDate.get(date)
    if (list) list.push(view)
    else byDate.set(date, [view])
    if (!dayIndexOf.has(date)) dayIndexOf.set(date, int(row, 'day_index'))
  }

  const days: Array<DayView> = [...byDate.keys()].sort().map((date): DayView => {
    const found = byDate.get(date) ?? []
    const byType: Partial<Record<MealType, SlotView>> = {}
    const forCalories: Partial<Record<MealType, Meal | null>> = {}
    for (const view of found) {
      byType[view.slot] = view
      forCalories[view.slot] = view.meal
    }
    return {
      date,
      dayIndex: dayIndexOf.get(date) ?? 0,
      slots: SLOT_ORDER.map((type) => byType[type]).filter(
        (view): view is SlotView => view !== undefined,
      ),
      byType,
      calories: dayCalories(forCalories),
      isPast: date < todayKey,
      isToday: date === todayKey,
    }
  })

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
    missing,
  }
}

/**
 * День календаря (MER-61): слоти однієї дати без прив'язки до конкретного
 * рядка `week_plan`.
 *
 * Це навмисно НЕ `DayView`: календар читає слоти за календарним ключем
 * (профіль + дата, MER-66), і день тут може належати будь-якому поколінню
 * плану — минулому тижню, поточному чи згенерованому наперед. Полів
 * `isPast`/`dayIndex` немає, бо екран календаря сам знає вибрану дату, а
 * порядок днів — це порядок дат.
 */
export type CalendarDayView = {
  /** «YYYY-MM-DD» — локальна дата без UTC-зсувів. */
  date: string
  /** Слоти в хронологічному порядку; відсутні типи не вигадуються. */
  slots: Array<SlotView>
  calories: DayCalories
}

/**
 * Рядки `plan_slot` + пул страв → дні календаря за датами.
 *
 * Дублікат типу слота в межах дати (двоє пристроїв устигли вставити свій рядок
 * до збіжності) не множить рядки на екрані: лишається останній — так само, як
 * `buildWeekView` тримає один слот на тип у `byType`.
 */
export function buildCalendarDays(
  slotRows: ReadonlyArray<Row>,
  meals: ReadonlyMap<string, Meal>,
): Map<string, CalendarDayView> {
  const byDate = new Map<string, Partial<Record<MealType, SlotView>>>()
  for (const row of slotRows) {
    const slot = text(row, 'slot') as MealType
    if (!MEAL_TYPES.includes(slot)) continue
    const mealId = text(row, 'meal_id')
    const view: SlotView = {
      id: text(row, 'id'),
      slot,
      mealId,
      meal: meals.get(mealId) ?? null,
    }
    const date = text(row, 'date')
    const found = byDate.get(date)
    if (found) found[slot] = view
    else byDate.set(date, { [slot]: view })
  }

  const out = new Map<string, CalendarDayView>()
  for (const [date, byType] of byDate) {
    const slots = SLOT_ORDER.map((type) => byType[type]).filter(
      (view): view is SlotView => view !== undefined,
    )
    const forCalories: Partial<Record<MealType, Meal | null>> = {}
    for (const view of slots) forCalories[view.slot] = view.meal
    out.set(date, { date, slots, calories: dayCalories(forCalories) })
  }
  return out
}

/**
 * Вигляд екрана → доменний `WeekPlan` для `suggestReplacements` / `replaceSlot`.
 *
 * null, якщо в плані є хоч один слот без страви або без повного набору типів:
 * домен рахує коридор і антиповтор за всіма слотами дня, і неповний день дав би
 * не «приблизну», а неправильну відповідь.
 *
 * `mixed` / `mixPossible` тут не відновлюються: їх рахує генератор під час
 * збирання тижня, а ручна заміна на них не дивиться (`replace.ts` виводить
 * потребу міксу з самого пулу). Значення, яке нікому не потрібне, краще не
 * вигадувати — тому обидва `false`.
 */
export function toWeekPlan(view: WeekView): WeekPlan | null {
  const days: Array<PlanDay> = []
  for (const day of view.days) {
    const meals = {} as Record<MealType, Meal>
    for (const type of MEAL_TYPES) {
      const meal = day.byType[type]?.meal
      if (!meal) return null
      meals[type] = meal
    }
    days.push({ meals, calories: day.calories })
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
