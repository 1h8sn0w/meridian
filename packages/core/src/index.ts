export {
  DEFAULT_PORTION,
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  NO_NUTRITION,
  PORTION_LETTERS,
} from './types.ts'
export type {
  DayCalories,
  DayMeals,
  Ingredient,
  Meal,
  MealPrefValue,
  MealType,
  Nutrition,
  PlanDay,
  Portion,
  PortionLetter,
  Profile,
  Recipe,
  Result,
  TastePrefs,
  WeekParams,
  WeekPlan,
} from './types.ts'

export {
  dayCalories,
  dayInCorridor,
  formatCalories,
  formatDayCalories,
  formatMacro,
  formatMealCalories,
  formatPortionCalories,
  hasMacros,
  hasValue,
  numberFromField,
} from './provenance.ts'

export { weekSources } from './plans.ts'

export {
  mealForPortion,
  mealsForPortion,
  planOwnerId,
  poolForProfile,
  portionOf,
} from './profile.ts'

export {
  DEFAULTS,
  generateWeek,
  poolShortageFor,
  poolShortageMessage,
} from './generator.ts'
export type { PoolShortage } from './generator.ts'

export { replaceSlot, suggestReplacements } from './replace.ts'

export {
  addDays,
  dateKey,
  dateKeyParts,
  planSlots,
  precedingMealIds,
  precedingWindow,
  startOfWeek,
} from './calendar.ts'
export type { CalendarSlot } from './calendar.ts'

export { SHOPPING_CATEGORIES, aggregate, planFingerprint } from './shopping.ts'
export type { ShoppingItem } from './shopping.ts'

export {
  mealFromRow,
  prefsFromRows,
  profileFromRow,
  recipeFromRow,
} from './rows.ts'
export type { Row } from './rows.ts'

export {
  familySettingsId,
  mealPrefId,
  planSlotId,
  recipeId,
  shoppingCheckId,
  starterMealId,
} from './sync-ids.ts'

export { hasRecipe, parseStarterSet } from './starter-set.ts'
export type { StarterMeal, StarterRecipe, StarterSet } from './starter-set.ts'

export { parsePlanText, planEntryKey } from './parse-plan.ts'
export type { PlanEntry, PlanParse } from './parse-plan.ts'

export { migrateV1 } from './migrate-v1.ts'
export type {
  MigratedPref,
  MigratedProfile,
  MigratedRecipe,
  V1Migration,
} from './migrate-v1.ts'
