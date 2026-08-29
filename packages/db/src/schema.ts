/**
 * @meridian/db — схема Supabase Postgres (MER-44, MER-55, MER-45).
 *
 * Модель перенесена з V1 (`index.html`: `createMeal`, `createProfile`,
 * `WeekStore`, `CalendarStore`) як є. Правило провенансу діє й тут: жодного
 * поля, якого немає у V1 або в джерелі даних. V2 додає лише службовий набір
 * sync — `id`, `family_id`, `created_at`, `updated_at`, `deleted_at`.
 *
 * Чого тут свідомо немає:
 *  - провенанс-енума: `source` — це план дієтолога («Тиждень 2»), а не звідки
 *    взялися дані. Провенанс лишається правилом у `packages/core`;
 *  - фізичного видалення: `deleted_at` — м'яке видалення, бо sync-рушій не вміє
 *    синхронізувати те, чого вже немає (тому й GRANT DELETE нікому не даємо —
 *    див. міграцію реплікації);
 *  - похідних значень: калорійність дня — сума слотів, а не колонка;
 *  - стану пристрою: активний профіль, охоплення списку покупок і нагадування
 *    (MER-20) на сервер не їдуть — рішення MER-55, обґрунтування в README.
 *
 * Окремо стоять дві таблиці MER-45 — `family_member` і `family_invite`. Вони не
 * з моделі V1: у V1 акаунтів немає взагалі. Це облік доступу, який тримає claim
 * `family_id` у JWT, а на ньому вже тримається вся RLS нижче.
 *
 * RLS — на всіх таблицях без винятку, по `family_id`, через
 * `public.current_family_id()` (заводиться першою міграцією).
 */

import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

/** Сім'я поточного клієнта — з claim `family_id` у JWT (MER-45). */
const currentFamily = sql`public.current_family_id()`

/**
 * Політика доступу: клієнт бачить і пише лише рядки своєї сім'ї.
 * `service_role` у Supabase має BYPASSRLS, тож серверні задачі не обмежені.
 */
function familyPolicy(name: string, column = sql`family_id`) {
  return pgPolicy(name, {
    for: 'all',
    to: 'authenticated',
    using: sql`${column} = ${currentFamily}`,
    withCheck: sql`${column} = ${currentFamily}`,
  })
}

/** Службові поля sync — однакові в кожній таблиці. */
const syncColumns = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** М'яке видалення: рядок лишається, щоб sync довіз видалення на інші пристрої. */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}

/* ==========================================================================
 * Слоти прийомів їжі — MEAL_TYPES із V1, єдине джерело правди.
 * ======================================================================== */
export const mealType = pgEnum('meal_type', [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
])

/* ==========================================================================
 * Смак страви — `MealPrefs.VALUES` із V1, теж єдине джерело правди.
 * ======================================================================== */
export const mealPrefValue = pgEnum('meal_pref_value', ['favorite', 'disliked'])

/* ==========================================================================
 * family — сім'я. Одиниця спільного доступу й ключ синхронізації.
 * У V1 сім'ї немає: там усе живе в localStorage одного браузера.
 * ======================================================================== */
export const family = pgTable(
  'family',
  {
    ...syncColumns,
    name: text('name').notNull(),
  },
  (t) => [
    check('family_name_not_empty', sql`btrim(${t.name}) <> ''`),
    // Виняток із правила «family_id у кожній таблиці»: для самої сім'ї цей
    // ключ — її ж `id`. Окрема колонка була б посиланням рядка сам на себе.
    familyPolicy('family_own_row', sql`id`),
  ],
).enableRLS()

/* ==========================================================================
 * family_member — акаунт у сім'ї (MER-45). Єдиний місток між GoTrue і схемою:
 * `user_id` — це `auth.users.id`, і саме з цієї таблиці хук доступу бере
 * `family_id`, який їде в JWT кожного токена.
 *
 * Зовнішнього ключа на `auth.users` немає навмисно: міграції цього пакета
 * застосовуються й на чистому Postgres — так їх перевіряють без усього стека
 * Supabase (див. README). Ключ додає та сама міграція, але лише якщо схема
 * `auth` існує.
 *
 * Один акаунт — рівно одна сім'я: у JWT їде один `family_id`, тож членство в
 * двох сім'ях зробило б claim неоднозначним, а RLS — недетермінованою.
 * ======================================================================== */
