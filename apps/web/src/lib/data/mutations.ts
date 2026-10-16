import {
  DEFAULTS,
  familySettingsId,
  hasRecipe,
  mealPrefId,
  planSlotId,
  planSlots,
  recipeId,
  shoppingCheckId,
  starterMealId,
  weekSources,
} from '@meridian/core'
import type {
  Ingredient,
  MealPrefValue,
  MealType,
  Nutrition,
  Portion,
  PortionLetter,
  StarterMeal,
  WeekPlan,
} from '@meridian/core'
import type { CommonPowerSyncDatabase } from '@powersync/web'
import { DEFAULT_MEAL_HOURS, sameMealHours } from '../day-clock.ts'
import type { MealHours } from '../day-clock.ts'

export type Db = CommonPowerSyncDatabase

function now(): string {
  return new Date().toISOString()
}

function newId(): string {
  return crypto.randomUUID()
}

function flag(value: boolean): number {
  return value ? 1 : 0
}

function softDelete(
  tx: Pick<Db, 'execute'>,
  table: string,
  where: string,
  params: ReadonlyArray<unknown>,
  at: string,
): Promise<unknown> {
  return tx.execute(
    `UPDATE ${table} SET deleted_at = ? WHERE ${where} AND deleted_at IS NULL`,
    [at, ...params],
  )
}

const NUTRITION_COLUMNS = [
  'calories',
  'protein',
  'fat',
  'carbs',
  'calories_w',
  'protein_w',
  'fat_w',
  'carbs_w',
] as const

const NUTRITION_SET = NUTRITION_COLUMNS.map((column) => column + ' = ?').join(
  ', ',
)

function nutritionValues(
  nutrition: Readonly<Record<PortionLetter, Nutrition>>,
): Array<number | null> {
  const { Ч: ch, Ж: w } = nutrition
  return [
    ch.calories,
    ch.protein,
    ch.fat,
    ch.carbs,
    w.calories,
    w.protein,
    w.fat,
    w.carbs,
  ]
}

export type MealInput = {
  name: string
  type: MealType
  nutrition: Record<PortionLetter, Nutrition>
  ingredients: Array<Ingredient>
  source: string
  portions: Array<Portion>
  gerd: boolean
  sourceIssues: Array<string>
}

export async function insertMeal(
  db: Db,
  familyId: string,
  input: MealInput,
): Promise<string> {
  const id = newId()
  await db.execute(
    'INSERT INTO meal (id, family_id, name, type, calories_approx, ' +
      NUTRITION_COLUMNS.join(', ') +
      ', ingredients, source, portions, gerd, source_issues)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      familyId,
      input.name,
      input.type,
      flag(false),
      ...nutritionValues(input.nutrition),
      JSON.stringify(input.ingredients),
      input.source,
      JSON.stringify(input.portions),
      flag(input.gerd),
      JSON.stringify(input.sourceIssues),
    ],
  )
  return id
}

export async function updateMeal(
  db: Db,
  id: string,
  input: MealInput,
  caloriesChanged: boolean,
): Promise<void> {
  await db.execute(
    'UPDATE meal SET name = ?, type = ?, ' +
      NUTRITION_SET +
      ', ingredients = ?, source = ?, portions = ?, gerd = ?,' +
      ' source_issues = ?' +
      (caloriesChanged ? ', calories_approx = 0' : '') +
      ' WHERE id = ?',
    [
      input.name,
      input.type,
      ...nutritionValues(input.nutrition),
      JSON.stringify(input.ingredients),
      input.source,
      JSON.stringify(input.portions),
      flag(input.gerd),
      JSON.stringify(input.sourceIssues),
      id,
    ],
  )
}

export async function deleteMeal(db: Db, id: string): Promise<void> {
  const at = now()
  await db.writeTransaction(async (tx) => {
    await softDelete(tx, 'meal', 'id = ?', [id], at)
    await softDelete(tx, 'meal_pref', 'meal_id = ?', [id], at)
    await softDelete(tx, 'recipe', 'meal_id = ?', [id], at)
  })
}

export async function clearMeals(
  db: Db,
): Promise<{ removed: number; kept: number }> {
  const at = now()
  return db.writeTransaction(async (tx) => {
    const counts = await tx.get<{ total: number; used: number }>(
      'SELECT count(*) AS total, count(*) FILTER (WHERE id IN' +
        ' (SELECT meal_id FROM plan_slot WHERE deleted_at IS NULL)) AS used' +
        ' FROM meal WHERE deleted_at IS NULL',
    )
    await softDelete(
      tx,
      'meal',
      'id NOT IN (SELECT meal_id FROM plan_slot WHERE deleted_at IS NULL)',
      [],
      at,
    )
    const batch = 'meal_id IN (SELECT id FROM meal WHERE deleted_at = ?)'
    await softDelete(tx, 'meal_pref', batch, [at], at)
    await softDelete(tx, 'recipe', batch, [at], at)
    return { removed: counts.total - counts.used, kept: counts.used }
  })
}

