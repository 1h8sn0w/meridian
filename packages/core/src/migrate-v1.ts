/**
 * Міграція V1 → V2 (MER-48): розбір дампа `localStorage` V1 у рядки схеми V2.
 *
 * Задача складається з двох половин, і вони свідомо не з'єднані:
 *
 *  1. **Експорт можливий лише з браузера.** `localStorage` прив'язаний до
 *     origin, тож серверний скрипт до нього не дотягнеться ніяк — дамп збирає
 *     вставка в консоль на сторінці V1 (`tools/v1-export.js`).
 *  2. **Розбір дампа — оцей модуль:** чиста функція, окремо від запису в БД.
 *     Тому всю мапу перевіряють юніт-тести, а не запуск на живих даних сім'ї.
 *
 * ## Пропущене має бути видним
 *
 * Запис, який не проходить перевірку, не зникає: він повертається в `skipped` з
 * причиною українською, і екран показує список користувачеві. Тихо підставлене
 * типове значення виглядало б як успішний імпорт — а це найгірше, що може
 * зробити міграція, бо її наслідки помітять уже після видалення V1.
 *
 * З цього ж правила — суворість до записів: будь-яке некоректне поле відкидає
 * ВЕСЬ запис із поясненням, а не лише це поле. Єдиний виняток — колір профілю
 * (див. `migrateProfile`): він інтерфейсний, а не з плану дієтолога.
 *
 * ## Чого тут немає: тижні й календар
 *
 * V1 клав у план **знімки** страв (`stripDayMeals`), а `plan_slot` у V2
 * посилається на `meal.id` зовнішнім ключем. Знімок страви, яку потім видалили
 * з пулу, подіти нікуди: перенести лише «живі» дні означало б дірки саме там,
 * де страву колись прибрали, а створювати страви зі знімків — засмітити пул
 * тим, чого в ньому не було (генератор почав би це пропонувати).
 *
 * Тому історія не переноситься взагалі: календар V2 починається з дня імпорту,
 * прожиті тижні лишаються у V1. Це рішення видно користувачеві — ключі тижнів,
 * календаря й списку покупок потрапляють у `skipped` із поясненням, а не
 * зникають мовчки.
 */

import { v5 as uuidv5 } from 'uuid'
import { MEAL_TYPES } from './types.ts'
import type {
  Ingredient,
  Meal,
  MealPrefValue,
  MealType,
  Portion,
  PortionLetter,
  Profile,
} from './types.ts'

/* ==========================================================================
 * Ключі сховища V1 — рівно ті, що їх пише `index.html`.
 * ======================================================================== */

/** Пул страв: масив об'єктів `createMeal`. */
export const MEALS_KEY = 'meridian.meals.v1'
/** Смаки (MER-18): мапа `{ "<mealId>": "favorite" | "disliked" }`. */
export const PREFS_KEY = 'meridian.mealPrefs.v1'
/** Профілі (MER-21): `{ profiles: [...], activeId }`. */
export const PROFILES_KEY = 'meridian.profiles.v1'

/**
 * Ключі, які до V2 не їдуть, — але сказати про них треба вголос.
 *
 * `week`/`calendar` — історія (рішення вище). `shopping` — позначки «куплено»
 * під відбитком планів, яких не буде, тож їм не було б до чого причепитися.
 * `app` — стан пристрою (активна вкладка), і в V2 його тримає адреса маршруту.
 */
const NOT_MIGRATED: ReadonlyArray<{ prefix: string; reason: string }> = [
  {
    prefix: 'meridian.week.v1',
    reason:
      'план тижня не переноситься: у V1 він зберігав знімки страв, а слот V2' +
      ' посилається на страву з пулу. Тиждень генерується наново.',
  },
  {
    prefix: 'meridian.calendar.v1',
    reason:
      'календар не переноситься: історія лишається у V1, а календар V2' +
      ' починається з дня імпорту.',
  },
  {
    prefix: 'meridian.shopping.v1',
    reason:
      "позначки списку покупок не переносяться: вони прив'язані до відбитка" +
      ' планів, які не переносяться.',
  },
  {
    prefix: 'meridian.app.v1',
    reason: 'стан інтерфейсу не переноситься: у V2 активний екран — це адреса.',
  },
]

