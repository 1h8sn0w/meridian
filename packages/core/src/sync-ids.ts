import { v5 as uuidv5 } from 'uuid'

export const MERIDIAN_NAMESPACE = '08f391fa-7b00-47c8-9fc6-61847964d799'

const SEP = '\u0000'

export function derive(parts: ReadonlyArray<string>): string {
  return uuidv5(parts.join(SEP), MERIDIAN_NAMESPACE)
}

type IdKind = 'meal' | 'recipe' | 'profile'

export function derivedId(
  familyId: string,
  kind: IdKind,
  v1Id: string,
): string {
  return derive([familyId, kind, v1Id])
}

export function mealPrefId(mealId: string): string {
  return derive(['meal_pref', mealId])
}

export function shoppingCheckId(
  familyId: string,
  itemKey: string,
  fingerprint: string,
): string {
  return derive(['shopping_check', familyId, itemKey, fingerprint])
}

export function planSlotId(
  profileId: string,
  date: string,
  slot: string,
): string {
  return derive(['plan_slot', profileId, date, slot])
}

export function recipeId(mealId: string): string {
  return derive(['recipe', mealId])
}

export function familySettingsId(familyId: string): string {
  return derive(['family_settings', familyId])
}

export function starterMealId(familyId: string, key: string): string {
  return derive([familyId, 'starter_meal', key])
}
