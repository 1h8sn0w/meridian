/**
 * Міст між рядком локального SQLite і доменною моделлю (MER-47).
 *
 * PowerSync кладе на пристрій ті самі колонки, що в Postgres, але типів SQLite
 * має рівно три: TEXT, INTEGER, REAL. Тому на клієнті:
 *  - `boolean` приїздить як `1`/`0` (а з Postgres напряму — як `true`/`false`);
 *  - `jsonb` приїздить як TEXT із JSON усередині;
 *  - NULL лишається NULL — і саме він означає «в джерелі немає».
 *
 * Це єдиний модуль ядра, який знає про форму рядка. Далі по коду ходять уже
 * доменні об'єкти, і жодна функція не гадає, чи `0` — це «нуль» чи «false».
 *
 * Розбір суворий: зіпсований рядок — це помилка з українським поясненням, а не
 * тихе значення за замовчуванням. Підставити «правдоподібне» замість
 * нерозібраного означало б вигадати дані.
 */

import { optionalNumber } from './provenance.ts'
import { MEAL_TYPES } from './types.ts'
import type {
  Ingredient,
  Meal,
  MealPrefValue,
  MealType,
  Portion,
  PortionLetter,
  Profile,
  Recipe,
  TastePrefs,
} from './types.ts'

/** Рядок як його віддає драйвер: значення трьох типів SQLite або NULL. */
export type Row = Record<string, unknown>

function text(row: Row, column: string): string {
  const value = row[column]
  return value === null || value === undefined ? '' : String(value)
}

function requiredText(row: Row, column: string, what: string): string {
  const value = text(row, column).trim()
  if (!value) throw new Error(what + ': порожнє поле «' + column + '».')
  return value
}

/** SQLite не має boolean: 1/0, але з Postgres напряму приходить true/false. */
function bool(row: Row, column: string): boolean {
  const value = row[column]
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value === '1' || value === 'true'
  return false
}

/** `jsonb` як TEXT (SQLite) або вже розібраний масив (Postgres-драйвер). */
function jsonArray(row: Row, column: string, what: string): Array<unknown> {
  const value = row[column]
  if (value === null || value === undefined || value === '') return []
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') {
    throw new Error(what + ': поле «' + column + '» не масив.')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch (cause) {
    throw new Error(
      what + ': поле «' + column + '» — некоректний JSON: ' + String(cause),
      { cause },
    )
  }
  if (parsed === null) return []
  if (!Array.isArray(parsed)) {
    throw new Error(what + ': поле «' + column + '» не масив.')
  }
  return parsed
}

function mealType(value: string, what: string): MealType {
  if (!MEAL_TYPES.includes(value as MealType)) {
    throw new Error(what + ': невідомий тип слота «' + value + '».')
  }
  return value as MealType
}

function ingredient(entry: unknown): Ingredient | null {
  if (typeof entry === 'string') {
    const name = entry.trim()
    return name ? name : null
  }
  if (entry && typeof entry === 'object') {
    const raw = entry as Record<string, unknown>
    const name = String(raw.name ?? '').trim()
    if (!name) return null
    const amount = optionalNumber(raw.amount)
    const unit = String(raw.unit ?? '').trim()
    /* Кількість і одиницю кладемо ЛИШЕ якщо вони є в джерелі — саме тому поля
     * необов'язкові, а не «0» і «шт». */
    const out: Ingredient = { name }
    if (amount !== null) out.amount = amount
    if (unit) out.unit = unit
    return out
  }
  return null
}

function portion(entry: unknown): Portion | null {
  if (typeof entry === 'string' || typeof entry === 'number') {
    const value = String(entry).trim()
    return value ? { component: null, text: value } : null
  }
  if (entry && typeof entry === 'object') {
    const raw = entry as Record<string, unknown>
    const value = String(raw.text ?? '').trim()
    if (!value) return null
    const component = String(raw.component ?? '').trim()
    return { component: component || null, text: value }
  }
  return null
}

