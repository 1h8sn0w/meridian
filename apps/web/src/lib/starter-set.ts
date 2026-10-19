import { parseStarterSet, starterMealId } from '@meridian/core'
import type { StarterMeal } from '@meridian/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { messages } from './i18n/locale.ts'
import { rpcFailure } from './messages.ts'
import type { Failure, Outcome } from './messages.ts'

export type StarterStatus = 'none' | 'pending' | 'seeded'

export async function starterStatus(
  supabase: SupabaseClient,
): Promise<Outcome<StarterStatus>> {
  const { data, error } = await supabase.rpc('starter_set_status')
  if (error) return { ok: false, failure: rpcFailure(error) }
  return { ok: true, value: data as StarterStatus }
}

export type StarterFetch =
  Outcome<Array<StarterMeal>> | { ok: false; failure: Failure; broken: true }

async function loadStarterMeals(
  supabase: SupabaseClient,
): Promise<StarterFetch> {
  const { data, error } = await supabase.rpc('starter_set')
  if (error) return { ok: false, failure: rpcFailure(error) }
  if (data === null) return { ok: true, value: [] }
  const parsed = parseStarterSet(data)
  if (!parsed.ok) {
    return {
      ok: false,
      broken: true,
      failure: {
        text: messages().starter.broken,
        detail: parsed.error,
      },
    }
  }
  return { ok: true, value: parsed.set.meals }
}

let loaded: Promise<StarterFetch> | null = null

export function fetchStarterMeals(
  supabase: SupabaseClient,
): Promise<StarterFetch> {
  loaded ??= loadStarterMeals(supabase).then(
    (result) => {
      if (!result.ok) loaded = null
      return result
    },
    (cause: unknown) => {
      loaded = null
      throw cause
    },
  )
  return loaded
}

export async function claimStarterSet(
  supabase: SupabaseClient,
): Promise<Outcome<boolean>> {
  const { data, error } = await supabase.rpc('claim_starter_set')
  if (error) return { ok: false, failure: rpcFailure(error) }
  return { ok: true, value: data === true }
}

export function missingStarterMeals(
  familyId: string,
  meals: ReadonlyArray<StarterMeal>,
  liveIds: ReadonlySet<string>,
): Array<StarterMeal> {
  return meals.filter((meal) => !liveIds.has(starterMealId(familyId, meal.key)))
}

export type SeedSteps = {
  cancelled: () => boolean
  seededHere: () => boolean
  rememberSeeded: () => void
  firstSync: () => Promise<void>
  status: () => Promise<Outcome<StarterStatus>>
  poolHasMeals: () => Promise<boolean>
  fetchMeals: () => Promise<StarterFetch>
  write: (meals: ReadonlyArray<StarterMeal>) => Promise<number>
  claim: () => Promise<Outcome<boolean>>
}

export async function markSeeded(
  steps: Pick<SeedSteps, 'cancelled' | 'claim' | 'rememberSeeded'>,
): Promise<void> {
  if (steps.cancelled()) return
  const claim = await steps.claim()
  if (claim.ok) steps.rememberSeeded()
}

export async function autoSeed(steps: SeedSteps): Promise<void> {
  if (steps.seededHere()) return
  await steps.firstSync()
  if (steps.cancelled()) return
  const status = await steps.status()
  if (steps.cancelled() || !status.ok || status.value === 'none') return
  if (status.value === 'seeded') return steps.rememberSeeded()

  const hasMeals = await steps.poolHasMeals()
  if (steps.cancelled()) return
  if (hasMeals) return markSeeded(steps)

  const meals = await steps.fetchMeals()
  if (steps.cancelled()) return
  if (!meals.ok) {
    console.error(meals.failure.text, meals.failure.detail ?? '')
    return
  }
  if (!meals.value.length) return
  await steps.write(meals.value)
  await markSeeded(steps)
}

const seededKey = (familyId: string) => 'meridian.starter-seeded.' + familyId

export const seededHere = (familyId: string): boolean =>
  window.localStorage.getItem(seededKey(familyId)) !== null

export const rememberSeeded = (familyId: string): void =>
  window.localStorage.setItem(seededKey(familyId), '1')
