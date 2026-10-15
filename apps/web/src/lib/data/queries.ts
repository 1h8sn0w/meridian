import { useMemo } from 'react'
import { useQuery } from '@powersync/react'
import {
  DEFAULTS,
  addDays,
  mealFromRow,
  prefsFromRows,
  recipeFromRow,
} from '@meridian/core'
import type {
  CalendarSlot,
  Meal,
  MealType,
  Recipe,
  Row,
  TastePrefs,
} from '@meridian/core'
import {
  antiRepeatDaysFromRow,
  appProfileFromRow,
  buildCalendarDays,
  buildWeekView,
} from './model'
import type { AppProfile, CalendarDayView, WeekView } from './model'
import { LATEST_PLAN_ORDER, NO_DATE, inList, placeholders } from './sql'
import { errorText } from '../messages'
import { mealHoursFromRow } from '../day-clock'
import type { MealHours } from '../day-clock'

type Read<T> = {
  data: T
  isLoading: boolean
  problems: Array<string>
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
      problems.push(errorText(error))
    }
  }
  return { items, problems }
}

function withQueryError(
  problems: Array<string>,
  error: Error | undefined,
): Array<string> {
  return error ? problems.concat('Запит до бази: ' + error.message) : problems
}

function useRead<TItem, TOut>(
  sql: string,
  params: ReadonlyArray<unknown>,
  map: (row: Row) => TItem,
  reduce: (items: Array<TItem>) => TOut,
  deps: ReadonlyArray<unknown> = [],
): Read<TOut> {
  const { data, isLoading, error } = useQuery<Row>(sql, [...params])
  return useMemo(() => {
    const { items, problems } = mapRows(data, map)
    return {
      data: reduce(items),
      isLoading,
      problems: withQueryError(problems, error),
    }
  }, [data, error, isLoading, ...deps])
}

const asList = <T>(items: Array<T>): Array<T> => items

const asFirst = <T>(items: Array<T>): T | null =>
  items.length ? items[0] : null

export function useMeals(): Read<Array<Meal>> {
  return useRead(
    'SELECT * FROM meal WHERE deleted_at IS NULL ORDER BY name',
    [],
    mealFromRow,
    asList,
  )
}

function mealsById(meals: ReadonlyArray<Meal>): Map<string, Meal> {
  return new Map(meals.map((meal) => [meal.id, meal]))
}

export function useRecipe(mealId: string): Read<Recipe | null> {
  return useRead(
    'SELECT * FROM recipe WHERE meal_id = ? AND deleted_at IS NULL LIMIT 1',
    [mealId],
    recipeFromRow,
    asFirst,
  )
}

export function useProfiles(): Read<Array<AppProfile>> {
  return useRead(
    'SELECT * FROM profile WHERE deleted_at IS NULL' +
      ' ORDER BY created_at IS NULL, created_at, name',
    [],
    appProfileFromRow,
    asList,
  )
}

export function useTastePrefs(): Read<TastePrefs> {
  return useRead(
    'SELECT * FROM meal_pref WHERE deleted_at IS NULL',
    [],
    (row) => row,
    prefsFromRows,
  )
}

export function useMealHours(): Read<MealHours | null> {
  return useRead(
    'SELECT * FROM family_settings WHERE deleted_at IS NULL LIMIT 1',
    [],
    mealHoursFromRow,
    asFirst,
  )
}

export function useAntiRepeatDays(): Read<number> {
  return useRead(
    'SELECT anti_repeat_days FROM family_settings WHERE deleted_at IS NULL LIMIT 1',
    [],
    antiRepeatDaysFromRow,
    (items) => asFirst(items) ?? DEFAULTS.antiRepeatDays,
  )
}

export function prefOf(
  prefs: TastePrefs,
  mealId: string,
): 'favorite' | 'disliked' | null {
  if (prefs.favorites.has(mealId)) return 'favorite'
  if (prefs.disliked.has(mealId)) return 'disliked'
  return null
}