export const familyMember = pgTable(
  'family_member',
  {
    ...syncColumns,
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id),
    /** `auth.users.id` — власник сесії GoTrue. */
    userId: uuid('user_id').notNull(),
    /**
     * Пошта акаунта на момент приєднання — щоб екран сім'ї міг показати, хто в
     * ній, не читаючи схему `auth`. NULL, якщо в токені пошти не було: порожнє
     * лишається порожнім, вигадувати підпис нікому.
     */
    email: text('email'),
  },
  (t) => [
    // М'яко видалений рядок ключ не тримає — вихід із сім'ї має лишати
    // можливість приєднатися знову.
    uniqueIndex('family_member_user_id_key')
      .on(t.userId)
      .where(sql`${t.deletedAt} IS NULL`),
    index('family_member_family_id_idx').on(t.familyId),
    familyPolicy('family_member_family'),
  ],
).enableRLS()

/* ==========================================================================
 * family_invite — запрошення другого члена сім'ї (MER-45). Кодом, а не листом:
 * self-host без SMTP не вміє надсилати пошту, а обіцяти в UI лист, якого не
 * буде, — та сама неправда, що й вигадане значення.
 *
 * Код одноразовий і з терміном: прийняте запрошення отримує `accepted_at`, а не
 * `deleted_at` — видно, хто і коли ним скористався.
 * ======================================================================== */
export const familyInvite = pgTable(
  'family_invite',
  {
    ...syncColumns,
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id),
    /** 12 шістнадцяткових символів у верхньому регістрі; UI ділить на трійки. */
    code: text('code').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    /** `auth.users.id` того, хто прийняв. Без FK — з тієї ж причини. */
    acceptedBy: uuid('accepted_by'),
  },
  (t) => [
    uniqueIndex('family_invite_code_key')
      .on(t.code)
      .where(sql`${t.deletedAt} IS NULL`),
    check('family_invite_code_format', sql`${t.code} ~ '^[0-9A-F]{12}$'`),
    check(
      'family_invite_accepted_together',
      sql`(${t.acceptedAt} IS NULL) = (${t.acceptedBy} IS NULL)`,
    ),
    index('family_invite_family_id_idx').on(t.familyId),
    familyPolicy('family_invite_family'),
  ],
).enableRLS()

/* ==========================================================================
 * profile — профіль (MER-21, MER-17, MER-24). Планується не «для користувача»,
 * а для профілю: у сім'ї їх кілька, пул страв при цьому спільний.
 *
 * Із акаунтом (`family_member`) профіль не пов'язаний: профіль — це раціон
 * («Я», «Дружина»), а не вхід. У сім'ї з двома акаунтами профілів може бути
 * скільки завгодно, і обидва акаунти бачать усі.
 * ======================================================================== */
export const profile = pgTable(
  'profile',
  {
    ...syncColumns,
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id),
    name: text('name').notNull(),
    /** Ціль калорійності дня, ккал. */
    targetCalories: integer('target_calories').notNull(),
    /** Ширина коридору навколо цілі, ±ккал. */
    corridor: integer('corridor').notNull(),
    /** Акцент інтерфейсу активного профілю, `#rrggbb` (MER-17). */
    color: text('color').notNull(),
    /**
     * Спільний план (MER-17): профіль-власник, чий тиждень і календар читає цей
     * профіль. Пов'язані профілі їдять ТІ САМІ страви — окремі меню були б
     * помилкою. NULL — власний незалежний план.
     */
    sharedPlanWith: uuid('shared_plan_with').references(
      (): AnyPgColumn => profile.id,
    ),
    /**
     * Порційна літера з плану дієтолога (MER-24): «Ж» або «Ч». NULL — не
     * задано, тоді UI показує всі порційні рядки дослівно. З плану, не
     * обчислюється.
     */
    portion: text('portion'),
    /** Необов'язкові цілі БЖВ у грамах; NULL = не задано (нуль ≠ «невідомо»). */
    goalProtein: doublePrecision('goal_protein'),
    goalFat: doublePrecision('goal_fat'),
    goalCarbs: doublePrecision('goal_carbs'),
    /**
     * Підмножина спільного пулу страв: NULL — увесь пул, масив id — лише ці
     * страви. Порожній масив і NULL — різні стани, тож саме NULL, а не `[]`.
     */
    mealIds: jsonb('meal_ids').$type<Array<string> | null>(),
  },
  (t) => [
    check('profile_name_not_empty', sql`btrim(${t.name}) <> ''`),
    check('profile_target_calories_positive', sql`${t.targetCalories} > 0`),
    check('profile_corridor_non_negative', sql`${t.corridor} >= 0`),
    check('profile_color_hex', sql`${t.color} ~ '^#[0-9a-f]{6}$'`),
    // Порційні літери поточного плану дієтолога (Portions.PERSONS у V1).
    check(
      'profile_portion_letter',
      sql`${t.portion} IS NULL OR ${t.portion} IN ('Ж', 'Ч')`,
    ),
    // Ланцюжки заборонені так само, як у V1: власник плану не ділить чужий.
    check(
      'profile_shared_plan_not_self',
      sql`${t.sharedPlanWith} IS DISTINCT FROM ${t.id}`,
    ),
    check(
      'profile_meal_ids_is_array',
      sql`${t.mealIds} IS NULL OR jsonb_typeof(${t.mealIds}) = 'array'`,
    ),
    check(
      'profile_goals_non_negative',
      sql`(${t.goalProtein} IS NULL OR ${t.goalProtein} >= 0)
        AND (${t.goalFat} IS NULL OR ${t.goalFat} >= 0)
        AND (${t.goalCarbs} IS NULL OR ${t.goalCarbs} >= 0)`,
    ),
    // Кожна вибірка — і клієнтська через RLS, і бакет PowerSync — фільтрує
    // по сім'ї. Далі такий індекс є в кожній таблиці з тієї ж причини.
    index('profile_family_id_idx').on(t.familyId),
    familyPolicy('profile_family'),
  ],
).enableRLS()

