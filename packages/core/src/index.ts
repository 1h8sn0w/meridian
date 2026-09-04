// @meridian/core — доменна логіка Meridian чистим TypeScript:
// генератор тижня, розрахунок калорій, правила провенансу (MER-47).
//
// Без залежностей від фреймворків і від БД — щоб той самий код викликався
// з веба, з Capacitor і з майбутнього нативу. Єдиний модуль, що знає про форму
// рядка локального SQLite, — `rows.ts`, і він лише мапить рядок у доменний
// об'єкт; далі по коду ходять уже об'єкти.

export { MEAL_TYPES, MEAL_TYPE_LABELS, NO_PREFS } from './types.ts'
export type {
  DayCalories,
  Err,
  Ingredient,
  Meal,
  MealPrefValue,
  MealType,
  PlanDay,
  PlannedMeal,
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
  formatCalories,
  formatDayCalories,
  formatMacro,
  formatMealCalories,
  hasMacros,
  hasValue,
  optionalNumber,
} from './provenance.ts'

export {
  allWeekMeals,
  isMixedWeek,
  mealPlans,
  mixPossibleIn,
  plansCovering,
  poolPlans,
  weekSources,
} from './plans.ts'

export { planOwnerId, poolForProfile } from './profile.ts'

export { DEFAULTS, generateWeek } from './generator.ts'
export type { GenerateOptions, GenerateResult, Random } from './generator.ts'

export { replaceSlot, suggestReplacements } from './replace.ts'
export type { Replacements, ReplacementCandidate } from './replace.ts'

export {
  addDays,
  dateKey,
  planSlots,
  precedingMealIds,
  precedingWindow,
  startOfWeek,
} from './calendar.ts'
export type { CalendarSlot } from './calendar.ts'

export {
  SHOPPING_CATEGORIES,
  aggregate,
  categoryOf,
  nameKey,
  planFingerprint,
} from './shopping.ts'
export type {
  PlannedSlot,
  ShoppingCategory,
  ShoppingItem,
  ShoppingItems,
} from './shopping.ts'

export {
  mealFromRow,
  prefsFromRows,
  profileFromRow,
  recipeFromRow,
} from './rows.ts'
export type { Row } from './rows.ts'

export {
  MERIDIAN_NAMESPACE,
  derivedId,
  mealPrefId,
  planSlotId,
  recipeId,
  shoppingCheckId,
} from './sync-ids.ts'
export type { IdKind } from './sync-ids.ts'

export { parsePlanText, planEntryKey } from './parse-plan.ts'
export type {
  PlanEntry,
  PlanEntryKind,
  PlanFlag,
  PlanParse,
  PlanStats,
} from './parse-plan.ts'

export { MEALS_KEY, PREFS_KEY, PROFILES_KEY, migrateV1 } from './migrate-v1.ts'
export type {
  MigratedPref,
  MigratedProfile,
  MigratedRecipe,
  Skipped,
  V1Migration,
} from './migrate-v1.ts'
