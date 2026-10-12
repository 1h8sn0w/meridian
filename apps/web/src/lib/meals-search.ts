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
  const query = typeof search.q === 'number' ? String(search.q) : search.q
  return {
    filter: FILTERS.find((filter) => filter === search.filter),
    gerd: search.gerd === true ? true : undefined,
    q: typeof query === 'string' && query.trim() ? query : undefined,
  }
}

const fold = (text: string) =>
  text.toLocaleLowerCase('uk-UA').replace(/[’ʼ`]/g, "'")

export function queryWords(query: string): Array<string> {
  return fold(query).split(/\s+/).filter(Boolean)
}

export function mealMatches(
  meal: Pick<Meal, 'name' | 'ingredients'>,
  words: ReadonlyArray<string>,
): boolean {
  const text = fold(
    [
      meal.name,
      ...meal.ingredients.map((entry) =>
        typeof entry === 'string' ? entry : entry.name,
      ),
    ].join('\n'),
  )
  return words.every((word) => text.includes(word))
}