export async function seedStarterMeals(
  db: Db,
  familyId: string,
  meals: ReadonlyArray<StarterMeal>,
): Promise<number> {
  let added = 0
  await db.writeTransaction(async (tx) => {
    for (const meal of meals) {
      const id = starterMealId(familyId, meal.key)
      const existing = await tx.getOptional<{ deleted_at: string | null }>(
        'SELECT deleted_at FROM meal WHERE id = ?',
        [id],
      )
      if (existing && existing.deleted_at === null) continue

      const values = [
        meal.name,
        meal.type,
        flag(meal.caloriesApprox),
        ...nutritionValues(meal.nutrition),
        JSON.stringify(meal.ingredients),
        meal.source,
        JSON.stringify(meal.portions),
        flag(meal.gerd),
        JSON.stringify(meal.sourceIssues),
      ]
      if (existing) {
        await tx.execute(
          'UPDATE meal SET name = ?, type = ?, calories_approx = ?, ' +
            NUTRITION_SET +
            ', ingredients = ?, source = ?, portions = ?, gerd = ?,' +
            ' source_issues = ?, deleted_at = NULL WHERE id = ?',
          [...values, id],
        )
      } else {
        await tx.execute(
          'INSERT INTO meal (name, type, calories_approx, ' +
            NUTRITION_COLUMNS.join(', ') +
            ', ingredients, source, portions, gerd, source_issues,' +
            ' id, family_id)' +
            ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [...values, id, familyId],
        )
      }
      added++

      if (!hasRecipe(meal.recipe)) continue
      const recipe = [
        JSON.stringify(meal.recipe.steps),
        meal.recipe.prepTime,
        meal.recipe.servings,
      ]
      const own = await tx.getOptional<{ id: string }>(
        'SELECT id FROM recipe WHERE meal_id = ?',
        [id],
      )
      if (own) {
        await tx.execute(
          'UPDATE recipe SET steps = ?, prep_time = ?, servings = ?,' +
            ' deleted_at = NULL WHERE id = ?',
          [...recipe, own.id],
        )
      } else {
        await tx.execute(
          'INSERT INTO recipe (steps, prep_time, servings, id, family_id,' +
            ' meal_id) VALUES (?, ?, ?, ?, ?, ?)',
          [...recipe, recipeId(id), familyId, id],
        )
      }
    }
  })
  return added
}

export type RecipeInput = {
  steps: Array<string>
  prepTime: number | null
  servings: number | null
  photo: string | null
}

export async function saveRecipe(
  db: Db,
  familyId: string,
  mealId: string,
  input: RecipeInput,
): Promise<void> {
  const steps = JSON.stringify(input.steps)
  await db.writeTransaction(async (tx) => {
    const rows = await tx.getAll<{ id: string }>(
      'SELECT id FROM recipe WHERE meal_id = ?',
      [mealId],
    )
    if (rows.length) {
      await tx.execute(
        'UPDATE recipe SET steps = ?, prep_time = ?, servings = ?, photo = ?,' +
          ' deleted_at = NULL WHERE id = ?',
        [steps, input.prepTime, input.servings, input.photo, rows[0].id],
      )
      return
    }
    if (
      !input.steps.length &&
      input.prepTime === null &&
      input.servings === null &&
      !input.photo
    ) {
      return
    }
    await tx.execute(
      'INSERT INTO recipe (id, family_id, meal_id, steps, prep_time, servings,' +
        ' photo) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        recipeId(mealId),
        familyId,
        mealId,
        steps,
        input.prepTime,
        input.servings,
        input.photo,
      ],
    )
  })
}

export async function setMealPref(
  db: Db,
  familyId: string,
  mealId: string,
  value: MealPrefValue | null,
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    const rows = await tx.getAll<{ id: string; deleted_at: string | null }>(
      'SELECT id, deleted_at FROM meal_pref WHERE meal_id = ?',
      [mealId],
    )
    const live = rows.find((row) => row.deleted_at === null)

    if (!value) {
      if (live) {
        await softDelete(tx, 'meal_pref', 'id = ?', [live.id], now())
      }
      return
    }
    if (live) {
      await tx.execute('UPDATE meal_pref SET value = ? WHERE id = ?', [
        value,
        live.id,
      ])
      return
    }

    const id = mealPrefId(mealId)
    if (rows.some((row) => row.id === id)) {
      await tx.execute(
        'UPDATE meal_pref SET value = ?, deleted_at = NULL WHERE id = ?',
        [value, id],
      )
      return
    }
    await tx.execute(
      'INSERT INTO meal_pref (id, family_id, meal_id, value)' +
        ' VALUES (?, ?, ?, ?)',
      [id, familyId, mealId, value],
    )
  })
}

