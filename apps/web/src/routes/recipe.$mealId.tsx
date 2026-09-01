import { createFileRoute } from '@tanstack/react-router'
import { RecipeScreen } from '../components/RecipeScreen'
import { RequireLocalDb } from '../components/RequireLocalDb'

export const Route = createFileRoute('/recipe/$mealId')({ component: Recipe })

function Recipe() {
  const { mealId } = Route.useParams()
  return (
    <RequireLocalDb title="Рецепт">
      {/* `key` — не косметика: без нього перехід між двома рецептами лишає той
          самий екран, а `useQuery` не вважає себе «завантаженим» повторно, коли
          міняються ПАРАМЕТРИ (це `isFetching`, а не `isLoading` — MER-62). Кадр
          із рецептом ПОПЕРЕДНЬОЇ страви виглядав би авторитетно, а відкрита
          форма зберегла б його в чужий рядок. */}
      {(familyId) => (
        <RecipeScreen key={mealId} mealId={mealId} familyId={familyId} />
      )}
    </RequireLocalDb>
  )
}
