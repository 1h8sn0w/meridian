/**
 * Доменна модель Meridian (MER-47) — перенос V1 (`index.html`: `createMeal`,
 * `createProfile`, `WeekGenerator`, `WeekStore`, `CalendarStore`) у типізований
 * TypeScript.
 *
 * Типи описують те саме, що таблиці `@meridian/db`, але в термінах домену:
 * `camelCase`, `null` замість SQL NULL, розібраний JSON замість `jsonb`. Міст
 * між рядком локального SQLite і цими типами — `rows.ts`; далі жоден модуль
 * ядра про БД не знає.
 *
 * Головна відмінність від V1, з якої ростуть майже всі рішення нижче:
 * **`calories` тепер nullable.** У V1 калорійність була обов'язковим невід'ємним
 * числом, у схемі V2 її може не бути — PDF дає її не для всіх страв, а порожнє
 * лишається порожнім (правило провенансу, AGENTS.md). Нуль ≠ «невідомо».
 */

/* ==========================================================================
 * Слоти прийомів їжі — MEAL_TYPES із V1. Єдине джерело правди, як і `meal_type`
 * у схемі БД.
 * ======================================================================== */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export const MEAL_TYPES: ReadonlyArray<MealType> = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
]

/** Людські підписи слотів (українською) — MEAL_TYPE_LABELS із V1. */
export const MEAL_TYPE_LABELS: Readonly<Record<MealType, string>> = {
  breakfast: 'Сніданок',
  lunch: 'Обід',
  dinner: 'Вечеря',
  snack: 'Перекус',
}

/**
 * Інгредієнт дослівно, у двох формах V1: рядок («овочі на вибір») або
 * структура («сирок — 40 г»). Кількість зберігається лише тоді, коли вона
 * однозначна в джерелі — інакше поля просто немає.
 */
export type Ingredient =
  string | { name: string; amount?: number; unit?: string }

/**
 * MER-24: готова порція на людину з плану дієтолога. `text` — дослівний рядок
 * після «Готова порція:» («Ж - 130 г; Ч - 200 г»), `component` — складник, якого
 * порція стосується (null — уся страва). Текст не парситься в числа.
 */
export type Portion = { component: string | null; text: string }

/** Порційна літера з плану (MER-24). З плану, не обчислюється. */
export type PortionLetter = 'Ж' | 'Ч'

/** Смак страви (MER-18) — правило добору в генераторі, не косметика. */
export type MealPrefValue = 'favorite' | 'disliked'

/**
 * Страва з плану дієтолога — ядро моделі (V1 `createMeal`, таблиця `meal`).
 *
 * `source` — це **план дієтолога** («Тиждень 2»), а не звідки взялися дані.
 * Перетворення його на provenance-енум (`'pdf' | 'manual'`) зламало б мікс
 * планів у генераторі — див. `plans.ts`.
 */
export type Meal = {
  id: string
  name: string
  type: MealType
  /** Ккал або null, якщо в джерелі її немає. Нуль — справжній нуль. */
  calories: number | null
  /** MER-26: калорія — приблизна оцінка; UI показує «≈». */
  caloriesApprox: boolean
  /** БЖВ у грамах; null — у плані немає. */
  protein: number | null
  fat: number | null
  carbs: number | null
  ingredients: Array<Ingredient>
  /** План дієтолога. Порожній рядок — плану не вказано (як у V1). */
  source: string
  portions: Array<Portion>
}

/**
 * Рецептна частина страви (MER-22, екран — MER-63): кроки, час, порції, фото.
 * Окремим типом, а не полями страви — з тієї ж причини, що й окремим рядком у
 * схемі: фото важке, а страву й слоти плану синхронізують часто.
 *
 * Усе тут необов'язкове, і порожнього рецепта не буває: рядок існує лише тоді,
 * коли є хоч одне з чотирьох полів (те саме правило, що в `migrateRecipe`).
 */
export type Recipe = {
  id: string
  mealId: string
  /** Кроки дослівно; порожньо — у джерелі їх немає. */
  steps: Array<string>
  /** Хвилини; null — у джерелі немає. */
  prepTime: number | null
  /** На скільки порцій; null — у джерелі немає. */
  servings: number | null
  /** data-URL, який додав користувач. */
  photo: string | null
}

/**
 * Страва, придатну до якої генератор може поставити в слот: калорійність
 * відома, тож коридор дня взагалі має сенс. Страву без калорійності генератор
 * не вигадує в нуль — він її не бере (див. `generator.ts`).
 */
export type PlannedMeal = Meal & { calories: number }

/** Профіль (V1 `createProfile`, таблиця `profile`): раціон, а не акаунт. */
export type Profile = {
  id: string
  name: string
  targetCalories: number
  corridor: number
  portion: PortionLetter | null
  /** null — увесь спільний пул; масив — обмежений пул. Порожній ≠ null. */
  mealIds: Array<string> | null
  /** MER-17: профіль-власник спільного плану. null — власний план. */
  sharedPlanWith: string | null
  goalProtein: number | null
  goalFat: number | null
  goalCarbs: number | null
}

/** Смаки сім'ї (MER-18): улюблені мають вагу в доборі, небажані виключаються. */
export type TastePrefs = {
  favorites: ReadonlySet<string>
  disliked: ReadonlySet<string>
}

/** Порожні смаки — зручний нейтральний вхід для генератора й тестів. */
export const NO_PREFS: TastePrefs = {
  favorites: new Set<string>(),
  disliked: new Set<string>(),
}

/**
 * Калорійність дня. У V1 це було одне число, бо калорія була обов'язковою; у V2
 * її може не бути, тож сума окремо повідомляє, наскільки вона повна:
 *
 *  - `total`   — сума ВІДОМИХ значень;
 *  - `unknown` — скільки слотів дня калорійності не мають (сума неповна);
 *  - `approx`  — чи є серед відомих хоч одне приблизне (MER-26): тоді й сума «≈».
 *
 * `unknown > 0` і `approx` — різні речі й змішувати їх не можна: «≈» означає
 * «оцінка замість цифри дієтолога», а не «порахували не все».
 */
export type DayCalories = {
  total: number
  unknown: number
  approx: boolean
}

/** День плану: по страві на слот + калорійність дня. */
export type PlanDay = {
  meals: Record<MealType, Meal>
  calories: DayCalories
}

/** Параметри генерації (`result.params` у V1, колонки `week_plan`). */
export type WeekParams = {
  targetCalories: number
  corridor: number
  antiRepeatDays: number
  days: number
}

/** Успішно зібраний тиждень. */
export type WeekPlan = {
  days: Array<PlanDay>
  params: WeekParams
  /** Коридор, на якому тиждень зрештою зібрався (генератор міг послабити). */
  usedCorridor: number
  /** «Сирі» підписи джерел для показу (`meal.source`). */
  sources: Array<string>
  /** MER-30: чи тиждень справді зміксований — структурно, а не за підписом. */
  mixed: boolean
  /** MER-30: чи мікс узагалі був можливий на цьому пулі. */
  mixPossible: boolean
  /** Чесні попередження — показуються користувачеві як є. */
  warnings: Array<string>
}

/**
 * Результат операції домену. Форма з V1: `{ ok: true, ... }` або
 * `{ ok: false, error }` зі зрозумілим українським поясненням. Виняток тут не
 * кидаємо — «не склалося» це не збій програми, а нормальна відповідь.
 */
export type Err = { ok: false; error: string }
export type Result<T> = ({ ok: true } & T) | Err
