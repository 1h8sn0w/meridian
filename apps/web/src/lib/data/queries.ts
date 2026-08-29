/**
 * Читання локального SQLite (MER-49).
 *
 * Кожен екран бере дані звідси й **ніколи не чекає мережі**: запити йдуть у базу
 * на пристрої, а PowerSync фоном тримає її в збіжності з Postgres (MER-46).
 * `useQuery` сам перепідписується на зміни таблиць, тож окремого «оновити»
 * ніде немає — зміна з іншого пристрою просто з'являється на екрані.
 *
 * Окремого шару кешу (TanStack Query) тут свідомо немає: реактивний запит до
 * локальної бази вже дає рівно те, заради чого його зазвичай беруть, а другий
 * кеш поверх кеша — це те саме «не ускладнювати», лише дорожче.
 *
 * `rows.ts` у ядрі розбирає рядки СУВОРО: зіпсований рядок — помилка, а не тихе
 * значення за замовчуванням. Тому кожне читання ловить її **порядково**: одна
 * биті страва не має гасити весь екран, але й мовчати про неї не можна — текст
 * помилки повертається поруч із даними, і екран показує його як попередження.
 */

import { useMemo } from 'react'
import { useQuery } from '@powersync/react'
import { addDays, mealFromRow, prefsFromRows } from '@meridian/core'
import type { CalendarSlot, Meal, MealType, Row, TastePrefs } from '@meridian/core'
import { appProfileFromRow, buildCalendarDays, buildWeekView } from './model'
import type { AppProfile, CalendarDayView, WeekView } from './model'

