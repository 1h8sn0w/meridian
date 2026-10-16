import {
  MEAL_TYPES,
  NO_NUTRITION,
  PORTION_LETTERS,
  numberFromField,
} from '@meridian/core'
import type { Meal, MealType, Nutrition, PortionLetter } from '@meridian/core'
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
  if (raw.trim() && value === null) {
    return 'Поле «' + label + '» має бути числом або лишитись порожнім.'
  }
  if (value !== null && value < 0) {
    return 'Поле «' + label + "» має бути невід'ємним."
  }
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

const NUTRITION_LABELS: Readonly<Record<keyof Nutrition, string>> = {
  calories: 'Калорійність',
  protein: 'Білки',
  fat: 'Жири',
  carbs: 'Вуглеводи',
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
  const name = draft.name.trim()
  if (!name) return { error: "Назва страви обов'язкова." }
  if (!MEAL_TYPES.includes(draft.type)) {
    return { error: 'Оберіть тип слота.' }
  }
  for (const letter of PORTION_LETTERS) {
    for (const [field, label] of Object.entries(NUTRITION_LABELS)) {
      const error = fieldError(
        draft.nutrition[letter][field as keyof Nutrition],
        label + ' · порція ' + letter,
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
}

export function validateProfile(
  draft: ProfileDraft,
  profiles: ReadonlyArray<AppProfile>,
): Checked<ProfileInput> {
  const name = draft.name.trim()
  if (!name) return { error: "Ім'я профілю обов'язкове." }

  const targetCalories = numberFromField(draft.targetCalories)
  if (targetCalories === null || targetCalories <= 0) {
    return { error: 'Цільова калорійність дня має бути додатним числом.' }
  }

  const corridor = numberFromField(draft.corridor)
  if (corridor === null || corridor < 0) {
    return { error: "Коридор калорійності має бути невід'ємним числом." }
  }

  const shared = draft.sharedPlanWith.trim()
  if (shared) {
    if (shared === draft.id) {
      return { error: 'Профіль не може ділити план сам із собою.' }
    }
    const owner = profiles.find((p) => p.id === shared)
    if (!owner) return { error: 'Профіль для спільного плану не знайдено.' }
    if (owner.sharedPlanWith) {
      return {
        error:
          'Профіль «' +
          owner.name +
          '» сам користується спільним планом — оберіть профіль-власник.',
      }
    }
    const dependants = draft.id
      ? profiles.filter(
          (p) => p.id !== draft.id && p.sharedPlanWith === draft.id,
        )
      : []
    if (dependants.length) {
      return {
        error:
          'Профіль «' +
          name +
          '» уже є власником спільного плану для: ' +
          dependants.map((p) => '«' + p.name + '»').join(', ') +
          ". Спершу від'єднайте їх.",
      }
    }
  }

  for (const [raw, label] of [
    [draft.goalProtein, 'Ціль: білки'],
    [draft.goalFat, 'Ціль: жири'],
    [draft.goalCarbs, 'Ціль: вуглеводи'],
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
  const prepTimeError = fieldError(draft.prepTime, 'Час приготування')
  if (prepTimeError) return { error: prepTimeError }
  const prepTime = roundedField(draft.prepTime)
  const servings = roundedField(draft.servings)
  if (draft.servings.trim() && servings === null) {
    return { error: '«Порції» мають бути числом або лишитись порожніми.' }
  }
  if (servings !== null && servings <= 0) {
    return { error: '«Порції» мають бути додатним числом.' }
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
  const name = draft.name.trim()
  if (!name) return { error: "Назва страви обов'язкова." }
  if (draft.calories.trim() === '') {
    return {
      error:
        'Впишіть калорійність — у PDF її немає, а без неї страва не потрапить у пул.',
    }
  }
  const calories = numberFromField(draft.calories)
  if (calories === null) {
    return {
      error: 'Калорійність має бути числом — приберіть із поля все, крім цифр.',
    }
  }
  if (calories < 0)
    return { error: "Калорійність має бути невід'ємним числом." }
  const servings = numberFromField(draft.servings)
  if (draft.servings.trim() !== '' && (servings === null || servings < 1)) {
    return { error: 'Порції — ціле число від 1 або порожньо.' }
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