/* ==========================================================================
 * Id: виводити, а не генерувати
 * ======================================================================== */

/**
 * Простір імен Meridian для UUIDv5. Фіксована константа: саме вона робить
 * виведення відтворюваним між запусками й пристроями.
 */
export const MERIDIAN_NAMESPACE = '08f391fa-7b00-47c8-9fc6-61847964d799'

/** Різновиди рядків, id яких виводяться. Розділені, щоб не збігтись між собою. */
export type IdKind = 'meal' | 'recipe' | 'profile' | 'meal_pref'

/**
 * Вивести id рядка V2 з id запису V1.
 *
 * У V1 `id` — довільний рядок (`generateId`), у V2 колонка має тип `uuid`, тож
 * прямо перенести не вийде. Виведення (а не генерація) дає дві речі:
 *  - імпорт **ідемпотентний**: повторний запуск оновлює ті самі рядки, а не
 *    подвоює пул;
 *  - посилання всередині даних лишаються цілі — смаки, `mealIds` профілю й
 *    `sharedPlanWith` перераховуються в ті самі нові значення.
 *
 * **`familyId` у складі імені — не прикраса.** Профіль за замовчуванням у V1
 * має буквальний id `default` (`ProfileStore.DEFAULT_ID`), тобто однаковий у
 * КОЖНОГО користувача. Без сім'ї в імені дві родини на одному self-host вивели
 * б той самий UUID і зіткнулися б на первинному ключі.
 *
 * Розділювач — NUL: він не може трапитись усередині жодного зі складників, тож
 * розібрати ім'я на інші три частини неможливо.
 */
export function derivedId(
  familyId: string,
  kind: IdKind,
  v1Id: string,
): string {
  return uuidv5(
    familyId + '\u0000' + kind + '\u0000' + v1Id,
    MERIDIAN_NAMESPACE,
  )
}

/* ==========================================================================
 * Що дає розбір
 * ======================================================================== */

/**
 * Рецептна частина страви (MER-22) — окремий рядок `recipe`, як у схемі V2.
 * У V1 ці поля лежать на картці страви, тож тут вони від страви відділяються.
 */
export type MigratedRecipe = {
  id: string
  mealId: string
  steps: Array<string>
  prepTime: number | null
  servings: number | null
  photo: string | null
}

/** Смак страви (MER-18) — рядок `meal_pref`. */
export type MigratedPref = {
  id: string
  mealId: string
  value: MealPrefValue
}

/**
 * Профіль плюс колір. Колір інтерфейсний, тож у доменному `Profile` його немає
 * (та сама межа, що й у `AppProfile` на боці веба), але схема тримає його NOT
 * NULL — і міграція мусить його привезти.
 */
export type MigratedProfile = Profile & { color: string }

/** Що саме не переїхало і чому. Показується користувачеві як є. */
export type Skipped = {
  /** Про який запис ідеться — назва страви, ім'я профілю, ключ сховища. */
  what: string
  /** Причина українською, зрозуміла без коду. */
  reason: string
}

/** Результат розбору: готові рядки V2 плюс чесний перелік пропущеного. */
export type V1Migration = {
  meals: Array<Meal>
  recipes: Array<MigratedRecipe>
  profiles: Array<MigratedProfile>
  prefs: Array<MigratedPref>
  skipped: Array<Skipped>
}

