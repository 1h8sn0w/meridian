/**
 * Правила, які профіль накладає на спільні дані сім'ї (V1 `ProfileStore`, без
 * сховища). Пул страв і смаки — спільні для сім'ї; профіль лише звужує пул і
 * вирішує, чий план читає.
 */

import type { Meal, Profile } from './types.ts'

/**
 * Пул страв, видимий профілю: власна підмножина спільного пулу (`mealIds`) або
 * весь пул, якщо підмножини немає.
 *
 * `null` і порожній масив — різні стани: `null` означає «увесь пул», порожній
 * масив — «жодної страви». Саме тому в схемі `meal_ids` nullable, а не `[]`.
 */
export function poolForProfile(
  meals: ReadonlyArray<Meal>,
  profile: Profile | null | undefined,
): Array<Meal> {
  const ids = profile?.mealIds
  if (!ids) return [...meals]
  const allowed = new Set(ids)
  return meals.filter((meal) => allowed.has(meal.id))
}

/**
 * MER-17: чий тиждень і календар читає профіль. Пов'язані профілі їдять ТІ САМІ
 * страви, тож план у них один — власників. Ланцюжки заборонені (CHECK у схемі),
 * тож одного кроку досить.
 */
export function planOwnerId(profile: Profile): string {
  return profile.sharedPlanWith ?? profile.id
}