export async function saveMealHours(
  db: Db,
  familyId: string,
  hours: MealHours,
): Promise<void> {
  const custom = !sameMealHours(hours, DEFAULT_MEAL_HOURS)
  await saveFamilySettings(db, familyId, {
    breakfast_start: custom ? hours.breakfast.start : null,
    breakfast_end: custom ? hours.breakfast.end : null,
    lunch_start: custom ? hours.lunch.start : null,
    lunch_end: custom ? hours.lunch.end : null,
    dinner_start: custom ? hours.dinner.start : null,
    dinner_end: custom ? hours.dinner.end : null,
  })
}

export async function saveAntiRepeatDays(
  db: Db,
  familyId: string,
  days: number,
): Promise<void> {
  await saveFamilySettings(db, familyId, {
    anti_repeat_days: days === DEFAULTS.antiRepeatDays ? null : days,
  })
}

async function saveFamilySettings(
  db: Db,
  familyId: string,
  values: Readonly<Record<string, number | null>>,
): Promise<void> {
  const columns = Object.keys(values)
  const params = Object.values(values)
  await db.writeTransaction(async (tx) => {
    const row = await tx.getOptional<{ id: string }>(
      'SELECT id FROM family_settings WHERE family_id = ? AND deleted_at IS NULL',
      [familyId],
    )
    if (row) {
      await tx.execute(
        'UPDATE family_settings SET ' +
          columns.map((column) => column + ' = ?').join(', ') +
          ' WHERE id = ?',
        [...params, row.id],
      )
      return
    }
    if (params.every((value) => value === null)) return
    const inserted = [...columns, 'id', 'family_id']
    await tx.execute(
      'INSERT INTO family_settings (' +
        inserted.join(', ') +
        ') VALUES (' +
        inserted.map(() => '?').join(', ') +
        ')',
      [...params, familySettingsId(familyId), familyId],
    )
  })
}

export async function setShoppingCheck(
  db: Db,
  familyId: string,
  options: { itemKey: string; fingerprint: string; checked: boolean },
): Promise<void> {
  const { itemKey, fingerprint, checked } = options
  if (!itemKey.trim() || !fingerprint.trim()) return

  await db.writeTransaction(async (tx) => {
    const rows = await tx.getAll<{ id: string; deleted_at: string | null }>(
      'SELECT id, deleted_at FROM shopping_check' +
        ' WHERE family_id = ? AND item_key = ? AND fingerprint = ?',
      [familyId, itemKey, fingerprint],
    )
    const live = rows.find((row) => row.deleted_at === null)
    if (live) {
      await tx.execute('UPDATE shopping_check SET checked = ? WHERE id = ?', [
        flag(checked),
        live.id,
      ])
      return
    }

    const id = shoppingCheckId(familyId, itemKey, fingerprint)
    if (rows.some((row) => row.id === id)) {
      await tx.execute(
        'UPDATE shopping_check SET checked = ?, deleted_at = NULL WHERE id = ?',
        [flag(checked), id],
      )
      return
    }
    await tx.execute(
      'INSERT INTO shopping_check (id, family_id, item_key, fingerprint,' +
        ' checked) VALUES (?, ?, ?, ?, ?)',
      [id, familyId, itemKey, fingerprint, flag(checked)],
    )
  })
}

const STALE_CHECK_DAYS = 30

export async function clearStaleChecks(
  db: Db,
  fingerprint: string,
): Promise<void> {
  if (!fingerprint.trim()) return
  const cutoff = new Date(Date.now() - STALE_CHECK_DAYS * 24 * 60 * 60 * 1000)
  await softDelete(
    db,
    'shopping_check',
    'fingerprint <> ? AND updated_at IS NOT NULL' +
      " AND replace(substr(updated_at, 1, 19), ' ', 'T') < ?",
    [fingerprint, cutoff.toISOString().slice(0, 19)],
    now(),
  )
}

export type ProfileInput = {
  name: string
  targetCalories: number
  corridor: number
  color: string
  portion: PortionLetter | null
  sharedPlanWith: string | null
  goalProtein: number | null
  goalFat: number | null
  goalCarbs: number | null
  mealIds: Array<string> | null
}

export async function insertProfile(
  db: Db,
  familyId: string,
  input: ProfileInput,
): Promise<string> {
  const id = newId()
  await db.execute(
    'INSERT INTO profile (id, family_id, name, target_calories, corridor,' +
      ' color, shared_plan_with, portion, goal_protein, goal_fat, goal_carbs,' +
      ' meal_ids) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      familyId,
      input.name,
      input.targetCalories,
      input.corridor,
      input.color,
      input.sharedPlanWith,
      input.portion,
      input.goalProtein,
      input.goalFat,
      input.goalCarbs,
      input.mealIds === null ? null : JSON.stringify(input.mealIds),
    ],
  )
  return id
}