/* ==========================================================================
 * meal — страва з плану дієтолога. Ядро моделі V1 (`createMeal`).
 * ======================================================================== */
export const meal = pgTable(
  'meal',
  {
    ...syncColumns,
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id),
    name: text('name').notNull(),
    type: mealType('type').notNull(),
    /**
     * Калорійність, ккал. NULL — у джерелі її немає (провенанс: порожнє
     * лишається порожнім). Нуль — це справжній нуль, а не «невідомо».
     */
    calories: integer('calories'),
    /**
     * MER-26: калорія — приблизна оцінка, а не цифра дієтолога; UI показує «≈».
     * Єдиний санкціонований виняток із правила провенансу — і лише для калорій.
     */
    caloriesApprox: boolean('calories_approx').notNull().default(false),
    /** БЖВ у грамах; NULL — у плані немає (PDF дає БЖВ не для всіх страв). */
    protein: doublePrecision('protein'),
    fat: doublePrecision('fat'),
    carbs: doublePrecision('carbs'),
    /**
     * Інгредієнти дослівно, у двох формах V1: рядок («овочі на вибір») або
     * `{name, amount?, unit?}` («сирок — 40 г»). Кількість зберігається лише
     * тоді, коли вона однозначна в джерелі, тож форма змішана — і саме тому
     * jsonb, а не колонки `amount`/`unit`, які довелося б чимось заповнювати.
     */
    ingredients: jsonb('ingredients')
      .$type<Array<string | { name: string; amount?: number; unit?: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /**
     * З якого плану дієтолога страва («Тиждень 2») — генератор міксує тиждень
     * із різних планів. НЕ провенанс-енум: `'pdf' | 'manual'` тут зламали б
     * генератор. Порожній рядок — плану не вказано (як у V1).
     */
    source: text('source').notNull().default(''),
    /**
     * MER-24: готові порції на людину — `{component, text}`, де `text` —
     * дослівний рядок після «Готова порція:» («Ж - 130 г; Ч - 200 г»), а
     * `component` — складник страви або NULL. Текст не парситься в числа.
     */
    portions: jsonb('portions')
      .$type<Array<{ component: string | null; text: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (t) => [
    check('meal_name_not_empty', sql`btrim(${t.name}) <> ''`),
    check(
      'meal_calories_non_negative',
      sql`${t.calories} IS NULL OR ${t.calories} >= 0`,
    ),
    check(
      'meal_macros_non_negative',
      sql`(${t.protein} IS NULL OR ${t.protein} >= 0)
        AND (${t.fat} IS NULL OR ${t.fat} >= 0)
        AND (${t.carbs} IS NULL OR ${t.carbs} >= 0)`,
    ),
    check(
      'meal_ingredients_is_array',
      sql`jsonb_typeof(${t.ingredients}) = 'array'`,
    ),
    check('meal_portions_is_array', sql`jsonb_typeof(${t.portions}) = 'array'`),
    index('meal_family_id_idx').on(t.familyId),
    familyPolicy('meal_family'),
  ],
).enableRLS()

/* ==========================================================================
 * recipe — рецептна частина страви (MER-22): кроки, час, порції, фото.
 * Один-до-одного зі стравою й повністю необов'язкова: у V1 ці поля лежать на
 * картці страви, але V1 сам називає їх «поля рецепта», і екран рецепта — це
 * саме вони. Окремим рядком, бо `photo` — важкий data-URL: страву й слоти
 * плану синхронізують часто, фото — ні (та сама причина, що в MER-35, де фото
 * не потрапляє у знімок плану).
 *
 * Слабке місце рішення відоме (ревʼю MER-44): зв'язок суворо 1:1, а розбивати
 * 1:1 на дві таблиці — сумнівна нормалізація. Тримаємо заради ваги `photo`;
 * злиття назад у `meal` — одна міграція.
 * ======================================================================== */
export const recipe = pgTable(
  'recipe',
  {
    ...syncColumns,
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meal.id),
    /** Кроки приготування дослівно; порожньо — у джерелі їх немає. */
    steps: jsonb('steps')
      .$type<Array<string>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Час приготування, хвилини. */
    prepTime: integer('prep_time'),
    /** На скільки порцій рецепт. */
    servings: integer('servings'),
    /** Фото страви, data-URL. Додає користувач вручну (MER-22). */
    photo: text('photo'),
  },
  (t) => [
    uniqueIndex('recipe_meal_id_key').on(t.mealId),
    check('recipe_steps_is_array', sql`jsonb_typeof(${t.steps}) = 'array'`),
    check(
      'recipe_prep_time_non_negative',
      sql`${t.prepTime} IS NULL OR ${t.prepTime} >= 0`,
    ),
    check(
      'recipe_servings_positive',
      sql`${t.servings} IS NULL OR ${t.servings} > 0`,
    ),
    index('recipe_family_id_idx').on(t.familyId),
    familyPolicy('recipe_family'),
  ],
).enableRLS()

/* ==========================================================================
 * meal_pref — смак страви (MER-18, заведено MER-55): «улюблене» / «не
 * подобається». Не косметика: це правило добору в генераторі — улюблені мають
 * вагу у зваженому перетасі, небажані виключаються окремою спробою.
 *
 * Окремою таблицею, а не колонкою `meal.preference` — рівно з тих причин, з
 * яких V1 тримає смаки окремим ключем сховища:
 *  - смак не походить із плану дієтолога, тож у моделі страви йому не місце
 *    (правило провенансу);
 *  - він не має ламати хеші демо-сіду (MER-37);
 *  - у знімках плану смак застигав би, а він мусить лишатися живим.
 *
 * Смаки спільні для сім'ї, а не для профілю — як і сам пул страв: сім'я планує
 * один раціон. Прибраний смак — це `deleted_at`, як і всюди тут; у V1 йому
 * відповідає видалення ключа з мапи.
 * ======================================================================== */
export const mealPref = pgTable(
  'meal_pref',
  {
    ...syncColumns,
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meal.id),
    value: mealPrefValue('value').notNull(),
  },
  (t) => [
    // Один смак на страву — у V1 це мапа `{ "<mealId>": ... }`, де ключ фізично
    // один. М'яко видалені рядки ключ не тримають, тому індекс частковий.
    uniqueIndex('meal_pref_meal_id_key')
      .on(t.mealId)
      .where(sql`${t.deletedAt} IS NULL`),
    index('meal_pref_family_id_idx').on(t.familyId),
    familyPolicy('meal_pref_family'),
  ],
).enableRLS()

