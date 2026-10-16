import { DEFAULT_PORTION } from './types.ts'
import type { Meal, PortionLetter, Profile } from './types.ts'

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

export function portionOf(
  profile: Pick<Profile, 'portion'> | null | undefined,
): PortionLetter {
  return profile?.portion ?? DEFAULT_PORTION
}

export function mealForPortion(
  meal: Meal,
  portion: PortionLetter | null | undefined,
): Meal {
  return { ...meal, ...meal.nutrition[portion ?? DEFAULT_PORTION] }
}

export function mealsForPortion(
  meals: ReadonlyArray<Meal>,
  portion: PortionLetter | null | undefined,
): Array<Meal> {
  return meals.map((meal) => mealForPortion(meal, portion))
}

export function generationPool(
  meals: ReadonlyArray<Meal>,
  profile: Profile | null | undefined,
): Array<Meal> {
  return mealsForPortion(poolForProfile(meals, profile), profile?.portion)
}
