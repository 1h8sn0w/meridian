import { useEffect } from 'react'
import { planOwnerId, portionOf } from '@meridian/core'
import { useStoredChoice } from './device-choice'
import type { AppProfile } from './data/model'

const KEY = 'meridian.profile.v2'

export const PROFILE_COLORS = [
  '#4f9dff',
  '#e0729c',
  '#46c98b',
  '#ffb454',
  '#7f77dd',
] as const

export const DEFAULT_PROFILE_COLOR = PROFILE_COLORS[0]

function applyAccent(color: string): void {
  document.documentElement.style.setProperty('--accent', color)
}

type ActiveProfile = {
  profile: AppProfile | null
  planOwnerId: string | null
  planOwner: AppProfile | null
  ownerCorridorApplies: boolean
  setActive: (id: string) => void
}

export function useActiveProfile(
  profiles: ReadonlyArray<AppProfile>,
): ActiveProfile {
  const [id, setId] = useStoredChoice(KEY)

  const known = profiles.find((p) => p.id === id)
  const fallback = profiles.length ? profiles[0] : null
  const profile: AppProfile | null = known ?? fallback
  const color = profile === null ? DEFAULT_PROFILE_COLOR : profile.color

  useEffect(() => {
    if (profile !== null && profile.id !== id) setId(profile.id)
  }, [id, profile, setId])

  useEffect(() => {
    applyAccent(color)
  }, [color])

  const ownerId = profile ? planOwnerId(profile) : null
  const planOwner = profiles.find((p) => p.id === ownerId) ?? profile

  return {
    profile,
    planOwnerId: ownerId,
    planOwner,
    ownerCorridorApplies: portionOf(profile) === portionOf(planOwner),
    setActive: setId,
  }
}