/* ==========================================================================
 * week_plan — згенерований тиждень (MER-10). Один рядок = один результат
 * генератора: його параметри, використаний коридор, джерела й попередження.
 * Самі страви — у plan_slot.
 * ======================================================================== */
export const weekPlan = pgTable(
  'week_plan',
  {
    ...syncColumns,
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id),
    /**
     * Профіль-власник плану. У V1 це ключ сховища
     * `meridian.week.v1.<planOwnerId>`; пов'язані профілі (MER-17) читають план
     * власника, а не свій.
     */
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull(),
    /**
     * Дата першого дня плану. Окремо від `generated_at` навмисно: календар V1
     * рахує дні локальними датами, без UTC-зсувів (MER-31), а тиждень наперед
     * може починатися не сьогодні.
     */
    startDate: date('start_date').notNull(),
    /* Параметри генерації (`result.params` у V1). */
    targetCalories: integer('target_calories').notNull(),
    corridor: integer('corridor').notNull(),
    antiRepeatDays: integer('anti_repeat_days').notNull(),
    days: integer('days').notNull(),
    /** Коридор, на якому тиждень зрештою зібрався (генератор міг послабити). */
    usedCorridor: integer('used_corridor').notNull(),
    /** Плани дієтолога, з яких зібрано тиждень (`meal.source`). */
    sources: jsonb('sources')
      .$type<Array<string>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Чесні попередження генератора — показуються користувачеві як є. */
    warnings: jsonb('warnings')
      .$type<Array<string>>()
      .notNull()
      .default(sql`'[]'::jsonb`),
  },
  (t) => [
    check('week_plan_target_calories_positive', sql`${t.targetCalories} > 0`),
    check('week_plan_corridor_non_negative', sql`${t.corridor} >= 0`),
    check('week_plan_used_corridor_non_negative', sql`${t.usedCorridor} >= 0`),
    check(
      'week_plan_anti_repeat_days_non_negative',
      sql`${t.antiRepeatDays} >= 0`,
    ),
    check('week_plan_days_positive', sql`${t.days} > 0`),
    check(
      'week_plan_sources_is_array',
      sql`jsonb_typeof(${t.sources}) = 'array'`,
    ),
    check(
      'week_plan_warnings_is_array',
      sql`jsonb_typeof(${t.warnings}) = 'array'`,
    ),
    index('week_plan_family_id_idx').on(t.familyId),
    // «Поточний план профілю» — найгарячіший запит екрана «Тиждень».
    index('week_plan_profile_id_start_date_idx').on(t.profileId, t.startDate),
    familyPolicy('week_plan_family'),
  ],
).enableRLS()

