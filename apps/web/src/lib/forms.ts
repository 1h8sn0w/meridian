import {
  MEAL_TYPES,
  NO_NUTRITION,
  PORTION_LETTERS,
  numberFromField,
} from '@meridian/core'
import type { Meal, MealType, Nutrition, PortionLetter } from '@meridian/core'
import { messages } from './i18n/locale.ts'
import { ingredientsFromText, portionsFromText } from './meal-text.ts'
import type { AppProfile } from './data/model.ts'
import type { MealInput, ProfileInput, RecipeInput } from './data/mutations.ts'

type Checked<T> = { input: T } | { error: string }

export function fieldText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}

export function linesFromText(text: string): Array<string> {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function fieldError(raw: string, label: string): string | null {
  const value = numberFromField(raw)
  if (raw.trim() && value === null) return messages().forms.notNumber(label)
  if (value !== null && value < 0) return messages().forms.negative(label)
  return null
}

export type NutritionDraft = Record<keyof Nutrition, string>

export function nutritionDraft(
  meal: Pick<Meal, 'nutrition'> | null,
): Record<PortionLetter, NutritionDraft> {
  const draftOf = (letter: PortionLetter): NutritionDraft => {
    const value = meal?.nutrition[letter] ?? NO_NUTRITION
    return {
      calories: fieldText(value.calories),
      protein: fieldText(value.protein),
      fat: fieldText(value.fat),
      carbs: fieldText(value.carbs),
    }
  }
  return { Ч: draftOf('Ч'), Ж: draftOf('Ж') }
}

function nutritionFromDraft(draft: NutritionDraft): Nutrition {
  const calories = numberFromField(draft.calories)
  return {
    calories: calories === null ? null : Math.round(calories),
    protein: numberFromField(draft.protein),
    fat: numberFromField(draft.fat),
    carbs: numberFromField(draft.carbs),
  }
}

export type MealDraft = {
  name: string
  type: MealType
  nutrition: Record<PortionLetter, NutritionDraft>
  ingredients: string
  portions: string
  source: string
  gerd: boolean
  sourceIssues: string
}

export function validateMeal(draft: MealDraft): Checked<MealInput> {
  const t = messages().forms
  const name = draft.name.trim()
  if (!name) return { error: t.nameRequired }
  if (!MEAL_TYPES.includes(draft.type)) {
    return { error: t.typeRequired }
  }
  for (const letter of PORTION_LETTERS) {
    for (const [field, label] of Object.entries(t.nutrition)) {
      const error = fieldError(
        draft.nutrition[letter][field as keyof Nutrition],
        t.portionField(label, letter),
      )
      if (error) return { error }
    }
  }
  return {
    input: {
      name,
      type: draft.type,
      nutrition: {
        Ч: nutritionFromDraft(draft.nutrition.Ч),
        Ж: nutritionFromDraft(draft.nutrition.Ж),
      },
      ingredients: ingredientsFromText(draft.ingredients),
      source: draft.source.trim(),
      portions: portionsFromText(draft.portions),
      gerd: draft.gerd,
      sourceIssues: linesFromText(draft.sourceIssues),
    },
  }
}

export type ProfileDraft = {
  id: string | null
  name: string
  targetCalories: string
  corridor: string
  color: string
  portion: '' | PortionLetter
  sharedPlanWith: string
  goalProtein: string
  goalFat: string
  goalCarbs: string
  mealIds: Array<string> | null
  withSnack: boolean
}

export function validateProfile(
  draft: ProfileDraft,
  profiles: ReadonlyArray<AppProfile>,
): Checked<ProfileInput> {
  const t = messages().forms
  const name = draft.name.trim()
  if (!name) return { error: t.profileNameRequired }

  const targetCalories = numberFromField(draft.targetCalories)
  if (targetCalories === null || targetCalories <= 0) {
    return { error: t.targetPositive }
  }

  const corridor = numberFromField(draft.corridor)
  if (corridor === null || corridor < 0) {
    return { error: t.corridorNonNegative }
  }

  const shared = draft.sharedPlanWith.trim()
  if (shared) {
    if (shared === draft.id) {
      return { error: t.sharedSelf }
    }
    const owner = profiles.find((p) => p.id === shared)
    if (!owner) return { error: t.sharedMissing }
    if (owner.sharedPlanWith) {
      return { error: t.sharedFollower(owner.name) }
    }
    const dependants = draft.id
      ? profiles.filter(
          (p) => p.id !== draft.id && p.sharedPlanWith === draft.id,
        )
      : []
    if (dependants.length) {
      return {
        error: t.sharedOwner(
          name,
          dependants.map((p) => '«' + p.name + '»').join(', '),
        ),
      }
    }
  }

  for (const [raw, label] of [
    [draft.goalProtein, t.goalProtein],
    [draft.goalFat, t.goalFat],
    [draft.goalCarbs, t.goalCarbs],
  ] as const) {
    const error = fieldError(raw, label)
    if (error) return { error }
  }

  return {
    input: {
      name,
      targetCalories: Math.round(targetCalories),
      corridor: Math.round(corridor),
      color: draft.color,
      portion: draft.portion === '' ? null : draft.portion,
      sharedPlanWith: shared || null,
      goalProtein: numberFromField(draft.goalProtein),
      goalFat: numberFromField(draft.goalFat),
      goalCarbs: numberFromField(draft.goalCarbs),
      mealIds: draft.mealIds,
      withSnack: draft.withSnack,
    },
  }
}

export type RecipeDraft = {
  steps: string
  prepTime: string
  servings: string
  photo: string | null
}

function roundedField(text: string): number | null {
  const value = numberFromField(text)
  return value === null ? null : Math.round(value)
}

export function validateRecipe(draft: RecipeDraft): Checked<RecipeInput> {
  const t = messages().forms
  const prepTimeError = fieldError(draft.prepTime, t.prepTime)
  if (prepTimeError) return { error: prepTimeError }
  const prepTime = roundedField(draft.prepTime)
  const servings = roundedField(draft.servings)
  if (draft.servings.trim() && servings === null) {
    return { error: t.servingsNumber }
  }
  if (servings !== null && servings <= 0) {
    return { error: t.servingsPositive }
  }
  return {
    input: {
      steps: linesFromText(draft.steps),
      prepTime,
      servings,
      photo: draft.photo,
    },
  }
}

export type PlanEntryDraft = {
  name: string
  type: MealType
  calories: string
  servings: string
  source: string
  ingredients: string
  portions: string
  steps: string
}

export function validatePlanEntry(
  draft: PlanEntryDraft,
): Checked<{ meal: MealInput; recipe: RecipeInput | null }> {
  const t = messages().forms
  const name = draft.name.trim()
  if (!name) return { error: t.nameRequired }
  if (draft.calories.trim() === '') return { error: t.caloriesMissing }
  const calories = numberFromField(draft.calories)
  if (calories === null) return { error: t.caloriesNumber }
  if (calories < 0) return { error: t.caloriesNonNegative }
  const servings = numberFromField(draft.servings)
  if (draft.servings.trim() !== '' && (servings === null || servings < 1)) {
    return { error: t.servingsWhole }
  }
  const steps = linesFromText(draft.steps)
  return {
    input: {
      meal: {
        name,
        type: draft.type,
        nutrition: {
          Ч: { ...NO_NUTRITION, calories: Math.round(calories) },
          Ж: { ...NO_NUTRITION },
        },
        ingredients: ingredientsFromText(draft.ingredients),
        source: draft.source.trim(),
        portions: portionsFromText(draft.portions),
        gerd: false,
        sourceIssues: [],
      },
      recipe:
        steps.length || servings !== null
          ? {
              steps,
              prepTime: null,
              servings: servings === null ? null : Math.round(servings),
              photo: null,
            }
          : null,
    },
  }
}
