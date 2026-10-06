/**
 * Фільтри «Страв» в адресі (MER-86): у стані екрана повернення з рецепта
 * скидало б їх, і навіть відновлена прокрутка вказувала б на інший список.
 * Невідоме значення з адреси — просто «без фільтра».
 */

import { MEAL_TYPES } from '@meridian/core'

const FILTERS = ['all', ...MEAL_TYPES, 'favorite', 'disliked'] as const

export type MealsFilter = (typeof FILTERS)[number]

export type MealsSearch = { filter?: MealsFilter; gerd?: true }

export function parseMealsSearch(search: Record<string, unknown>): MealsSearch {
  return {
    filter: FILTERS.find((filter) => filter === search.filter),
    gerd: search.gerd === true ? true : undefined,
  }
}