export async function updateProfile(
  db: Db,
  id: string,
  input: ProfileInput,
): Promise<void> {
  await db.execute(
    'UPDATE profile SET name = ?, target_calories = ?, corridor = ?, color = ?,' +
      ' shared_plan_with = ?, portion = ?, goal_protein = ?, goal_fat = ?,' +
      ' goal_carbs = ?, meal_ids = ? WHERE id = ?',
    [
      input.name,
      input.targetCalories,
      input.corridor,
      input.color,
      input.sharedPlanWith,
      input.portion,
      input.goalProtein,
      input.goalFat,
      input.goalCarbs,
      input.mealIds === null ? null : JSON.stringify(input.mealIds),
      id,
    ],
  )
}

export async function deleteProfile(db: Db, id: string): Promise<void> {
  const at = now()
  await db.writeTransaction(async (tx) => {
    await softDelete(tx, 'profile', 'id = ?', [id], at)
    await tx.execute(
      'UPDATE profile SET shared_plan_with = NULL' +
        ' WHERE shared_plan_with = ? AND deleted_at IS NULL',
      [id],
    )
    await softDelete(tx, 'plan_slot', 'profile_id = ?', [id], at)
    await softDelete(tx, 'week_plan', 'profile_id = ?', [id], at)
  })
}

export async function saveWeek(
  db: Db,
  familyId: string,
  options: { ownerId: string; startDate: string; plan: WeekPlan },
): Promise<string> {
  const { ownerId, startDate, plan } = options
  const planId = newId()
  const at = now()
  const slots = planSlots(plan.days, startDate)

  await db.writeTransaction(async (tx) => {
    const previous = await tx.getAll<{ id: string }>(
      'SELECT id FROM week_plan' +
        ' WHERE profile_id = ? AND start_date = ? AND deleted_at IS NULL',
      [ownerId, startDate],
    )

    await tx.execute(
      'INSERT INTO week_plan (id, family_id, profile_id, generated_at,' +
        ' start_date, target_calories, corridor, anti_repeat_days, days,' +
        ' used_corridor, sources, warnings)' +
        ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        planId,
        familyId,
        ownerId,
        at,
        startDate,
        plan.params.targetCalories,
        plan.params.corridor,
        plan.params.antiRepeatDays,
        plan.params.days,
        plan.usedCorridor,
        JSON.stringify(plan.sources),
        JSON.stringify(plan.warnings),
      ],
    )

    for (const slot of slots) {
      const rows = await tx.getAll<{ id: string; deleted_at: string | null }>(
        'SELECT id, deleted_at FROM plan_slot' +
          ' WHERE profile_id = ? AND date = ? AND slot = ?',
        [ownerId, slot.date, slot.slot],
      )
      const live = rows.find((row) => row.deleted_at === null)
      if (live) {
        await tx.execute(
          'UPDATE plan_slot SET week_plan_id = ?, day_index = ?, meal_id = ?,' +
            ' swapped = 0 WHERE id = ?',
          [planId, slot.dayIndex, slot.mealId, live.id],
        )
        continue
      }

      const id = planSlotId(ownerId, slot.date, slot.slot)
      if (rows.some((row) => row.id === id)) {
        await tx.execute(
          'UPDATE plan_slot SET week_plan_id = ?, day_index = ?, meal_id = ?,' +
            ' swapped = 0, deleted_at = NULL WHERE id = ?',
          [planId, slot.dayIndex, slot.mealId, id],
        )
        continue
      }
      await tx.execute(
        'INSERT INTO plan_slot (id, family_id, week_plan_id, profile_id,' +
          ' date, day_index, slot, meal_id, swapped)' +
          ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
        [
          id,
          familyId,
          planId,
          ownerId,
          slot.date,
          slot.dayIndex,
          slot.slot,
          slot.mealId,
        ],
      )
    }

    for (const row of previous) {
      await softDelete(tx, 'plan_slot', 'week_plan_id = ?', [row.id], at)
      await softDelete(tx, 'week_plan', 'id = ?', [row.id], at)
    }
  })

  return planId
}

export async function replaceSlotMeal(
  db: Db,
  options: {
    slotId: string
    mealId: string
    weekPlanId: string
    plan: WeekPlan
  },
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    await tx.execute(
      'UPDATE plan_slot SET meal_id = ?, swapped = 1 WHERE id = ?',
      [options.mealId, options.slotId],
    )
    await tx.execute('UPDATE week_plan SET sources = ? WHERE id = ?', [
      JSON.stringify(weekSources(options.plan.days)),
      options.weekPlanId,
    ])
  })
}