/** Результат читання: дані плюс чесний перелік того, що не розібралося. */
export type Read<T> = {
  data: T
  isLoading: boolean
  problems: Array<string>
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function mapRows<T>(
  rows: ReadonlyArray<Row>,
  map: (row: Row) => T,
): { items: Array<T>; problems: Array<string> } {
  const items: Array<T> = []
  const problems: Array<string> = []
  for (const row of rows) {
    try {
      items.push(map(row))
    } catch (error) {
      problems.push(describe(error))
    }
  }
  return { items, problems }
}

/* Помилка самого запиту — теж проблема, яку користувач має бачити. */
function withQueryError(
  problems: Array<string>,
  error: Error | undefined,
): Array<string> {
  return error ? problems.concat('Запит до бази: ' + error.message) : problems
}

/* ==========================================================================
 * Пул страв — спільний для сім'ї (як `meridian.meals.v1` у V1)
 * ======================================================================== */

export function useMeals(): Read<Array<Meal>> {
  const { data, isLoading, error } = useQuery<Row>(
    'SELECT * FROM meal WHERE deleted_at IS NULL ORDER BY name',
  )
  return useMemo(() => {
    const { items, problems } = mapRows(data, mealFromRow)
    return {
      data: items,
      isLoading,
      problems: withQueryError(problems, error),
    }
  }, [data, error, isLoading])
}

/** Пул як мапа id → страва: план посилається на страви саме за id. */
export function mealsById(meals: ReadonlyArray<Meal>): Map<string, Meal> {
  return new Map(meals.map((meal) => [meal.id, meal]))
}

/* ==========================================================================
 * Профілі — раціони сім'ї (MER-21)
 * ======================================================================== */

export function useProfiles(): Read<Array<AppProfile>> {
  // `created_at` ставить сервер, тож у щойно створеного профілю він поки NULL.
  // `created_at IS NULL` (0/1) у сортуванні тримає такі рядки в кінці — інакше
  // новий профіль стрибав би на початок списку й повертався назад після sync.
  const { data, isLoading, error } = useQuery<Row>(
    'SELECT * FROM profile WHERE deleted_at IS NULL' +
      ' ORDER BY created_at IS NULL, created_at, name',
  )
  return useMemo(() => {
    const { items, problems } = mapRows(data, appProfileFromRow)
    return {
      data: items,
      isLoading,
      problems: withQueryError(problems, error),
    }
  }, [data, error, isLoading])
}

/* ==========================================================================
 * Смаки (MER-18) — правило добору в генераторі, не косметика
 * ======================================================================== */

export function useTastePrefs(): Read<TastePrefs> {
  const { data, isLoading, error } = useQuery<Row>(
    'SELECT * FROM meal_pref WHERE deleted_at IS NULL',
  )
  return useMemo(
    () => ({
      data: prefsFromRows(data),
      isLoading,
      problems: withQueryError([], error),
    }),
    [data, error, isLoading],
  )
}

/** Смак конкретної страви — для кнопок «♥» / «🚫». */
export function prefOf(
  prefs: TastePrefs,
  mealId: string,
): 'favorite' | 'disliked' | null {
  if (prefs.favorites.has(mealId)) return 'favorite'
  if (prefs.disliked.has(mealId)) return 'disliked'
  return null
}

/* ==========================================================================
 * Тиждень: план власника + його слоти
 * ======================================================================== */

/**
 * Поточний план профілю-власника. «Поточний» — найпізніший за датою початку:
 * тиждень, згенерований наперед, стає поточним, щойно почнеться. У V1 план був
 * рівно один на профіль (`meridian.week.v1.<id>`); тут рядки накопичуються, і
 * це навмисно — минулі тижні лишаються історією календаря.
 */
export function useWeek(
  ownerId: string | null,
  meals: ReadonlyArray<Meal>,
  todayKey: string,
): Read<WeekView | null> {
  const planQuery = useQuery<Row>(
    'SELECT * FROM week_plan WHERE profile_id = ? AND deleted_at IS NULL' +
      ' ORDER BY start_date DESC, generated_at DESC LIMIT 1',
    [ownerId ?? ''],
  )
  // Через довжину, а не `data[0] ?? null`: у цьому пакеті індексний доступ
  // типізується як завжди визначений, тож `??` тут був би мертвим кодом.
  const planRow: Row | null = planQuery.data.length ? planQuery.data[0] : null

  /* Слоти беруться за календарним ключем (профіль + дата), а НЕ за
   * `week_plan_id` — це пара до виведених id слотів (MER-66). Двоє офлайн
   * генерують той самий тиждень уперше: слоти сходяться в один набір рядків,
   * але кожен пристрій вставив СВІЙ рядок `week_plan` (у нього немає
   * унікального природного ключа), і `week_plan_id` злитих слотів вказує лише
   * на один із двох. Вибірка за `week_plan_id` на другому пристрої дала б
   * живий план із порожнім календарем. Календарний ключ цього не боїться:
   * після `saveWeek` (який переписує слоти за природним ключем) усі живі
   * слоти з датами від початку плану належать поточному поколінню — чиїм би
   * рядком плану воно не було представлене. */
  const slotQuery = useQuery<Row>(
    'SELECT * FROM plan_slot WHERE profile_id = ? AND date >= ?' +
      ' AND deleted_at IS NULL ORDER BY day_index, date',
    // Без плану профіль порожній рядок — вибірка свідомо не збігається ні з чим.
    [planRow ? (ownerId ?? '') : '', planRow ? String(planRow.start_date) : ''],
  )

  const pool = useMemo(() => mealsById(meals), [meals])

  return useMemo(() => {
    const isLoading = planQuery.isLoading || slotQuery.isLoading
    const problems = withQueryError(
      withQueryError([], planQuery.error),
      slotQuery.error,
    )
    if (!planRow) return { data: null, isLoading, problems }
    return {
      data: buildWeekView(planRow, slotQuery.data, pool, todayKey),
      isLoading,
      problems,
    }
  }, [
    planRow,
    planQuery.error,
    planQuery.isLoading,
    pool,
    slotQuery.data,
    slotQuery.error,
    slotQuery.isLoading,
    todayKey,
  ])
}

/**
 * Слоти календаря профілю за останні дні ПЕРЕД `startDate` — вікно антиповтору
 * через межу тижнів (MER-29). Беремо з усіх планів профілю, а не лише з
 * поточного: учорашній день міг належати попередньому тижню, і саме через це
 * V1 колись і повторював страву на межі.
 */
export function usePrecedingSlots(
  ownerId: string | null,
  fromDate: string,
  toDate: string,
): Array<CalendarSlot> {
  const { data } = useQuery<Row>(
    'SELECT date, slot, meal_id FROM plan_slot' +
      ' WHERE profile_id = ? AND deleted_at IS NULL AND date >= ? AND date < ?',
    [ownerId ?? '', fromDate, toDate],
  )
  return useMemo(
    () =>
      data.map((row) => ({
        date: String(row.date),
        slot: String(row.slot) as MealType,
        mealId: String(row.meal_id),
      })),
    [data],
  )
}

/* ==========================================================================
 * Календар (MER-61): дні за датами, межі історії, план дня
 * ======================================================================== */

/**
 * Дні календаря профілю в діапазоні дат (включно з обома межами). Читається за
 * календарним ключем «профіль + дата», а не за `week_plan_id` — з тієї ж
 * причини, що й `useWeek` (MER-66): день міг бути записаний будь-яким
 * поколінням плану, і календарю байдуже, яким саме.
 */
export function useCalendarDays(
  ownerId: string | null,
  fromDate: string,
  toDate: string,
  meals: ReadonlyArray<Meal>,
): Read<ReadonlyMap<string, CalendarDayView>> {
  const { data, isLoading, isFetching, error } = useQuery<Row>(
    'SELECT * FROM plan_slot WHERE profile_id = ? AND deleted_at IS NULL' +
      ' AND date >= ? AND date <= ?',
    [ownerId ?? '', fromDate, toDate],
  )
  const pool = useMemo(() => mealsById(meals), [meals])
  return useMemo(
    () => ({
      data: buildCalendarDays(data, pool),
      // При зміні діапазону (гортання, вибір дня) хук якийсь час віддає СТАРІ
      // рядки з `isFetching` — для викликача це теж «ще не завантажилось»,
      // інакше панель дня встигає чесно збрехати «плану немає».
      isLoading: isLoading || isFetching,
      problems: withQueryError([], error),
    }),
    [data, error, isFetching, isLoading, pool],
  )
}

/** Межі запланованого: перший і останній день, кількість днів із планом. */
export type CalendarBounds = { first: string; last: string; count: number }

export function useCalendarBounds(
  ownerId: string | null,
): Read<CalendarBounds | null> {
  const { data, isLoading, error } = useQuery<{
    first: string | null
    last: string | null
    days: number | null
  }>(
    'SELECT min(date) AS first, max(date) AS last,' +
      ' count(DISTINCT date) AS days FROM plan_slot' +
      ' WHERE profile_id = ? AND deleted_at IS NULL',
    [ownerId ?? ''],
  )
  return useMemo(() => {
    const row = data.length ? data[0] : null
    const bounds =
      row && row.first && row.last
        ? {
            first: row.first,
            last: row.last,
            count: Number(row.days) || 0,
          }
        : null
    return { data: bounds, isLoading, problems: withQueryError([], error) }
  }, [data, error, isLoading])
}

/**
 * Ціль і коридор плану, що покривав дату, — для підсумку дня в календарі.
 *
 * Береться найпізніший план із `start_date <= date`: після перегенерації
 * посеред тижня слоти від її старту переписані новим поколінням, а дні до
 * старту лишилися від попереднього — саме його ціль для них і чинна. null,
 * якщо жоден план дату не покриває або в рядку немає чисел: показати «якусь»
 * ціль гірше, ніж не показати жодної.
 */
export function useDayPlan(
  ownerId: string | null,
  date: string,
): { target: number; corridor: number } | null {
  const { data } = useQuery<Row>(
    'SELECT * FROM week_plan WHERE profile_id = ? AND deleted_at IS NULL' +
      ' AND start_date <= ? ORDER BY start_date DESC, generated_at DESC LIMIT 1',
    [ownerId && date ? ownerId : '', date],
  )
  return useMemo(() => {
    if (!data.length) return null
    const row = data[0]
    const days = Number(row.days)
    if (!Number.isFinite(days) || days < 1) return null
    if (date > addDays(String(row.start_date), days - 1)) return null
    const target = Number(row.target_calories)
    const corridor = Number(row.used_corridor)
    if (!Number.isFinite(target) || !Number.isFinite(corridor)) return null
    return { target, corridor }
  }, [data, date])
}

/**
 * Чи використовується страва хоч в одному живому слоті плану. Видалення такої
 * страви лишило б у плані дірку (див. `model.ts`), тож екран «Страви» його
 * блокує й каже, чому.
 */
export function useMealUsage(mealId: string | null): number {
  const { data } = useQuery<{ used: number }>(
    'SELECT count(*) AS used FROM plan_slot' +
      ' WHERE meal_id = ? AND deleted_at IS NULL',
    [mealId ?? ''],
  )
  return data.length ? data[0].used : 0
}
