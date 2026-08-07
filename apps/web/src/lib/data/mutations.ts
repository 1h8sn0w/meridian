/**
 * Записи в локальний SQLite (MER-49).
 *
 * Пишемо на пристрій — і все. Далі PowerSync сам вивантажує чергу через
 * PostgREST (MER-46), тож жодна дія інтерфейсу не чекає мережі й однаково
 * працює офлайн.
 *
 * Тверді правила цього модуля:
 *
 *  - **`created_at` / `updated_at` не пишемо ніколи.** Їх ставить сервер, і саме
 *    тому порядок LWW не залежить від годинника телефона (`connector.ts`).
 *  - **Видалення — це `deleted_at`.** Фізичного DELETE у схемі немає ні в кого,
 *    бо sync-рушій не вміє довозити те, чого в базі вже нема (MER-44).
 *  - **`family_id` у кожному рядку.** На пристрої сім'я одна, але саме це
 *    значення їде назад у PostgREST, і без нього рядок не пройде RLS.
 *  - **Порожнє лишається порожнім.** Ніде немає `?? 0` і `?? ''`: NULL у базі
 *    означає «в джерелі немає», і підміняти його нулем не можна.
 */

import { planSlots, weekSources } from '@meridian/core'
import type {
  Ingredient,
  MealPrefValue,
  MealType,
  Portion,
  PortionLetter,
  WeekPlan,
} from '@meridian/core'
import type { CommonPowerSyncDatabase } from '@powersync/web'

export type Db = CommonPowerSyncDatabase

/** Момент м'якого видалення — той самий формат, що й у решті колонок часу. */
function now(): string {
  return new Date().toISOString()
}

function newId(): string {
  return crypto.randomUUID()
}

/** SQLite не має boolean — 1/0, як і в клієнтській схемі (MER-46). */
function flag(value: boolean): number {
  return value ? 1 : 0
}

/* ==========================================================================
 * Страви
 * ======================================================================== */

export type MealInput = {
  name: string
  type: MealType
  calories: number | null
  protein: number | null
  fat: number | null
  carbs: number | null
  ingredients: Array<Ingredient>
  source: string
  portions: Array<Portion>
}

export async function insertMeal(
  db: Db,
  familyId: string,
  input: MealInput,
): Promise<string> {
  const id = newId()
  await db.execute(
    'INSERT INTO meal (id, family_id, name, type, calories, calories_approx,' +
      ' protein, fat, carbs, ingredients, source, portions)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      id,
      familyId,
      input.name,
      input.type,
      input.calories,
      // Ручний ввід — це цифра з джерела користувача, а не оцінка. Виняток «≈»
      // санкціоновано лише для демо-пулу (AGENTS.md), тож новій страві прапорець
      // не піднімаємо й чекбокса на нього в формі немає.
      flag(false),
      input.protein,
      input.fat,
      input.carbs,
      JSON.stringify(input.ingredients),
      input.source,
      JSON.stringify(input.portions),
    ],
  )
  return id
}

/**
 * Оновити страву.
 *
 * `calories_approx` знімається РІВНО тоді, коли користувач змінив саме цифру
 * калорійності: тепер це його значення, а не оцінка з демо-пулу. Правка назви
 * чи інгредієнтів позначку не чіпає — інакше страва тихо почала б видавати
 * приблизну цифру за точну, а це те, від чого MER-26 і захищає.
 */
export async function updateMeal(
  db: Db,
  id: string,
  input: MealInput,
  caloriesChanged: boolean,
): Promise<void> {
  await db.execute(
    'UPDATE meal SET name = ?, type = ?, calories = ?, protein = ?, fat = ?,' +
      ' carbs = ?, ingredients = ?, source = ?, portions = ?' +
      (caloriesChanged ? ', calories_approx = 0' : '') +
      ' WHERE id = ?',
    [
      input.name,
      input.type,
      input.calories,
      input.protein,
      input.fat,
      input.carbs,
      JSON.stringify(input.ingredients),
      input.source,
      JSON.stringify(input.portions),
      id,
    ],
  )
}

/** М'яке видалення страви. Смак страви йде разом із нею. */
export async function deleteMeal(db: Db, id: string): Promise<void> {
  const at = now()
  await db.writeTransaction(async (tx) => {
    await tx.execute('UPDATE meal SET deleted_at = ? WHERE id = ?', [at, id])
    await tx.execute(
      'UPDATE meal_pref SET deleted_at = ?' +
        ' WHERE meal_id = ? AND deleted_at IS NULL',
      [at, id],
    )
  })
}

/* ==========================================================================
 * Смаки (MER-18)
 * ======================================================================== */

/**
 * Поставити або зняти позначку смаку. `null` — зняти.
 *
 * Живий рядок на страву рівно один (частковий унікальний індекс у схемі), тож
 * зміна — це UPDATE наявного, а не другий рядок: інакше два пристрої, які
 * позначили ту саму страву, зіткнулися б на індексі.
 */