export function useWeek(
  ownerId: string | null,
  meals: ReadonlyArray<Meal>,
  todayKey: string,
): Read<WeekView | null> {
  const planQuery = useQuery<Row>(
    'SELECT * FROM week_plan WHERE profile_id = ? AND deleted_at IS NULL' +
      LATEST_PLAN_ORDER,
    [ownerId ?? ''],
  )
  const planRow: Row | null = planQuery.data.length ? planQuery.data[0] : null

  const slotQuery = useQuery<Row>(
    'SELECT * FROM plan_slot WHERE profile_id = ? AND date >= ?' +
      ' AND deleted_at IS NULL ORDER BY day_index, date',
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

export function useCalendarDays(
  ownerId: string | null,
  fromDate: string,
  toDate: string,
  meals: ReadonlyArray<Meal>,
): Read<ReadonlyMap<string, CalendarDayView>> {
  const pool = useMemo(() => mealsById(meals), [meals])
  return useRead(
    'SELECT * FROM plan_slot WHERE profile_id = ? AND deleted_at IS NULL' +
      ' AND date >= ? AND date <= ? ORDER BY updated_at, id',
    [ownerId ?? '', fromDate, toDate],
    (row) => row,
    (rows) =>
      buildCalendarDays(rows, pool) as ReadonlyMap<string, CalendarDayView>,
    [pool],
  )
}

export function usePlannedDayCount(ownerId: string | null): Read<number> {
  return useRead(
    'SELECT count(DISTINCT date) AS days FROM plan_slot' +
      ' WHERE profile_id = ? AND deleted_at IS NULL',
    [ownerId ?? ''],
    (row) => Number(row.days),
    (counts) => {
      const days = counts.length ? counts[0] : 0
      return Number.isFinite(days) ? days : 0
    },
  )
}

export function useDayPlan(
  ownerId: string | null,
  date: string,
): Read<{ target: number; corridor: number } | null> {
  return useRead(
    'SELECT * FROM week_plan WHERE profile_id = ? AND deleted_at IS NULL' +
      ' AND start_date <= ?' +
      LATEST_PLAN_ORDER,
    [ownerId && date ? ownerId : '', date],
    (row) => {
      const days = Number(row.days)
      const target = Number(row.target_calories)
      const corridor = Number(row.used_corridor)
      if (
        !Number.isFinite(days) ||
        days < 1 ||
        !Number.isFinite(target) ||
        !Number.isFinite(corridor)
      ) {
        return null
      }
      if (date > addDays(String(row.start_date), days - 1)) return null
      return { target, corridor }
    },
    asFirst,
    [date],
  )
}

const PLAN_HISTORY_DAYS = 90

export function useOwnerWeeks(
  ownerIds: ReadonlyArray<string>,
  meals: ReadonlyArray<Meal>,
  todayKey: string,
): Read<Array<WeekView>> {
  const owners = inList(ownerIds)
  const planQuery = useQuery<Row>(
    'SELECT * FROM week_plan w WHERE w.deleted_at IS NULL' +
      ` AND w.profile_id IN (${placeholders(owners.length)})` +
      ' AND w.id = (SELECT x.id FROM week_plan x' +
      ' WHERE x.profile_id = w.profile_id AND x.deleted_at IS NULL' +
      LATEST_PLAN_ORDER +
      ')',
    owners,
  )

  const slotQuery = useQuery<Row>(
    'SELECT * FROM plan_slot WHERE deleted_at IS NULL' +
      ` AND profile_id IN (${placeholders(owners.length)})` +
      ' AND date >= ? ORDER BY day_index, date, updated_at, id',
    [...owners, todayKey ? addDays(todayKey, -PLAN_HISTORY_DAYS) : NO_DATE],
  )

  const pool = useMemo(() => mealsById(meals), [meals])

  return useMemo(() => {
    const slotsByOwner = new Map<string, Array<Row>>()
    for (const row of slotQuery.data) {
      const ownerId = String(row.profile_id)
      const found = slotsByOwner.get(ownerId)
      if (found) found.push(row)
      else slotsByOwner.set(ownerId, [row])
    }

    const views = planQuery.data.map((planRow) => {
      const ownerId = String(planRow.profile_id)
      const start = String(planRow.start_date)
      const slots = (slotsByOwner.get(ownerId) ?? []).filter(
        (row) => String(row.date) >= start,
      )
      return buildWeekView(planRow, slots, pool, todayKey)
    })

    return {
      data: views,
      isLoading: planQuery.isLoading || slotQuery.isLoading,
      problems: withQueryError(
        withQueryError([], planQuery.error),
        slotQuery.error,
      ),
    }
  }, [
    planQuery.data,
    planQuery.error,
    planQuery.isLoading,
    pool,
    slotQuery.data,
    slotQuery.error,
    slotQuery.isLoading,
    todayKey,
  ])
}

export function useShoppingChecks(
  fingerprint: string,
): Read<ReadonlyMap<string, boolean>> {
  return useRead(
    'SELECT item_key, checked FROM shopping_check' +
      ' WHERE fingerprint = ? AND deleted_at IS NULL',
    [fingerprint],
    (row) => row,
    (rows) => {
      const checks = new Map<string, boolean>()
      for (const row of rows) {
        const key = String(row.item_key)
        if (key) checks.set(key, Number(row.checked) !== 0)
      }
      return checks
    },
  )
}

export function useMealUsage(mealId: string | null): number {
  const { data } = useQuery<{ used: number }>(
    'SELECT count(*) AS used FROM plan_slot' +
      ' WHERE meal_id = ? AND deleted_at IS NULL',
    [mealId ?? ''],
  )
  return data.length ? data[0].used : 0
}
