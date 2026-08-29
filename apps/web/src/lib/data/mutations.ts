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

import {
  mealPrefId,
  planSlotId,
  planSlots,
  shoppingCheckId,
  weekSources,
} from '@meridian/core'
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
 * Живий рядок на страву рівно один (частковий унікальний індекс
 * `meal_pref_meal_id_key`), тож зміна — це UPDATE наявного. Але LWW розсуджує
 * лише зміни наявного рядка: дві незалежні спроби СТВОРИТИ його — двоє
 * позначили ту саму страву офлайн — сервер розсудити не може, і другу вставку
 * відкидає на індексі, а конектор через це втрачає зміну (MER-57).
 *
 * Тому новий рядок створюється з **виведеним** id (`mealPrefId`): обидва
 * пристрої рахують той самий, вивантаження стає upsert одного рядка — і далі
 * працює звичайний LWW.
 *
 * **Наявний рядок шукається за стравою, а не за виведеним id.** Смаки писалися
 * ще до цієї зміни, тож у базі лежать рядки з випадковими id; шукати за
 * виведеним означало б їх не побачити, вставити другий — і відтворити ту саму
 * колізію рівно на вже позначених стравах.
 */
export async function setMealPref(
  db: Db,
  familyId: string,
  mealId: string,
  value: MealPrefValue | null,
): Promise<void> {
  await db.writeTransaction(async (tx) => {
    /* Беремо ВСІ рядки страви, живі й м'яко видалені, одним запитом: живий на
     * страву рівно один, а видалені потрібні нижче — рядок із виведеним id
     * оживає, а не вставляється наново. */
    const rows = await tx.getAll<{ id: string; deleted_at: string | null }>(
      'SELECT id, deleted_at FROM meal_pref WHERE meal_id = ?',
      [mealId],
    )
    const live = rows.find((row) => row.deleted_at === null)

    if (!value) {
      if (live) {
        await tx.execute('UPDATE meal_pref SET deleted_at = ? WHERE id = ?', [
          now(),
          live.id,
        ])
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

    /* Живого рядка немає — але міг лишитись м'яко видалений із тим самим
     * виведеним id: знята й поставлена наново позначка це той самий рядок,
     * який оживає. Саме тому вибірка вище й не фільтрує `deleted_at` —
     * інакше вставка зіткнулася б із ним по первинному ключу. */
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

/* ==========================================================================
 * Список покупок (MER-62)
 * ======================================================================== */

/**
 * Поставити або зняти позначку «куплено».
 *
 * Це ТА САМА історія, що й `setMealPref`, і саме заради неї MER-57 узагалі
 * робився: двоє в магазині відмічають ту саму позицію. Живий рядок на позицію
 * рівно один (частковий унікальний індекс `shopping_check_item_key_key` на
 * `(family_id, item_key, fingerprint)`), тож дві незалежні вставки сервер
 * розсудити не може — другу він відкидає на індексі, а конектор через це
 * мовчки втрачає дію. Тому новий рядок створюється з **виведеним** id
 * (`shoppingCheckId`): обидва пристрої рахують той самий, вивантаження стає
 * upsert одного рядка — і далі працює звичайний LWW.
 *
 * **Наявний рядок шукається за природним ключем, без фільтра `deleted_at`.**
 * Позначку могли зняти прибиранням застарілих відбитків (`clearStaleChecks`) і
 * поставити знову — це той самий рядок, який оживає, а не другий поруч: вставка
 * зіткнулася б із ним по первинному ключу.
 *
 * **Зняття — це `checked = 0`, а не м'яке видалення** (рішення MER-55, на
 * відміну від V1, який просто прибирав ключ із мапи). Зняти позначку має бути
 * звичайним UPDATE, який LWW розсудить за `updated_at`; видалення конкурувало б
 * зі вставкою іншого пристрою, і хто переміг — залежало б від порядку доставки.
 */
export async function setShoppingCheck(
  db: Db,
  familyId: string,
  options: { itemKey: string; fingerprint: string; checked: boolean },
): Promise<void> {
  const { itemKey, fingerprint, checked } = options
  // Обидві колонки під CHECK на непорожнє значення: порожній ключ або відбиток
  // сервер відкине, а конектор через це втратить чергу вивантаження.
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

/**
 * Скільки позначка чужого відбитка має відлежати, перш ніж її прибрати.
 *
 * Місяць, а не «як довго живе план»: поріг мусить із ЗАПАСОМ перекривати
 * найдовший похід у магазин, інакше він сам стає джерелом втрати. Тиждень
 * здається природним (стільки живе типовий план), але `days` зверху нічим не
 * обмежений — вихідний PDF узагалі на два тижні, — і при плані, довшому за
 * поріг, позначки першого тижня прибиралися б посеред того самого походу.
 *
 * Точність тут не потрібна взагалі: це прибирання, а не правило показу —
 * список фільтрує сам відбиток. Єдина вимога — щоб таблиця не росла назавжди.
 */
const STALE_CHECK_DAYS = 30

/**
 * Прибрати позначки чужих відбитків — тих, що лишилися від минулих походів у
 * магазин.
 *
 * Це саме прибирання, а не скидання списку: новий список і без нього зібрався б
 * порожнім, бо читання фільтрує за поточним відбитком (`useShoppingChecks`).
 * Але рядки інакше накопичувалися б у сім'ї назавжди — по одному на кожну
 * куплену позицію кожного тижня, — тож клієнт їх м'яко видаляє, як і записано в
 * рішенні MER-55.
 *
 * **Прибираються лише СТАРІ рядки, і це головне в цій функції.** «Відбиток не
 * мій» саме по собі нічого не доводить: поки перегенерований план іншого
 * пристрою ще не приїхав, тутешній відбиток застарілий — і видалення «чужого»
 * стерло б позначки ЖИВОГО списку, які той пристрій щойно зробив. Обидва
 * пристрої робили б це одне одному до збіжності. Вік рядка цю гонку знімає:
 * позначка, зроблена хвилину тому, не прибирається ніколи, хоч би який відбиток
 * на ній стояв.
 *
 * `updated_at` пише виключно сервер (`SERVER_OWNED_COLUMNS` у `connector.ts`),
 * тож NULL тут означає «ще не вивантажено» — такий рядок не чіпаємо тим
 * більше. Форму позначки нормалізуємо так само, як `LATEST_PLAN_ORDER` у
 * `queries.ts`: у SQLite вона лежить текстом, і роздільник дати й часу
 * залежить від того, хто рядок записав.
 *
 * Порожній відбиток (планів ще немає) не прибирає нічого: «поточного списку
 * немає» і «поточний список порожній» — різні речі, і стерти позначки за те, що
 * на цьому пристрої ще не приїхав план, було б знищенням даних.
 */
export async function clearStaleChecks(
  db: Db,
  fingerprint: string,
): Promise<void> {
  if (!fingerprint.trim()) return
  const cutoff = new Date(Date.now() - STALE_CHECK_DAYS * 24 * 60 * 60 * 1000)
  await db.execute(
    'UPDATE shopping_check SET deleted_at = ?' +
      ' WHERE fingerprint <> ? AND deleted_at IS NULL' +
      ' AND updated_at IS NOT NULL' +
      " AND replace(substr(updated_at, 1, 19), ' ', 'T') < ?",
    [now(), fingerprint, cutoff.toISOString().slice(0, 19)],
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
 * UPDATE наявного рятує лише тоді, коли рядок уже є на пристрої. Двоє офлайн,
 * які генерують тиждень на ті самі дати ВПЕРШЕ, обидва нічого не знаходять і
 * обидва вставляють — тому новий слот отримує **виведений** id
 * (`planSlotId`, MER-66): обидва пристрої рахують той самий, і друга вставка
 * стає upsert того самого рядка замість колізії на індексі (MER-57).
 *
 * **Наявний рядок при цьому шукається за природним ключем, а не за виведеним
 * id.** Тижні генерувалися ще до цієї зміни, тож у базах — і в серверній, і в
 * локальних SQLite — лежать слоти з випадковими id; шукати за виведеним
 * означало б їх не побачити і відтворити колізію рівно на заповненому
 * календарі. Id міграцією не переписуються — рядок живе зі своїм id далі.
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
      /* Усі рядки клітинки, живі й м'яко видалені, одним запитом — як у
       * `setMealPref`: живий на клітинку рівно один, а видалені потрібні
       * нижче, бо рядок із виведеним id оживає, а не вставляється наново. */
      const rows = await tx.getAll<{ id: string; deleted_at: string | null }>(
        'SELECT id, deleted_at FROM plan_slot' +
          ' WHERE profile_id = ? AND date = ? AND slot = ?',
        [ownerId, slot.date, slot.slot],
      )
      const live = rows.find((row) => row.deleted_at === null)
      if (live) {
        await tx.execute(
          'UPDATE plan_slot SET week_plan_id = ?, day_index = ?, meal_id = ?' +
            ' WHERE id = ?',
          [planId, slot.dayIndex, slot.mealId, live.id],
        )
        continue
      }

      /* Живого рядка немає — але міг лишитись м'яко видалений із тим самим
       * виведеним id: «хвіст» коротшого тижня чи слоти видаленого профілю.
       * Вставка зіткнулася б із ним по первинному ключу, тож він оживає. */
      const id = planSlotId(ownerId, slot.date, slot.slot)
      if (rows.some((row) => row.id === id)) {
        await tx.execute(
          'UPDATE plan_slot SET week_plan_id = ?, day_index = ?, meal_id = ?,' +
            ' deleted_at = NULL WHERE id = ?',
          [planId, slot.dayIndex, slot.mealId, id],
        )
        continue
      }
      await tx.execute(
        'INSERT INTO plan_slot (id, family_id, week_plan_id, profile_id,' +
          ' date, day_index, slot, meal_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
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
