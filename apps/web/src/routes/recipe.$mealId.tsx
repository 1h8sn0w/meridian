import { createFileRoute } from '@tanstack/react-router'
import { RecipeScreen } from '../components/RecipeScreen'
import { RequireLocalDb } from '../components/RequireLocalDb'

export const Route = createFileRoute('/recipe/$mealId')({ component: Recipe })

function Recipe() {
  const { mealId } = Route.useParams()
  return (
    <RequireLocalDb title="Рецепт">
      {(familyId) => <RecipeScreen mealId={mealId} familyId={familyId} />}
    </RequireLocalDb>
  )
}
