/**
 * Фільтри «Страв» в адресі (MER-86): у стані екрана повернення з рецепта
 * скидало б їх, і навіть відновлена прокрутка вказувала б на інший список.
 * Невідоме значення з адреси — просто «без фільтра».
 */

import { MEAL_TYPES } from '@meridian/core'
import type { Meal } from '@meridian/core'

const FILTERS = ['all', ...MEAL_TYPES, 'favorite', 'disliked'] as const

export type MealsFilter = (typeof FILTERS)[number]

export type MealsSearch = { filter?: MealsFilter; gerd?: true; q?: string }

export function parseMealsSearch(search: Record<string, unknown>): MealsSearch {
  return {
    filter: FILTERS.find((filter) => filter === search.filter),
    gerd: search.gerd === true ? true : undefined,
    q: typeof search.q === 'string' && search.q.trim() ? search.q : undefined,
  }
}

const fold = (text: string) =>
  text.toLocaleLowerCase('uk-UA').replace(/[’ʼ`]/g, "'")

export function mealMatches(
  meal: Pick<Meal, 'name' | 'ingredients'>,
  query: string,
): boolean {
  const text = fold(
    [
      meal.name,
      ...meal.ingredients.map((entry) =>
        typeof entry === 'string' ? entry : entry.name,
      ),
    ].join('\n'),
  )
  return fold(query)
    .split(/\s+/)
    .every((word) => text.includes(word))
}
