import { useCallback } from 'react'
import { useStoredChoice } from './device-choice'
import type { AppProfile } from './data/model'

const KEY = 'meridian.shopping.scope.v2'

export type ShoppingScope = string

export const ALL_PROFILES = 'all'

type ActiveScope = {
  scope: ShoppingScope
  setScope: (next: ShoppingScope) => void
}

export function useShoppingScope(
  profiles: ReadonlyArray<AppProfile>,
): ActiveScope {
  const [stored, setStored] = useStoredChoice(KEY)

  const scope: ShoppingScope =
    stored !== null && profiles.some((profile) => profile.id === stored)
      ? stored
      : ALL_PROFILES

  const setScope = useCallback(
    (next: ShoppingScope) => setStored(next === ALL_PROFILES ? null : next),
    [setStored],
  )

  return { scope, setScope }
}
