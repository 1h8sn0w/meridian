import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useSyncState } from './powersync/provider'
import { useMealHours } from './data/queries'
import {
  DEFAULT_MEAL_HOURS,
  DEFAULT_MEAL_WINDOWS,
  mealWindows,
} from './day-clock'
import type { MealHours, MealWindow } from './day-clock'

type MealWindowsValue = {
  hours: MealHours | null
  windows: ReadonlyArray<MealWindow>
  problems: ReadonlyArray<string>
}

const MealWindowsContext = createContext<MealWindowsValue>({
  hours: null,
  windows: DEFAULT_MEAL_WINDOWS,
  problems: [],
})

export function useMealWindows(): MealWindowsValue {
  return useContext(MealWindowsContext)
}

export function MealWindowsProvider({ children }: { children: ReactNode }) {
  const { db } = useSyncState()
  return db ? <StoredMealWindows>{children}</StoredMealWindows> : children
}

function StoredMealWindows({ children }: { children: ReactNode }) {
  const read = useMealHours()
  const value = useMemo(
    () => ({
      hours: read.data,
      windows: mealWindows(read.data ?? DEFAULT_MEAL_HOURS),
      problems: read.problems,
    }),
    [read],
  )
  return (
    <MealWindowsContext.Provider value={value}>
      {children}
    </MealWindowsContext.Provider>
  )
}