/* ==========================================================================
 * plan_slot — один прийом їжі одного дня. Це і є календар V1: там день лежить
 * за датою («YYYY-MM-DD» → слоти), а не за номером у тижні. Тому ключ
 * унікальності — (профіль, дата, слот), а `day_index` лишається довідковим
 * номером дня всередині свого тижня.
 *
 * Це ж і одиниця конфлікту: last-write-wins на рівні слота (без CRDT) — двоє
 * замінили вечерю вівторка, перемагає остання зміна цього рядка.
 *
 * Страва — посиланням, а не знімком: у V1 знімок захищав план від видалення
 * страви з пулу, а тут це робить м'яке видалення — рядок `meal` нікуди не
 * зникає. Калорійність дня — сума слотів, окремою колонкою не зберігається.
 * ======================================================================== */
export const planSlot = pgTable(
  'plan_slot',
  {
    ...syncColumns,
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id),
    weekPlanId: uuid('week_plan_id')
      .notNull()
      .references(() => weekPlan.id),
    /** Профіль-власник плану — календарний ключ V1 разом із датою. */
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profile.id),
    date: date('date').notNull(),
    /** Номер дня всередині свого тижня (від 0), як `plan.days[i]` у V1. */
    dayIndex: integer('day_index').notNull(),
    slot: mealType('slot').notNull(),
    mealId: uuid('meal_id')
      .notNull()
      .references(() => meal.id),
  },
  (t) => [
    // Один слот на дату в календарі профілю. М'яко видалені рядки не заважають —
    // тому індекс частковий.
    uniqueIndex('plan_slot_profile_date_slot_key')
      .on(t.profileId, t.date, t.slot)
      .where(sql`${t.deletedAt} IS NULL`),
    check('plan_slot_day_index_non_negative', sql`${t.dayIndex} >= 0`),
    index('plan_slot_family_id_idx').on(t.familyId),
    // Слоти одного згенерованого тижня — екран «Тиждень» бере їх пачкою.
    index('plan_slot_week_plan_id_idx').on(t.weekPlanId),
    familyPolicy('plan_slot_family'),
  ],
).enableRLS()

