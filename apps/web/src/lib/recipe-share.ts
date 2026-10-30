import type { Meal, Recipe } from '@meridian/core'
import { messages } from './i18n/locale.ts'
import { ingredientLabel } from './meal-text.ts'

export function recipeText(
  meal: Pick<Meal, 'name' | 'ingredients'>,
  recipe: Pick<Recipe, 'steps' | 'servings'> | null,
): string {
  const steps = recipe?.steps ?? []
  if (!meal.ingredients.length && !steps.length) return ''

  const t = messages()
  const servings = recipe?.servings ?? null
  const blocks = [
    meal.name + (servings === null ? '' : t.recipe.forServings(servings)),
  ]
  if (meal.ingredients.length) {
    blocks.push(
      [
        t.details.ingredients,
        ...meal.ingredients.map((entry) => '• ' + ingredientLabel(entry)),
      ].join('\n'),
    )
  }
  if (steps.length) {
    blocks.push(
      [
        t.recipe.cooking,
        ...steps.map((step, index) => index + 1 + '. ' + step),
      ].join('\n'),
    )
  }
  return blocks.join('\n\n')
}
