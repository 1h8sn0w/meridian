/**
 * Клієнтська схема локального SQLite (MER-46).
 *
 * Дзеркало серверних таблиць із `packages/db/src/schema.ts` — рівно тих, що
 * перелічені в `infra/powersync/sync-config.yaml`. Три місця мусять мінятися
 * разом: публікація `powersync` у міграції, sync-правила і цей файл. Забути
 * будь-яке — тиха поломка: сервер приймає записи, а пристрій їх не бачить.
 *
 * **Типів у SQLite три** — TEXT, INTEGER, REAL, і це не спрощення заради
 * зручності, а обмеження рушія. Тому:
 *  - `uuid`, `timestamptz`, `date` і енуми — TEXT (як їх і віддає реплікація);
 *  - `boolean` — INTEGER 0/1;
 *  - `jsonb` — TEXT із JSON-рядком, розбирається на межі читання.
 * Значення при цьому лишаються тими самими — жодне поле дорогою не
 * доповнюється й не округлюється (правило провенансу).
 *
 * **Колонки `id` тут немає навмисно** — PowerSync заводить її сам у кожній
 * таблиці, і оголошувати її вдруге не можна.
 *
 * **`deleted_at` є, хоча синхронізація віддає лише живі рядки.** Вона потрібна
 * для власного м'якого видалення: локальний UPDATE ставить позначку відразу,
 * інтерфейс бачить її миттєво, а коли сервер підтвердить — рядок зникне з
 * вибірки правил і з пристрою. Фізичного DELETE у цій схемі немає ніде.
 */

import { Schema, Table, column } from '@powersync/web'

/**
 * Службові поля sync — ті самі, що в кожній серверній таблиці.
 *
 * `family_id` тримаємо, хоч на пристрої сім'я завжди одна: саме це значення
 * їде назад у PostgREST при вставці, і без нього рядок не пройде ні NOT NULL,
 * ні `WITH CHECK` політики RLS.
 *
 * `created_at`/`updated_at` — читання, не запис: їх ставить сервер (DEFAULT і
 * тригер `touch_updated_at`), і саме тому вивантаження їх викидає — див.
 * `connector.ts`. Так LWW не залежить від годинника пристрою.
 */
const syncColumns = {
  family_id: column.text,
  created_at: column.text,
  updated_at: column.text,
  deleted_at: column.text,
}

/** profile — раціон («Я», «Дружина»), не акаунт. */
const profile = new Table({
  ...syncColumns,
  name: column.text,
  target_calories: column.integer,
  corridor: column.integer,
  color: column.text,
  /** Спільний план: пов'язані профілі їдять ТІ САМІ страви (MER-17). */
  shared_plan_with: column.text,
  /** Порційна літера з плану — «Ж» або «Ч» (MER-24). */
  portion: column.text,
  goal_protein: column.real,
  goal_fat: column.real,
  goal_carbs: column.real,
  /** JSON-масив id страв; NULL — увесь спільний пул. */
  meal_ids: column.text,
})

/** meal — страва з плану дієтолога. */
const meal = new Table({
  ...syncColumns,
  name: column.text,
  /** `breakfast` / `lunch` / `dinner` / `snack`. */
  type: column.text,
  calories: column.integer,
  /** MER-26: «≈» в інтерфейсі. 1 — приблизна оцінка, 0 — цифра дієтолога. */
  calories_approx: column.integer,
  protein: column.real,
  fat: column.real,
  carbs: column.real,
  /** JSON-масив: рядок або `{name, amount?, unit?}`. */
  ingredients: column.text,
  /** План дієтолога («Тиждень 2»), яким генератор міксує тиждень. */
  source: column.text,
  /** JSON-масив `{component, text}` — порції дослівно (MER-24). */
  portions: column.text,
})

/** recipe — рецептна частина страви, один-до-одного й необов'язкова. */
const recipe = new Table(
  {
    ...syncColumns,
    meal_id: column.text,
    /** JSON-масив кроків дослівно. */
    steps: column.text,
    prep_time: column.integer,
    servings: column.integer,
    /** data-URL, який додав користувач. Найважче поле всієї схеми. */
    photo: column.text,
  },
  { indexes: { meal: ['meal_id'] } },
)

