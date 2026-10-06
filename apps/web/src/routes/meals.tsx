import { createFileRoute } from '@tanstack/react-router'
import { MEAL_TYPES } from '@meridian/core'
import { MealsScreen } from '../components/MealsScreen'
import { RequireLocalDb } from '../components/RequireLocalDb'

const FILTERS = ['all', ...MEAL_TYPES, 'favorite', 'disliked'] as const

export type MealsFilter = (typeof FILTERS)[number]

/* Фільтри списку живуть в адресі, а не в стані екрана (MER-86): інакше
 * повернення з рецепта скидало б їх, і навіть відновлена прокрутка вказувала б
 * на інший список. Невідоме значення з адреси — просто «без фільтра». */
export const Route = createFileRoute('/meals')({
  component: Meals,
  validateSearch: (
    search: Record<string, unknown>,
  ): { filter?: MealsFilter; gerd?: true } => ({
    filter: FILTERS.find((filter) => filter === search.filter),
    gerd: search.gerd === true ? true : undefined,
  }),
})

function Meals() {
  return (
    <RequireLocalDb title="Страви">
      {(familyId) => <MealsScreen familyId={familyId} />}
    </RequireLocalDb>
  )
}