/* ==========================================================================
 * shopping_check — позначка «куплено» в списку покупок (MER-16, заведено
 * MER-55). У V1 це мапа `checked` у `meridian.shopping.v1`, і V1 прямо каже:
 * список ОДИН на застосунок, не на профіль: куплене — куплене для всієї сім'ї.
 * Двоє в магазині з телефонами — рівно той сценарій, заради якого робиться
 * sync, тож дані спільні.
 *
 * Сам список не зберігається: він щоразу збирається з інгредієнтів страв
 * поточних планів (`Shopping.collect`). Зберігати треба лише позначки.
 *
 * `item_key` — ключ позиції з V1: `q:<назва>|<одиниця>` для позицій із
 * кількістю, `n:<назва>` для позицій без неї. Назва вже нормалізована
 * (`Shopping.nameKey`), тож ключ порівнюється як є.
 *
 * `fingerprint` — відбиток планів, під якими зроблено позначку. У V1 він лежить
 * поруч зі списком, і зміна відбитка (перегенерували тиждень — новий похід у
 * магазин) стирає позначки. Тут відбиток стоїть НА КОЖНОМУ рядку навмисно:
 *  - скидання стає фільтром, а не руйнівним записом: клієнт читає позначки
 *    свого відбитка, чужі просто не рахуються. Гонки «хто перший стер» немає;
 *  - інакше довелося б тримати один рядок відбитка на сім'ю, а це найгарячіша
 *    точка LWW-конфлікту в усій схемі — і заради одного текстового поля.
 * Позначки застарілих відбитків прибирає клієнт м'яким видаленням, і лише ті,
 * що встигли відлежати (MER-62): поки перегенерований план іншого пристрою не
 * приїхав, тутешній відбиток застарілий сам. Складає його клієнт із id рядків
 * `week_plan` — форма `generated_at` на пристрої залежить від того, хто рядок
 * записав, тож той самий план дав би два різні відбитки.
 *
 * `checked` прапорцем, а не наявністю рядка (V1 при знятті видаляє ключ):
 * зняти позначку — це UPDATE, який LWW розсудить за `updated_at`, а не
 * видалення, що конкурує зі вставкою іншого пристрою.
 *
 * Охоплення (`scope` у V1 — «all» або id профілю) сюди не переїхало: це
 * фільтр показу, стан пристрою, як і активний профіль. Рішення MER-55.
 * ======================================================================== */
export const shoppingCheck = pgTable(
  'shopping_check',
  {
    ...syncColumns,
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id),
    itemKey: text('item_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    checked: boolean('checked').notNull().default(true),
  },
  (t) => [
    // Одна позначка на позицію в межах одного відбитка. `family_id` у ключі —
    // на відміну від plan_slot, тут немає посилання, яке сім'ю вже визначає:
    // `item_key` — вільний рядок, і в двох сім'ях він збігається легко.
    uniqueIndex('shopping_check_item_key_key')
      .on(t.familyId, t.itemKey, t.fingerprint)
      .where(sql`${t.deletedAt} IS NULL`),
    check('shopping_check_item_key_not_empty', sql`btrim(${t.itemKey}) <> ''`),
    check(
      'shopping_check_fingerprint_not_empty',
      sql`btrim(${t.fingerprint}) <> ''`,
    ),
    index('shopping_check_family_id_idx').on(t.familyId),
    familyPolicy('shopping_check_family'),
  ],
).enableRLS()

/* ==========================================================================
 * pdf_import — імпорт плану дієтолога з PDF (MER-15). У V1 імпорт нічого не
 * зберігає: розпізнаний текст живе лише до закриття діалогу. Тут лишається
 * джерельний текст — те саме правило провенансу, тільки збережене: завжди
 * видно, з чого саме зроблено страви.
 *
 * Страви з імпортом не пов'язані колонкою: у V1 цей зв'язок — `meal.source`
 * («Тиждень 2»), і нових полів у страві V2 не заводить.
 * ======================================================================== */
export const pdfImport = pgTable(
  'pdf_import',
  {
    ...syncColumns,
    familyId: uuid('family_id')
      .notNull()
      .references(() => family.id),
    /** Ім'я вибраного файлу. NULL — текст плану вставили руками (шлях V1). */
    fileName: text('file_name'),
    /** Дослівний текст, з якого парсили страви. */
    sourceText: text('source_text').notNull(),
  },
  (t) => [
    check(
      'pdf_import_source_text_not_empty',
      sql`btrim(${t.sourceText}) <> ''`,
    ),
    index('pdf_import_family_id_idx').on(t.familyId),
    familyPolicy('pdf_import_family'),
  ],
).enableRLS()
