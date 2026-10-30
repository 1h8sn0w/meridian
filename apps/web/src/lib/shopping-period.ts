import { useCallback } from 'react'
import { addDays } from '@meridian/core'
import { useStoredChoice } from './device-choice.ts'

const KEY = 'meridian.shopping.period.v1'

export const SHOPPING_PERIODS = ['all', 'fromToday', 'threeDays'] as const

export type ShoppingPeriod = (typeof SHOPPING_PERIODS)[number]

const SHORT_PERIOD_DAYS = 3

export function shoppingPeriodOf(stored: string | null): ShoppingPeriod {
  return SHOPPING_PERIODS.find((period) => period === stored) ?? 'all'
}

export function inShoppingPeriod(
  date: string,
  period: ShoppingPeriod,
  todayKey: string,
): boolean {
  if (period === 'all') return true
  if (date < todayKey) return false
  return period === 'fromToday' || date < addDays(todayKey, SHORT_PERIOD_DAYS)
}

export function useShoppingPeriod(): {
  period: ShoppingPeriod
  setPeriod: (next: ShoppingPeriod) => void
} {
  const [stored, setStored] = useStoredChoice(KEY)

  const setPeriod = useCallback(
    (next: ShoppingPeriod) => setStored(next === 'all' ? null : next),
    [setStored],
  )

  return { period: shoppingPeriodOf(stored), setPeriod }
}