/* ==========================================================================
 * Дрібні перевірки. Кидають українську помилку — викликач ловить її порядково
 * і кладе в `skipped`. Той самий прийом, що в `rows.ts`.
 * ======================================================================== */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function trimmed(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function required(value: unknown, what: string): string {
  const text = trimmed(value)
  if (!text) throw new Error(what + ' — порожнє поле.')
  return text
}

/**
 * Число з дампа або null, якщо числа там немає.
 *
 * `Number()` наосліп сюди не годиться, і це не причіпка: `Number('   ')`,
 * `Number([])` і `Number(false)` дають НУЛЬ, а `Number(true)` — одиницю. Тобто
 * пробіли й сміття в полі калорійності стали б справжнім нулем — рівно тим
 * вигаданим значенням, від якого застерігає правило провенансу (нуль ≠
 * «невідомо»). Тому числами вважаються лише число й числовий рядок.
 */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (!text) return null
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

/**
 * Необов'язкове число з дампа.
 *
 * «Нечислове → NULL, а не нуль» — головне правило переносу калорійності: у V1
 * вона обов'язкове невід'ємне число, у V2 її може не бути. Справжній нуль
 * лишається нулем.
 *
 * Від'ємне — не null, а помилка: схема V2 відсікає такі значення CHECK-ами, і
 * тихо обнулити їх означало б вигадати дані.
 */
function optional(value: unknown, what: string): number | null {
  const n = toNumber(value)
  if (n === null) return null
  if (n < 0) throw new Error(what + " має бути невід'ємним, а тут " + n + '.')
  return n
}

/** Обов'язкове число: V1 завжди його пише, тож відсутнє — це зіпсований запис. */
function requiredNumber(value: unknown, what: string): number {
  const n = toNumber(value)
  if (n === null) throw new Error(what + ' — не число.')
  return n
}

/**
 * Інгредієнт: у V1 і V2 форма та сама (`string | {name, amount?, unit?}`), тож
 * перетворювати нічого — лише відкинути порожнє. Кількість і одиниця лишаються
 * необов'язковими: у джерелі вони є не завжди.
 */
function ingredient(entry: unknown, what: string): Ingredient | null {
  if (typeof entry === 'string') return entry.trim() || null
  if (isRecord(entry)) {
    const name = trimmed(entry.name)
    if (!name) return null
    const amount = optional(entry.amount, what + ': кількість «' + name + '»')
    const unit = trimmed(entry.unit)
    const out: Ingredient = { name }
    if (amount !== null) out.amount = amount
    if (unit) out.unit = unit
    return out
  }
  return null
}

/** Порція (MER-24): форма V1 і V2 та сама, текст не парситься в числа. */
function portion(entry: unknown): Portion | null {
  if (typeof entry === 'string' || typeof entry === 'number') {
    const text = String(entry).trim()
    return text ? { component: null, text } : null
  }
  if (isRecord(entry)) {
    const text = trimmed(entry.text)
    if (!text) return null
    return { component: trimmed(entry.component) || null, text }
  }
  return null
}

function list(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : []
}

/* ==========================================================================
 * Страви
 * ======================================================================== */

/** Один запис пулу V1 → страва V2. Кидає помилку на некоректному записі. */
function migrateMeal(raw: Record<string, unknown>, familyId: string): Meal {
  const v1Id = required(raw.id, 'id страви')
  const name = required(raw.name, 'назва страви')
  const type = trimmed(raw.type)
  if (!MEAL_TYPES.includes(type as MealType)) {
    throw new Error('невідомий тип слота «' + type + '».')
  }

  return {
    id: derivedId(familyId, 'meal', v1Id),
    name,
    type: type as MealType,
    calories: optional(raw.calories, 'калорійність'),
    // MER-26: прапорець «≈» переїжджає як є — інакше приблизна оцінка тихо
    // видала б себе за цифру дієтолога.
    caloriesApprox: raw.caloriesApprox === true,
    protein: optional(raw.protein, 'білки'),
    fat: optional(raw.fat, 'жири'),
    carbs: optional(raw.carbs, 'вуглеводи'),
    ingredients: list(raw.ingredients)
      .map((entry) => ingredient(entry, 'страва «' + name + '»'))
      .filter((x): x is Ingredient => x !== null),
    // План дієтолога («Тиждень 2»), а не провенанс-енум. Порожній рядок — плану
    // не вказано, як у V1.
    source: trimmed(raw.source),
    portions: list(raw.portions)
      .map(portion)
      .filter((x): x is Portion => x !== null),
  }
}

/**
 * Рецептна частина того самого запису — або null.
 *
 * Рядок `recipe` створюється ЛИШЕ тоді, коли є хоч що-небудь із чотирьох полів:
 * порожній рецепт означав би «рецепт є, але порожній», а це неправда — його
 * просто немає.
 */
function migrateRecipe(
  raw: Record<string, unknown>,
  familyId: string,
  v1Id: string,
): MigratedRecipe | null {
  const steps = list(raw.steps)
    .map((step) => trimmed(step))
    .filter((step) => step.length > 0)
  const prepTime = optional(raw.prepTime, 'час приготування')
  const servings = optional(raw.servings, 'кількість порцій')
  if (servings !== null && servings <= 0) {
    throw new Error('кількість порцій має бути додатною.')
  }
  const photo = trimmed(raw.photo) || null

  if (!steps.length && prepTime === null && servings === null && !photo) {
    return null
  }
  return {
    id: derivedId(familyId, 'recipe', v1Id),
    mealId: derivedId(familyId, 'meal', v1Id),
    steps,
    prepTime,
    servings,
    photo,
  }
}

/* ==========================================================================
 * Профілі
 * ======================================================================== */

/** Перший колір палітри V1 (`PROFILE_COLORS[0]`) — синій POC. */
const FALLBACK_COLOR = '#4f9dff'

/**
 * Запис профілю V1 → профіль V2. `sharedPlanWith` тут ще НЕ резолвиться:
 * власник може стояти в масиві пізніше, тож посилання зводяться другим проходом.
 *
 * Колір — єдине поле, яке міграція підставляє замість того, щоб відкинути
 * запис. Він інтерфейсний (акцент активного профілю), а не з плану дієтолога,
 * тож правило провенансу його не стосується; та сама підстановка вже стоїть у
 * читанні рядків на боці веба. Втратити через акцент цілий профіль разом із
 * ціллю, коридором і порційною літерою було б непропорційно.
 */
function migrateProfile(
  raw: Record<string, unknown>,
  familyId: string,
): MigratedProfile {
  const v1Id = required(raw.id, 'id профілю')
  const name = required(raw.name, 'ім’я профілю')

  const targetCalories = requiredNumber(
    raw.targetCalories,
    'цільова калорійність',
  )
  if (targetCalories <= 0) {
    throw new Error('цільова калорійність має бути додатною.')
  }
  const corridor = requiredNumber(raw.corridor, 'коридор калорійності')
  if (corridor < 0) {
    throw new Error("коридор калорійності має бути невід'ємним.")
  }

  const letter = trimmed(raw.portion).toUpperCase()
  if (letter && letter !== 'Ж' && letter !== 'Ч') {
    throw new Error('невідома порційна літера «' + letter + '».')
  }

  const color = trimmed(raw.color).toLowerCase()

  /* Порожній масив і null — різні стани: null означає «увесь спільний пул»,
   * порожній — «жодної страви». Тому перевірка саме `Array.isArray`. */
  let mealIds: Array<string> | null = null
  if (Array.isArray(raw.mealIds)) {
    mealIds = raw.mealIds.map((id) => trimmed(id)).filter((id) => id.length > 0)
  } else if (raw.mealIds !== null && raw.mealIds !== undefined) {
    throw new Error('підмножина страв (mealIds) має бути масивом або null.')
  }

  const goals: Record<string, unknown> = isRecord(raw.goals) ? raw.goals : {}

  return {
    id: derivedId(familyId, 'profile', v1Id),
    name,
    targetCalories,
    corridor,
    color: /^#[0-9a-f]{6}$/.test(color) ? color : FALLBACK_COLOR,
    portion: letter ? (letter as PortionLetter) : null,
    // «Сирий» id V1 — зводиться другим проходом, коли всі профілі вже відомі.
    sharedPlanWith: trimmed(raw.sharedPlanWith) || null,
    mealIds,
    goalProtein: optional(goals.protein, 'ціль по білках'),
    goalFat: optional(goals.fat, 'ціль по жирах'),
    goalCarbs: optional(goals.carbs, 'ціль по вуглеводах'),
  }
}

/* ==========================================================================
 * Розбір дампа цілком
 * ======================================================================== */

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Підпис запису для списку пропущеного — назва, id або чесне «без назви». */
function labelOf(raw: unknown, fallback: string): string {
  if (!isRecord(raw)) return fallback
  return trimmed(raw.name) || trimmed(raw.id) || fallback
}

/**
 * Розібрати дамп `localStorage` V1 у рядки схеми V2.
 *
 * `familyId` — сім'я, у яку імпортують: він входить в ім'я, з якого виводяться
 * id (див. `derivedId`), тож без нього результат не був би унікальним між
 * родинами. Функція лишається чистою: той самий дамп і та сама сім'я завжди
 * дають той самий результат, і жодного звернення до БД тут немає.
 *
 * Кидає помилку ЛИШЕ тоді, коли файл узагалі не той: усе решта — це `skipped`.
 */
export function migrateV1(dump: unknown, familyId: string): V1Migration {
  if (!trimmed(familyId)) {
    throw new Error('Не вказано сім’ю, у яку імпортувати.')
  }
  if (!isRecord(dump) || !isRecord(dump.data)) {
    throw new Error(
      'Це не схоже на дамп Meridian V1: у файлі немає розділу «data».',
    )
  }
  const data = dump.data
  const skipped: Array<Skipped> = []

  /* Ключі, які не читаються взагалі, — теж пропущене, і мовчати про них не
   * можна: користувач має знати, що частина сховища була зіпсована. */
  if (isRecord(dump.unreadable)) {
    for (const key of Object.keys(dump.unreadable)) {
      skipped.push({
        what: key,
        reason: 'значення в сховищі не є коректним JSON — розібрати нічого.',
      })
    }
  }

  /* ---- Страви + рецепти ---- */
  const meals: Array<Meal> = []
  const recipes: Array<MigratedRecipe> = []
  /** id V1 → id V2: за ним зводяться смаки й `mealIds` профілів. */
  const mealIdMap = new Map<string, string>()

  const rawMeals = data[MEALS_KEY]
  if (rawMeals !== undefined && !Array.isArray(rawMeals)) {
    skipped.push({
      what: MEALS_KEY,
      reason: 'пул страв у сховищі не є масивом — розібрати нічого.',
    })
  }
  for (const raw of list(rawMeals)) {
    const what = 'Страва «' + labelOf(raw, 'без назви') + '»'
    if (!isRecord(raw)) {
      skipped.push({ what, reason: 'запис страви не є об’єктом.' })
      continue
    }
    const v1Id = trimmed(raw.id)
    let meal: Meal
    try {
      meal = migrateMeal(raw, familyId)
    } catch (error) {
      skipped.push({ what, reason: describe(error) })
      continue
    }
    if (mealIdMap.has(v1Id)) {
      skipped.push({ what, reason: 'страва з таким id уже була в пулі.' })
      continue
    }
    mealIdMap.set(v1Id, meal.id)
    meals.push(meal)

    /* Рецепт відпадає окремо від страви: зіпсовані «час/порції» не привід
     * втратити саму страву — вона з плану дієтолога, а рецепт ні. */
    try {
      const recipe = migrateRecipe(raw, familyId, v1Id)
      if (recipe) recipes.push(recipe)
    } catch (error) {
      skipped.push({ what: what + ', рецепт', reason: describe(error) })
    }
  }

  /* ---- Смаки (MER-18) ---- */
  const prefs: Array<MigratedPref> = []
  const rawPrefs = data[PREFS_KEY]
  if (rawPrefs !== undefined && !isRecord(rawPrefs)) {
    skipped.push({
      what: PREFS_KEY,
      reason: 'смаки у сховищі не є мапою — розібрати нічого.',
    })
  }
  if (isRecord(rawPrefs)) {
    for (const [v1MealId, value] of Object.entries(rawPrefs)) {
      const what = 'Смак страви «' + v1MealId + '»'
      if (value !== 'favorite' && value !== 'disliked') {
        skipped.push({
          what,
          reason: 'невідоме значення смаку «' + trimmed(value) + '».',
        })
        continue
      }
      const mealId = mealIdMap.get(v1MealId)
      // Смак страви, якої немає в перенесеному пулі, не переносимо: зовнішній
      // ключ його не пропустить, а «висячий» смак нічого не означає.
      if (mealId === undefined) {
        skipped.push({
          what,
          reason: 'страви з таким id немає в перенесеному пулі.',
        })
        continue
      }
      prefs.push({
        id: derivedId(familyId, 'meal_pref', v1MealId),
        mealId,
        value,
      })
    }
  }

  /* ---- Профілі (MER-21, MER-17) ---- */
  const profiles: Array<MigratedProfile> = []
  /** id V1 → id V2 профілю: за ним зводиться `sharedPlanWith`. */
  const profileIdMap = new Map<string, string>()
  /** Профіль V2 → «сирий» `sharedPlanWith` із V1, ще не зведений. */
  const sharedRaw = new Map<string, string>()

  const rawProfiles = data[PROFILES_KEY]
  const profileList = isRecord(rawProfiles) ? rawProfiles.profiles : undefined
  if (rawProfiles !== undefined && !Array.isArray(profileList)) {
    skipped.push({
      what: PROFILES_KEY,
      reason: 'профілі у сховищі не є списком — розібрати нічого.',
    })
  }
  for (const raw of list(profileList)) {
    const what = 'Профіль «' + labelOf(raw, 'без імені') + '»'
    if (!isRecord(raw)) {
      skipped.push({ what, reason: 'запис профілю не є об’єктом.' })
      continue
    }
    const v1Id = trimmed(raw.id)
    let profile: MigratedProfile
    try {
      profile = migrateProfile(raw, familyId)
    } catch (error) {
      skipped.push({ what, reason: describe(error) })
      continue
    }
    if (profileIdMap.has(v1Id)) {
      skipped.push({ what, reason: 'профіль з таким id уже був у списку.' })
      continue
    }
    profileIdMap.set(v1Id, profile.id)
    if (profile.sharedPlanWith) {
      sharedRaw.set(profile.id, profile.sharedPlanWith)
    }
    profile.sharedPlanWith = null
    profiles.push(profile)
  }

  /* Другий прохід: зводимо посилання, коли всі профілі вже відомі. */
  for (const profile of profiles) {
    const what = 'Профіль «' + profile.name + '»'

    const rawShared = sharedRaw.get(profile.id)
    if (rawShared !== undefined) {
      const owner = profileIdMap.get(rawShared)
      if (owner === undefined) {
        // Профіль, що ділив план із неперенесеним власником, стає власним:
        // інакше він читав би тиждень, якого немає, і екран був би порожнім
        // без жодного пояснення (MER-17).
        skipped.push({
          what,
          reason:
            'спільний план не перенесено — профіль-власник не потрапив у' +
            ' міграцію. Профіль отримав власний план.',
        })
      } else if (owner === profile.id) {
        skipped.push({
          what,
          reason:
            'профіль ділив план сам із собою. Профіль отримав власний план.',
        })
      } else {
        profile.sharedPlanWith = owner
      }
    }

    if (profile.mealIds === null) continue
    const kept: Array<string> = []
    let dropped = 0
    for (const v1MealId of profile.mealIds) {
      const mealId = mealIdMap.get(v1MealId)
      if (mealId === undefined) dropped += 1
      else kept.push(mealId)
    }
    if (dropped > 0) {
      skipped.push({
        what,
        reason:
          'у підмножині страв профілю ' +
          dropped +
          ' посилань на страви, яких немає в перенесеному пулі — їх прибрано.',
      })
    }
    profile.mealIds = kept
  }

  /* ---- Ключі, які до V2 не їдуть ---- */
  for (const key of Object.keys(data)) {
    const rule = NOT_MIGRATED.find(
      (candidate) =>
        key === candidate.prefix || key.startsWith(candidate.prefix + '.'),
    )
    if (rule) skipped.push({ what: key, reason: rule.reason })
  }

  return { meals, recipes, profiles, prefs, skipped }
}