export async function setMealPref(
  db: Db,
  familyId: string,
  mealId: string,
  value: MealPrefValue | null,
): Promise<void> {
  const existing = await db.getOptional<{ id: string }>(
    'SELECT id FROM meal_pref WHERE meal_id = ? AND deleted_at IS NULL',
    [mealId],
  )
  if (!value) {
    if (existing) {
      await db.execute('UPDATE meal_pref SET deleted_at = ? WHERE id = ?', [
        now(),
        existing.id,
      ])
    }
    return
  }
  if (existing) {
    await db.execute('UPDATE meal_pref SET value = ? WHERE id = ?', [
      value,
      existing.id,
    ])
    return
  }
  await db.execute(
    'INSERT INTO meal_pref (id, family_id, meal_id, value) VALUES (?, ?, ?, ?)',
    [newId(), familyId, mealId, value],
  )
}

/* ==========================================================================
 * Профілі (MER-21, MER-17)
 * ======================================================================== */

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
  /** null — увесь спільний пул; масив — обмежений (порожній ≠ null). */
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

/**
 * Видалити профіль разом із його планами — як `ProfileStore.remove` у V1.
 *
 * Хто ділив із ним план (MER-17), переходить на власний: інакше пов'язаний
 * профіль читав би тиждень, якого вже нема, і екран був би порожнім без пояснень.
 */
export async function deleteProfile(db: Db, id: string): Promise<void> {
  const at = now()
  await db.writeTransaction(async (tx) => {
    await tx.execute('UPDATE profile SET deleted_at = ? WHERE id = ?', [at, id])
    await tx.execute(
      'UPDATE profile SET shared_plan_with = NULL' +
        ' WHERE shared_plan_with = ? AND deleted_at IS NULL',
      [id],
    )
    await tx.execute(
      'UPDATE plan_slot SET deleted_at = ?' +
        ' WHERE profile_id = ? AND deleted_at IS NULL',
      [at, id],
    )
    await tx.execute(
      'UPDATE week_plan SET deleted_at = ?' +
        ' WHERE profile_id = ? AND deleted_at IS NULL',
      [at, id],
    )
  })
}

/* ==========================================================================
 * Тиждень
 * ======================================================================== */

/**
 * Зберегти згенерований тиждень.
 *
 * Ключове місце всієї задачі — **слоти не створюються повторно, а
 * переписуються.** Частковий унікальний індекс `plan_slot (profile_id, date,
 * slot)` не пустить другу вставку того самого слота, і два тижні, згенеровані
 * на різних пристроях офлайн, LWW не розсудив би: це не конкурентна зміна
 * рядка, а дві незалежні спроби його створити (відкрите питання з MER-46).
 * Тому перегенерація — це UPDATE наявного рядка дня: слот лишається тим самим
 * рядком, і LWW працює рівно так, як обіцяно — на рівні слота.
 *
 * Попередній план тих самих дат м'яко видаляється разом зі слотами, які новий
 * план не перекрив (коротший тиждень). Минулі дні при цьому не чіпаються: план
 * починається сьогоднішньою датою, а історія лежить у рядках попередніх планів
 * (MER-33).
 */
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
      const existing = await tx.getOptional<{ id: string }>(
        'SELECT id FROM plan_slot WHERE profile_id = ? AND date = ?' +
          ' AND slot = ? AND deleted_at IS NULL',
        [ownerId, slot.date, slot.slot],
      )
      if (existing) {
        await tx.execute(
          'UPDATE plan_slot SET week_plan_id = ?, day_index = ?, meal_id = ?' +
            ' WHERE id = ?',
          [planId, slot.dayIndex, slot.mealId, existing.id],
        )
      } else {
        await tx.execute(
          'INSERT INTO plan_slot (id, family_id, week_plan_id, profile_id,' +
            ' date, day_index, slot, meal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            newId(),
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
    }

    for (const row of previous) {
      // Слоти, які новий план перекрив, уже вказують на нього — під цей UPDATE
      // потрапляють лише «хвости» коротшого тижня.
      await tx.execute(
        'UPDATE plan_slot SET deleted_at = ?' +
          ' WHERE week_plan_id = ? AND deleted_at IS NULL',
        [at, row.id],
      )
      await tx.execute('UPDATE week_plan SET deleted_at = ? WHERE id = ?', [
        at,
        row.id,
      ])
    }
  })

  return planId
}

/**
 * Ручна заміна страви в слоті (MER-12).
 *
 * Один UPDATE одного рядка — це і є одиниця LWW, обіцяна в MER-46: двоє
 * замінили вечерю вівторка, перемагає остання зміна цього рядка.
 *
 * `plan` — план УЖЕ ІЗ заміною (результат `replaceSlot` із ядра): перелік джерел
 * перераховується з нього чесно, бо разом зі стравою міг змінитись і він.
 */
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
    await tx.execute('UPDATE plan_slot SET meal_id = ? WHERE id = ?', [
      options.mealId,
      options.slotId,
    ])
    await tx.execute('UPDATE week_plan SET sources = ? WHERE id = ?', [
      JSON.stringify(weekSources(options.plan.days)),
      options.weekPlanId,
    ])
  })
}