/** meal_pref — смак страви: правило добору в генераторі (MER-18). */
const mealPref = new Table(
  {
    ...syncColumns,
    meal_id: column.text,
    /** `favorite` / `disliked`. */
    value: column.text,
  },
  { indexes: { meal: ['meal_id'] } },
)

/** week_plan — один результат генератора (MER-10). */
const weekPlan = new Table(
  {
    ...syncColumns,
    /** Профіль-власник плану; пов'язані профілі читають план власника. */
    profile_id: column.text,
    generated_at: column.text,
    /** Дата першого дня, локальна («YYYY-MM-DD»), без UTC-зсувів. */
    start_date: column.text,
    target_calories: column.integer,
    corridor: column.integer,
    anti_repeat_days: column.integer,
    days: column.integer,
    used_corridor: column.integer,
    /** JSON-масиви: плани-джерела й чесні попередження генератора. */
    sources: column.text,
    warnings: column.text,
  },
  { indexes: { profileStart: ['profile_id', 'start_date'] } },
)

/** plan_slot — один прийом їжі одного дня; він же календар і одиниця LWW. */
const planSlot = new Table(
  {
    ...syncColumns,
    week_plan_id: column.text,
    profile_id: column.text,
    date: column.text,
    day_index: column.integer,
    /** Той самий енум, що й `meal.type`. */
    slot: column.text,
    meal_id: column.text,
  },
  {
    indexes: {
      // Календарний ключ V1: профіль + дата.
      profileDate: ['profile_id', 'date'],
      week: ['week_plan_id'],
    },
  },
)

/** shopping_check — позначка «куплено»; список ОДИН на сім'ю (MER-16). */
const shoppingCheck = new Table(
  {
    ...syncColumns,
    /** Ключ позиції: `q:<назва>|<одиниця>` або `n:<назва>`. */
    item_key: column.text,
    /** Відбиток планів, під якими зроблено позначку. */
    fingerprint: column.text,
    checked: column.integer,
  },
  { indexes: { fingerprint: ['fingerprint'] } },
)

/**
 * Імена ключів — це імена таблиць у sync-правилах і в Postgres. Розбіжність
 * тут означала б, що дані приїжджають «нікуди»: PowerSync складе їх у таблицю,
 * якої в схемі немає, і жоден запит їх не побачить.
 */
export const AppSchema = new Schema({
  profile,
  meal,
  recipe,
  meal_pref: mealPref,
  week_plan: weekPlan,
  plan_slot: planSlot,
  shopping_check: shoppingCheck,
})

/** Рядки локальних таблиць — типи для запитів. */
export type AppDatabase = (typeof AppSchema)['types']

/**
 * Колонки, які на пристрої лежать НЕ в тому вигляді, у якому їх чекає Postgres
 * (MER-49).
 *
 * У SQLite три типи, тож `jsonb` живе тут рядком, а `boolean` — числом 0/1.
 * Читання це розбирає (`rows.ts` у ядрі), але вивантаження теж мусить: PostgREST
 * кладе значення в колонку як є, і JSON-рядок стає jsonb-РЯДКОМ, а не масивом —
 * `jsonb_typeof(...) = 'array'` у схемі відкидає такий запис, а конектор
 * відкидає саму зміну. Ознака в консолі — `23514 ... violates check constraint`.
 *
 * Списки живуть поруч із самою схемою навмисно: нова jsonb- або boolean-колонка
 * має дописатися сюди тим самим рухом, що й у таблицю вище.
 */
export const JSON_COLUMNS: Readonly<Record<string, ReadonlyArray<string>>> = {
  profile: ['meal_ids'],
  meal: ['ingredients', 'portions'],
  recipe: ['steps'],
  week_plan: ['sources', 'warnings'],
}

export const BOOLEAN_COLUMNS: Readonly<Record<string, ReadonlyArray<string>>> =
  {
    meal: ['calories_approx'],
    shopping_check: ['checked'],
  }

/** Таблиці, які синхронізуються. Порядок — як у sync-config.yaml. */
export const SYNCED_TABLES = [
  'profile',
  'meal',
  'recipe',
  'meal_pref',
  'week_plan',
  'plan_slot',
  'shopping_check',
] as const
