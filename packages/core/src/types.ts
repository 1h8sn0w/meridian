export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_TYPES: ReadonlyArray<MealType> = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
]

export type Ingredient =
  string | { name: string; amount?: number; unit?: string }

export type Portion = { component: string | null; text: string }

export type PortionLetter = 'Ж' | 'Ч'

export const PORTION_LETTERS: ReadonlyArray<PortionLetter> = ['Ч', 'Ж']

export const DEFAULT_PORTION: PortionLetter = 'Ч'

export type Nutrition = {
  calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
}

export const NO_NUTRITION: Readonly<Nutrition> = {
  calories: null,
  protein: null,
  fat: null,
  carbs: null,
}

export type MealPrefValue = 'favorite' | 'disliked'

export type Meal = {
  id: string
  name: string
  type: MealType
  calories: number | null
  caloriesApprox: boolean
  protein: number | null
  fat: number | null
  carbs: number | null
  nutrition: Record<PortionLetter, Nutrition>
  ingredients: Array<Ingredient>
  source: string
  portions: Array<Portion>
  gerd: boolean
  sourceIssues: Array<string>
}

export type Recipe = {
  id: string
  mealId: string
  steps: Array<string>
  prepTime: number | null
  servings: number | null
  photo: string | null
}

export type PlannedMeal = Meal & { calories: number }

export type Profile = {
  id: string
  name: string
  targetCalories: number
  corridor: number
  portion: PortionLetter | null
  mealIds: Array<string> | null
  sharedPlanWith: string | null
  goalProtein: number | null
  goalFat: number | null
  goalCarbs: number | null
  withSnack: boolean
}

export type TastePrefs = {
  favorites: ReadonlySet<string>
  disliked: ReadonlySet<string>
}

export const NO_PREFS: TastePrefs = {
  favorites: new Set<string>(),
  disliked: new Set<string>(),
}

export type DayCalories = {
  total: number
  unknown: number
  approx: boolean
}

export type DayMeals<TMeal extends Meal = Meal> = Partial<
  Record<MealType, TMeal>
>

export type PlanDay = {
  meals: DayMeals
  calories: DayCalories
}

export type WeekParams = {
  targetCalories: number
  corridor: number
  antiRepeatDays: number
  days: number
}

export type WeekPlan = {
  days: Array<PlanDay>
  params: WeekParams
  usedCorridor: number
  sources: Array<string>
  mixed: boolean
  mixPossible: boolean
  warnings: Array<WeekWarning>
}

export type WeekWarning =
  | { code: 'caloriesUnknown'; portion: PortionLetter; count: number }
  | { code: 'corridorWidened'; corridor: number; used: number }
  | { code: 'mixBlockedByDislikes' }
  | { code: 'mixImpossible' }
  | { code: 'mixFailed' }
  | { code: 'mixFailedCorridorWidened'; used: number }
  | { code: 'dislikedKept' }

type Err<TError> = { ok: false; error: TError }
export type Result<T, TError = string> = ({ ok: true } & T) | Err<TError>
