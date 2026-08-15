/**
 * Запис міграції V1 → V2 у локальний SQLite (MER-48).
 *
 * Розбір дампа зробив `migrateV1` у ядрі — сюди приїжджають уже готові рядки з
 * виведеними id. Цей модуль лише кладе їх у базу пристрою; далі PowerSync
 * вивантажує чергу сам, тож імпорт працює й без мережі.
 *
 * Правила ті самі, що в `mutations.ts`: `created_at`/`updated_at` не пишемо
 * ніколи (їх ставить сервер, на цьому тримається LWW), `family_id` — у кожному
 * рядку, порожнє лишається порожнім.
 *
 * **Порядок запису — не косметика.** Черга вивантаження зберігає порядок
 * операцій, а на сервері діють зовнішні ключі: `recipe` і `meal_pref`
 * посилаються на `meal`, а профіль зі спільним планом (MER-17) — на
 * профіль-власник. Тому спершу страви, потім усе, що на них посилається, а
 * серед профілів власники йдуть перед тими, хто ділить їхній план.
 *
 * **Повторний імпорт оновлює ті самі рядки.** id виведені з id V1
 * (`derivedId`), тож другий запуск того самого файлу нічого не подвоює. Разом з
 * оновленням знімається `deleted_at`: якщо запис колись видалили, а файл із ним
 * підсунули знову — користувач попросив саме цього, і тихо проігнорувати рядок
 * було б дивно.
 */

import type {
  MigratedPref,
  MigratedProfile,
  MigratedRecipe,
  Meal,
  V1Migration,
} from '@meridian/core'
import type { Db } from './mutations'

/** Скільки рядків насправді записано — цифри для екрана. */
export type ImportStats = {
  meals: number
  recipes: number
  profiles: number
  prefs: number
}

/**
 * Транзакція PowerSync — виведена з самого `writeTransaction`, а не описана
 * руками: власний «схожий» тип розійшовся б із бібліотекою на першому ж її
 * оновленні, і розійшовся б мовчки.
 */
type Tx = Parameters<Parameters<Db['writeTransaction']>[0]>[0]

/** SQLite не має boolean — 1/0, як і в клієнтській схемі (MER-46). */
function flag(value: boolean): number {
  return value ? 1 : 0
}

/**
 * `jsonb` на пристрої лежить рядком, і саме рядком його чекає вивантаження:
 * інакше PostgREST покладе в колонку jsonb-РЯДОК замість масиву, а CHECK
 * `jsonb_typeof(...) = 'array'` відкине запис (MER-49).
 */
function json(value: unknown): string {
  return JSON.stringify(value)
}

/**
 * Вставити рядок або оновити наявний за id.
 *
 * Імена таблиці й колонок беруться ЛИШЕ з літералів цього модуля — вони не
 * приходять ні з дампа, ні від користувача, тож підстановка їх у SQL безпечна.
 * Значення, як і всюди, їдуть параметрами.
 */
async function upsert(
  tx: Tx,
  table: string,
  id: string,
  values: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(values)
  const params = columns.map((column) => values[column])
  const existing = await tx.getOptional<{ id: string }>(
    'SELECT id FROM ' + table + ' WHERE id = ?',
    [id],
  )
  if (existing) {
    await tx.execute(
      'UPDATE ' +
        table +
        ' SET ' +
        columns.map((column) => column + ' = ?').join(', ') +
        ', deleted_at = NULL WHERE id = ?',
      [...params, id],
    )
    return
  }
  await tx.execute(
    'INSERT INTO ' +
      table +
      ' (id, ' +
      columns.join(', ') +
      ') VALUES (' +
      new Array(columns.length + 1).fill('?').join(', ') +
      ')',
    [id, ...params],
  )
}

function mealValues(familyId: string, meal: Meal): Record<string, unknown> {
  return {
    family_id: familyId,
    name: meal.name,
    type: meal.type,
    calories: meal.calories,
    // MER-26: приблизність переїжджає як є — інакше оцінка почала б видавати
    // себе за цифру дієтолога.
    calories_approx: flag(meal.caloriesApprox),
    protein: meal.protein,
    fat: meal.fat,
    carbs: meal.carbs,
    ingredients: json(meal.ingredients),
    source: meal.source,
    portions: json(meal.portions),
  }
}

function recipeValues(
  familyId: string,
  recipe: MigratedRecipe,
): Record<string, unknown> {
  return {
    family_id: familyId,
    meal_id: recipe.mealId,
    steps: json(recipe.steps),
    prep_time: recipe.prepTime,
    servings: recipe.servings,
    photo: recipe.photo,
  }
}

function profileValues(
  familyId: string,
  profile: MigratedProfile,
): Record<string, unknown> {
  return {
    family_id: familyId,
    name: profile.name,
    target_calories: profile.targetCalories,
    corridor: profile.corridor,
    color: profile.color,
    shared_plan_with: profile.sharedPlanWith,
    portion: profile.portion,
    goal_protein: profile.goalProtein,
    goal_fat: profile.goalFat,
    goal_carbs: profile.goalCarbs,
    // NULL — увесь спільний пул; масив — обмежений. Порожній ≠ NULL.
    meal_ids: profile.mealIds === null ? null : json(profile.mealIds),
  }
}

function prefValues(
  familyId: string,
  pref: MigratedPref,
): Record<string, unknown> {
  return {
    family_id: familyId,
    meal_id: pref.mealId,
    value: pref.value,
  }
}

/**
 * Записати розібраний дамп у базу пристрою.
 *
 * Однією транзакцією: імпорт або застосувався, або ні. Частково перенесені дані
 * були б найгіршим результатом — профілі з посиланнями на страви, яких не
 * записали, виглядали б як зіпсована база.
 */
export async function importV1(
  db: Db,
  familyId: string,
  migration: V1Migration,
): Promise<ImportStats> {
  /* Власники спільного плану — перед тими, хто його ділить (MER-17): на сервері
   * зовнішній ключ `shared_plan_with` не пустить посилання на рядок, якого ще
   * немає. */
  const profiles = [...migration.profiles].sort(
    (a, b) =>
      Number(a.sharedPlanWith !== null) - Number(b.sharedPlanWith !== null),
  )

  await db.writeTransaction(async (tx) => {
    for (const meal of migration.meals) {
      await upsert(tx, 'meal', meal.id, mealValues(familyId, meal))
    }
    for (const recipe of migration.recipes) {
      await upsert(tx, 'recipe', recipe.id, recipeValues(familyId, recipe))
    }
    for (const profile of profiles) {
      await upsert(tx, 'profile', profile.id, profileValues(familyId, profile))
    }
    for (const pref of migration.prefs) {
      await upsert(tx, 'meal_pref', pref.id, prefValues(familyId, pref))
    }
  })

  return {
    meals: migration.meals.length,
    recipes: migration.recipes.length,
    profiles: profiles.length,
    prefs: migration.prefs.length,
  }
}
