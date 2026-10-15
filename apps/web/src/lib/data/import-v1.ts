import type {
  MigratedPref,
  MigratedProfile,
  MigratedRecipe,
  Meal,
  V1Migration,
} from '@meridian/core'
import type { Db } from './mutations'

export type ImportStats = {
  meals: number
  recipes: number
  profiles: number
  prefs: number
}

type Tx = Parameters<Parameters<Db['writeTransaction']>[0]>[0]

function flag(value: boolean): number {
  return value ? 1 : 0
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

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
    calories_approx: flag(meal.caloriesApprox),
    protein: meal.protein,
    fat: meal.fat,
    carbs: meal.carbs,
    ingredients: json(meal.ingredients),
    source: meal.source,
    portions: json(meal.portions),
    gerd: flag(meal.gerd),
    source_issues: json(meal.sourceIssues),
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

export function inWriteOrder(
  profiles: ReadonlyArray<MigratedProfile>,
): Array<MigratedProfile> {
  const pending = new Map(profiles.map((profile) => [profile.id, profile]))
  const ordered: Array<MigratedProfile> = []

  let progress = true
  while (pending.size && progress) {
    progress = false
    for (const [id, profile] of pending) {
      const owner = profile.sharedPlanWith
      if (owner !== null && pending.has(owner)) continue
      ordered.push(profile)
      pending.delete(id)
      progress = true
    }
  }
  return [...ordered, ...pending.values()]
}

export async function importV1(
  db: Db,
  familyId: string,
  migration: V1Migration,
): Promise<ImportStats> {
  const profiles = inWriteOrder(migration.profiles)

  await db.writeTransaction(async (tx) => {
    for (const meal of migration.meals) {
      await upsert(tx, 'meal', meal.id, mealValues(familyId, meal))
    }
    for (const recipe of migration.recipes) {
      const existing = await tx.getOptional<{ id: string }>(
        'SELECT id FROM recipe WHERE meal_id = ?',
        [recipe.mealId],
      )
      await upsert(
        tx,
        'recipe',
        existing ? existing.id : recipe.id,
        recipeValues(familyId, recipe),
      )
    }
    for (const profile of profiles) {
      await upsert(tx, 'profile', profile.id, profileValues(familyId, profile))
    }
    for (const pref of migration.prefs) {
      const live = await tx.getOptional<{ id: string }>(
        'SELECT id FROM meal_pref WHERE meal_id = ? AND deleted_at IS NULL',
        [pref.mealId],
      )
      await upsert(
        tx,
        'meal_pref',
        live ? live.id : pref.id,
        prefValues(familyId, pref),
      )
    }
  })

  return {
    meals: migration.meals.length,
    recipes: migration.recipes.length,
    profiles: profiles.length,
    prefs: migration.prefs.length,
  }
}