/** Рядок таблиці `meal` → страва. */
export function mealFromRow(row: Row): Meal {
  const what = 'Страва «' + text(row, 'id') + '»'
  return {
    id: requiredText(row, 'id', 'Страва'),
    name: requiredText(row, 'name', what),
    type: mealType(requiredText(row, 'type', what), what),
    calories: optionalNumber(row.calories),
    caloriesApprox: bool(row, 'calories_approx'),
    protein: optionalNumber(row.protein),
    fat: optionalNumber(row.fat),
    carbs: optionalNumber(row.carbs),
    ingredients: jsonArray(row, 'ingredients', what)
      .map(ingredient)
      .filter((x): x is Ingredient => x !== null),
    // Порожній рядок — плану не вказано. Не «немає джерела» в сенсі провенансу.
    source: text(row, 'source').trim(),
    portions: jsonArray(row, 'portions', what)
      .map(portion)
      .filter((x): x is Portion => x !== null),
  }
}

/**
 * Рядок таблиці `recipe` → рецептна частина страви (MER-63).
 *
 * Кроки чистяться так само, як під час міграції з V1 (`migrateRecipe`): порожні
 * рядки — це артефакт вводу через `textarea`, а не крок приготування. Час і
 * порції — `optionalNumber`, тож NULL лишається порожнечею, а не нулем.
 */
export function recipeFromRow(row: Row): Recipe {
  const what = 'Рецепт «' + text(row, 'id') + '»'
  return {
    id: requiredText(row, 'id', 'Рецепт'),
    mealId: requiredText(row, 'meal_id', what),
    steps: jsonArray(row, 'steps', what)
      .map((step) => String(step).trim())
      .filter((step) => step.length > 0),
    prepTime: optionalNumber(row.prep_time),
    servings: optionalNumber(row.servings),
    photo: text(row, 'photo').trim() || null,
  }
}

/** Рядок таблиці `profile` → профіль. */
export function profileFromRow(row: Row): Profile {
  const what = 'Профіль «' + text(row, 'id') + '»'
  const letter = text(row, 'portion').trim()
  if (letter && letter !== 'Ж' && letter !== 'Ч') {
    throw new Error(what + ': невідома порційна літера «' + letter + '».')
  }
  const target = optionalNumber(row.target_calories)
  if (target === null || target <= 0) {
    throw new Error(what + ': цільова калорійність має бути додатною.')
  }
  const rawMealIds = row.meal_ids
  return {
    id: requiredText(row, 'id', 'Профіль'),
    name: requiredText(row, 'name', what),
    targetCalories: target,
    corridor: optionalNumber(row.corridor) ?? 0,
    portion: letter ? (letter as PortionLetter) : null,
    // NULL — увесь пул; масив — обмежений. Порожній масив лишається порожнім.
    mealIds:
      rawMealIds === null || rawMealIds === undefined || rawMealIds === ''
        ? null
        : jsonArray(row, 'meal_ids', what).map(String),
    sharedPlanWith: text(row, 'shared_plan_with').trim() || null,
    goalProtein: optionalNumber(row.goal_protein),
    goalFat: optionalNumber(row.goal_fat),
    goalCarbs: optionalNumber(row.goal_carbs),
  }
}

/**
 * Рядки таблиці `meal_pref` → смаки сім'ї (MER-18). М'яко видалені рядки
 * викликач відсіює запитом (`deleted_at IS NULL`), як і всюди в V2.
 */
export function prefsFromRows(rows: ReadonlyArray<Row>): TastePrefs {
  const favorites = new Set<string>()
  const disliked = new Set<string>()
  for (const row of rows) {
    const mealId = text(row, 'meal_id').trim()
    if (!mealId) continue
    // Невідоме значення відкидаємо, як і V1 під час читання сховища.
    const value: string = text(row, 'value').trim()
    if (value === ('favorite' satisfies MealPrefValue)) favorites.add(mealId)
    else if (value === ('disliked' satisfies MealPrefValue))
      disliked.add(mealId)
  }
  return { favorites, disliked }
}
