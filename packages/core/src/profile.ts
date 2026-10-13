import type { Meal, Profile } from './types.ts'

export function poolForProfile(
  meals: ReadonlyArray<Meal>,
  profile: Profile | null | undefined,
): Array<Meal> {
  const ids = profile?.mealIds
  if (!ids) return [...meals]
  const allowed = new Set(ids)
  return meals.filter((meal) => allowed.has(meal.id))
}

export function planOwnerId(profile: Profile): string {
  return profile.sharedPlanWith ?? profile.id
}
