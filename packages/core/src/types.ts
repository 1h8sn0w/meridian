export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_TYPES: ReadonlyArray<MealType> = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
]

export const MEAL_TYPE_LABELS: Readonly<Record<MealType, string>> = {
  breakfast: 'Сніданок',
  lunch: 'Обід',
  dinner: 'Вечеря',
  snack: 'Перекус',
}

export type Ingredient =
  string | { name: string; amount?: number; unit?: string }

export type Portion = { component: string | null; text: string }

export type PortionLetter = 'Ж' | 'Ч'

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

export type PlanDay = {
  meals: Record<MealType, Meal>
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
  warnings: Array<string>
}

type Err = { ok: false; error: string }
export type Result<T> = ({ ok: true } & T) | Err
