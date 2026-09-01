/**
 * Читання локального SQLite (MER-49).
 *
 * Кожен екран бере дані звідси й **ніколи не чекає мережі**: запити йдуть у базу
 * на пристрої, а PowerSync фоном тримає її в збіжності з Postgres (MER-46).
 * `useQuery` сам перепідписується на зміни таблиць, тож окремого «оновити»
 * ніде немає — зміна з іншого пристрою просто з'являється на екрані.
 *
 * Окремого шару кешу (TanStack Query) тут свідомо немає: реактивний запит до
 * локальної бази вже дає рівно те, заради чого його зазвичай беруть, а другий
 * кеш поверх кеша — це те саме «не ускладнювати», лише дорожче.
 *
 * `rows.ts` у ядрі розбирає рядки СУВОРО: зіпсований рядок — помилка, а не тихе
 * значення за замовчуванням. Тому кожне читання ловить її **порядково**: одна
 * биті страва не має гасити весь екран, але й мовчати про неї не можна — текст
 * помилки повертається поруч із даними, і екран показує його як попередження.
 */

import { useMemo } from 'react'
import { useQuery } from '@powersync/react'
import {
  addDays,
  mealFromRow,
  prefsFromRows,
  recipeFromRow,
} from '@meridian/core'
import type {
  CalendarSlot,
  Meal,
  MealType,
  Recipe,
  Row,
  TastePrefs,
} from '@meridian/core'
import { appProfileFromRow, buildCalendarDays, buildWeekView } from './model'
import type { AppProfile, CalendarDayView, WeekView } from './model'

/** Результат читання: дані плюс чесний перелік того, що не розібралося. */
export type Read<T> = {
  data: T
  isLoading: boolean
  problems: Array<string>
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function mapRows<T>(
  rows: ReadonlyArray<Row>,
  map: (row: Row) => T,
): { items: Array<T>; problems: Array<string> } {
  const items: Array<T> = []
  const problems: Array<string> = []
  for (const row of rows) {
    try {
      items.push(map(row))
    } catch (error) {
      problems.push(describe(error))
    }
  }
  return { items, problems }
}

/* Помилка самого запиту — теж проблема, яку користувач має бачити. */
function withQueryError(
  problems: Array<string>,
  error: Error | undefined,
): Array<string> {
  return error ? problems.concat('Запит до бази: ' + error.message) : problems
}

/* ==========================================================================
 * Пул страв — спільний для сім'ї (як `meridian.meals.v1` у V1)
 * ======================================================================== */

export function useMeals(): Read<Array<Meal>> {
  const { data, isLoading, error } = useQuery<Row>(
    'SELECT * FROM meal WHERE deleted_at IS NULL ORDER BY name',
  )
  return useMemo(() => {
    const { items, problems } = mapRows(data, mealFromRow)
    return {
      data: items,
      isLoading,
      problems: withQueryError(problems, error),
    }
  }, [data, error, isLoading])
}

/** Пул як мапа id → страва: план посилається на страви саме за id. */
export function mealsById(meals: ReadonlyArray<Meal>): Map<string, Meal> {
  return new Map(meals.map((meal) => [meal.id, meal]))
}

/* ==========================================================================
 * Рецепт (MER-63)
 * ======================================================================== */

/**
 * Рецепт страви — окремий рядок, який читається **за стравою**.
 *
 * Так фото завжди живе, а не законсервоване: сторінка бере його з рядка
 * `recipe` за `meal_id`, тож замінене фото видно скрізь, звідки страву
 * відкривають (граблі MER-40 і MER-35 — знімок із копією фото всередині).
 *
 * `null` — рецепта немає взагалі, і це нормальний стан: у V1 ці поля були
 * необов'язкові, а PDF їх не дає зовсім.
 */
export function useRecipe(mealId: string): Read<Recipe | null> {
  const { data, isLoading, error } = useQuery<Row>(
    'SELECT * FROM recipe WHERE meal_id = ? AND deleted_at IS NULL LIMIT 1',
    [mealId],
  )
  return useMemo(() => {
    const { items, problems } = mapRows(data, recipeFromRow)
    return {
      data: items.length ? items[0] : null,
      isLoading,
      problems: withQueryError(problems, error),
    }
  }, [data, error, isLoading])
}

/* ==========================================================================
 * Профілі — раціони сім'ї (MER-21)
 * ======================================================================== */

export function useProfiles(): Read<Array<AppProfile>> {
  // `created_at` ставить сервер, тож у щойно створеного профілю він поки NULL.
  // `created_at IS NULL` (0/1) у сортуванні тримає такі рядки в кінці — інакше
  // новий профіль стрибав би на початок списку й повертався назад після sync.
  const { data, isLoading, error } = useQuery<Row>(
    'SELECT * FROM profile WHERE deleted_at IS NULL' +
      ' ORDER BY created_at IS NULL, created_at, name',
  )
  return useMemo(() => {
    const { items, problems } = mapRows(data, appProfileFromRow)
    return {
      data: items,
      isLoading,
      problems: withQueryError(problems, error),
    }
  }, [data, error, isLoading])
}

/* ==========================================================================
 * Смаки (MER-18) — правило добору в генераторі, не косметика
 * ======================================================================== */

export function useTastePrefs(): Read<TastePrefs> {
  const { data, isLoading, error } = useQuery<Row>(
    'SELECT * FROM meal_pref WHERE deleted_at IS NULL',
  )
  return useMemo(
    () => ({
      data: prefsFromRows(data),
      isLoading,
      problems: withQueryError([], error),
    }),
    [data, error, isLoading],
  )
}

/** Смак конкретної страви — для кнопок «♥» / «🚫». */
export function prefOf(
  prefs: TastePrefs,
  mealId: string,
): 'favorite' | 'disliked' | null {
  if (prefs.favorites.has(mealId)) return 'favorite'
  if (prefs.disliked.has(mealId)) return 'disliked'
  return null
}

/* ==========================================================================
 * Тиждень: план власника + його слоти
 * ======================================================================== */

/**
 * Порядок «найпізніше покоління плану» — один на всі вибірки з `week_plan`.
 *
 * Константа, а не два однакові рядки: `useWeek` і `useDayPlan` відповідають на
 * те саме питання («який план чинний для цієї дати»), і якщо їхні `ORDER BY`
 * розійдуться, екран тижня й підсумок дня в календарі покажуть цілі з РІЗНИХ
 * поколінь одного профілю.
 *
 * **`generated_at` — це `timestamptz`, але в локальному SQLite він лежить
 * ТЕКСТОМ, і форма тексту залежить від того, хто записав рядок** (те саме
 * розрізнення описує `formatMoment` у `format.ts`): пристрій пише ISO з `T`
 * («2026-08-29T09:00:00.000Z»), а реплікація віддає серверну форму з пробілом
 * («2026-08-29 09:00:00+00»). У ASCII `'T'` (0x54) більший за пробіл (0x20),
 * тож голий `ORDER BY generated_at DESC` сортує не за часом, а за роздільником:
 * несинхронізований план, згенерований о 09:00, обходив би синхронізований о
 * 10:00 — і екран брав би `target_calories`/`used_corridor` СТАРІШОГО
 * покоління. Ціна помилки не косметична: із них рахується вердикт «поза
 * коридором» у календарі й попередження «Профіль змінився після генерації».
 *
 * Тому сортуємо за нормалізованим «YYYY-MM-DDTHH:MM:SS»: `substr(…, 1, 19)`
 * відрізає хвіст, який у двох форм різний (`.000Z` проти `+00`), а `replace`
 * зводить роздільник. Обидві форми — UTC, тож після цього текстове порівняння
 * знову означає порівняння часу.
 *
 * `id DESC` останнім, як і в `useCalendarDays`: два покоління в ту саму секунду
 * мусять розв'язуватись ОДНАКОВО на всіх пристроях, а не «як поверне SQLite».
 *
 * ⚠️ **Не спрощувати назад до `ORDER BY generated_at DESC`** — воно виглядає
 * тотожним рівно доти, доки всі рядки записані з одного боку.
 */
const LATEST_PLAN_ORDER =
  ' ORDER BY start_date DESC,' +
  " replace(substr(generated_at, 1, 19), ' ', 'T') DESC, id DESC LIMIT 1"

/**
 * Поточний план профілю-власника. «Поточний» — найпізніший за датою початку:
 * тиждень, згенерований наперед, стає поточним, щойно почнеться. У V1 план був
 * рівно один на профіль (`meridian.week.v1.<id>`); тут рядки накопичуються, і
 * це навмисно — минулі тижні лишаються історією календаря.
 */
export function useWeek(
  ownerId: string | null,
  meals: ReadonlyArray<Meal>,
  todayKey: string,
): Read<WeekView | null> {
  const planQuery = useQuery<Row>(
    'SELECT * FROM week_plan WHERE profile_id = ? AND deleted_at IS NULL' +
      LATEST_PLAN_ORDER,
    [ownerId ?? ''],
  )
  // Через довжину, а не `data[0] ?? null`: у цьому пакеті індексний доступ
  // типізується як завжди визначений, тож `??` тут був би мертвим кодом.
  const planRow: Row | null = planQuery.data.length ? planQuery.data[0] : null

  /* Слоти беруться за календарним ключем (профіль + дата), а НЕ за
   * `week_plan_id` — це пара до виведених id слотів (MER-66). Двоє офлайн
   * генерують той самий тиждень уперше: слоти сходяться в один набір рядків,
   * але кожен пристрій вставив СВІЙ рядок `week_plan` (у нього немає
   * унікального природного ключа), і `week_plan_id` злитих слотів вказує лише
   * на один із двох. Вибірка за `week_plan_id` на другому пристрої дала б
   * живий план із порожнім календарем. Календарний ключ цього не боїться:
   * після `saveWeek` (який переписує слоти за природним ключем) усі живі
   * слоти з датами від початку плану належать поточному поколінню — чиїм би
   * рядком плану воно не було представлене. */
  const slotQuery = useQuery<Row>(
    'SELECT * FROM plan_slot WHERE profile_id = ? AND date >= ?' +
      ' AND deleted_at IS NULL ORDER BY day_index, date',
    // Без плану профіль порожній рядок — вибірка свідомо не збігається ні з чим.
    [planRow ? (ownerId ?? '') : '', planRow ? String(planRow.start_date) : ''],
  )

  const pool = useMemo(() => mealsById(meals), [meals])

  return useMemo(() => {
    const isLoading = planQuery.isLoading || slotQuery.isLoading
    const problems = withQueryError(
      withQueryError([], planQuery.error),
      slotQuery.error,
    )
    if (!planRow) return { data: null, isLoading, problems }
    return {
      data: buildWeekView(planRow, slotQuery.data, pool, todayKey),
      isLoading,
      problems,
    }
  }, [
    planRow,
    planQuery.error,
    planQuery.isLoading,
    pool,
    slotQuery.data,
    slotQuery.error,
    slotQuery.isLoading,
    todayKey,
  ])
}

/**
 * Слоти календаря профілю за останні дні ПЕРЕД `startDate` — вікно антиповтору
 * через межу тижнів (MER-29). Беремо з усіх планів профілю, а не лише з
 * поточного: учорашній день міг належати попередньому тижню, і саме через це
 * V1 колись і повторював страву на межі.
 */
export function usePrecedingSlots(
  ownerId: string | null,
  fromDate: string,
  toDate: string,
): Array<CalendarSlot> {
  const { data } = useQuery<Row>(
    'SELECT date, slot, meal_id FROM plan_slot' +
      ' WHERE profile_id = ? AND deleted_at IS NULL AND date >= ? AND date < ?',
    [ownerId ?? '', fromDate, toDate],
  )
  return useMemo(
    () =>
      data.map((row) => ({
        date: String(row.date),
        slot: String(row.slot) as MealType,
        mealId: String(row.meal_id),
      })),
    [data],
  )
}

/* ==========================================================================
 * Календар (MER-61): дні за датами, межі історії, план дня
 * ======================================================================== */

/**
 * Дні календаря профілю в діапазоні дат (включно з обома межами). Читається за
 * календарним ключем «профіль + дата», а не за `week_plan_id` — з тієї ж
 * причини, що й `useWeek` (MER-66): день міг бути записаний будь-яким
 * поколінням плану, і календарю байдуже, яким саме.
 */
export function useCalendarDays(
  ownerId: string | null,
  fromDate: string,
  toDate: string,
  meals: ReadonlyArray<Meal>,
): Read<ReadonlyMap<string, CalendarDayView>> {
  // `ORDER BY` тут не для показу — дні сортує сам календар. Він потрібен, щоб
  // дублікат `(дата, слот)` розв'язувався ОДНАКОВО на всіх пристроях: рядки з
  // випадковими id, створені до MER-66, ще лежать у базах, і без порядку
  // «останній виграє» (див. `buildCalendarDays`) означало б «як поверне
  // SQLite» — тобто по-різному на двох телефонах. `id` останнім: він
  // однаковий скрізь навіть тоді, коли позначки часу записані по-різному.
  //
  // Нормалізації роздільника, як у `LATEST_PLAN_ORDER`, тут НЕ треба:
  // `updated_at` пише виключно сервер (`SERVER_OWNED_COLUMNS` у
  // `connector.ts` викидає його з вивантаження), тож усі непорожні значення
  // мають одну форму. У щойно записаного локально рядка він порожній — NULL
  // у SQLite сортується першим, тобто такий рядок свідомо програє
  // синхронізованому дублікату, поки сервер не підтвердить запис.
  const { data, isLoading, error } = useQuery<Row>(
    'SELECT * FROM plan_slot WHERE profile_id = ? AND deleted_at IS NULL' +
      ' AND date >= ? AND date <= ? ORDER BY updated_at, id',
    [ownerId ?? '', fromDate, toDate],
  )
  const pool = useMemo(() => mealsById(meals), [meals])
  return useMemo(
    () => ({
      data: buildCalendarDays(data, pool),
      isLoading,
      problems: withQueryError([], error),
    }),
    [data, error, isLoading, pool],
  )
}

/**
 * Скільки днів профілю взагалі мають план — підзаголовок екрана й ознака
 * «історія порожня» (`bounds` із V1, зведений до того, що справді читають).
 */
export function usePlannedDayCount(ownerId: string | null): Read<number> {
  const { data, isLoading, error } = useQuery<{ days: number | null }>(
    'SELECT count(DISTINCT date) AS days FROM plan_slot' +
      ' WHERE profile_id = ? AND deleted_at IS NULL',
    [ownerId ?? ''],
  )
  return useMemo(() => {
    const days = data.length ? Number(data[0].days) : 0
    return {
      data: Number.isFinite(days) ? days : 0,
      isLoading,
      problems: withQueryError([], error),
    }
  }, [data, error, isLoading])
}

/**
 * Ціль і коридор плану, що покривав дату, — для підсумку дня в календарі.
 *
 * Береться найпізніший план із `start_date <= date`: після перегенерації
 * посеред тижня слоти від її старту переписані новим поколінням, а дні до
 * старту лишилися від попереднього — саме його ціль для них і чинна. null,
 * якщо жоден план дату не покриває або в рядку немає чисел: показати «якусь»
 * ціль гірше, ніж не показати жодної.
 */
export function useDayPlan(
  ownerId: string | null,
  date: string,
): Read<{ target: number; corridor: number } | null> {
  const { data, isLoading, error } = useQuery<Row>(
    'SELECT * FROM week_plan WHERE profile_id = ? AND deleted_at IS NULL' +
      ' AND start_date <= ?' +
      LATEST_PLAN_ORDER,
    [ownerId && date ? ownerId : '', date],
  )
  return useMemo(() => {
    const problems = withQueryError([], error)
    const nothing = { data: null, isLoading, problems }
    if (!data.length) return nothing

    const row = data[0]
    const days = Number(row.days)
    const target = Number(row.target_calories)
    const corridor = Number(row.used_corridor)
    if (
      !Number.isFinite(days) ||
      days < 1 ||
      !Number.isFinite(target) ||
      !Number.isFinite(corridor)
    ) {
      return nothing
    }

    // `addDays` кидає на даті не у форматі «YYYY-MM-DD», а `start_date` у
    // клієнтській схемі — звичайний TEXT без NOT NULL. Ловимо порядково, як
    // усі читання в цьому файлі: битий рядок плану має стати попередженням
    // поруч із днем, а не білим екраном замість календаря.
    try {
      if (date > addDays(String(row.start_date), days - 1)) return nothing
    } catch (cause) {
      return { data: null, isLoading, problems: problems.concat(describe(cause)) }
    }

    return { data: { target, corridor }, isLoading, problems }
  }, [data, date, error, isLoading])
}

/* ==========================================================================
 * Список покупок (MER-62)
 * ======================================================================== */

/** Список `?, ?, ?` під `IN` — рівно стільки місць, скільки значень. */
function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

/**
 * Дата, пізніша за будь-який план, — нижня межа вибірки, коли планів немає
 * зовсім. `IN ()` і `>= ''` SQLite розуміє по-різному в різних версіях, а
 * свідомо недосяжна межа читається однозначно: «жодного рядка».
 */
const NO_DATE = '9999-12-31'

/** Порожній `IN ()` — синтаксична помилка; порожній uuid не збігається ні з чим. */
function inList(ids: ReadonlyArray<string>): Array<string> {
  return ids.length ? [...ids] : ['']
}

/**
 * Наскільки глибоко в минуле дивиться вибірка слотів списку покупок.
 *
 * Це НЕ правило показу, а лише стеля, щоб не тягнути з бази всю історію
 * календаря: справжню межу — дату початку свого плану — накладає фільтр у
 * пам'яті. Тому число має бути свідомо завеликим: план завжди починається
 * сьогоднішнім днем (`saveWeek`), тож навіть давно не перегенерований тиждень
 * сюди вміщується із запасом.
 */
const PLAN_HISTORY_DAYS = 90

/**
 * Поточні плани КІЛЬКОХ профілів-власників — джерело списку покупок.
 *
 * Чому не викликати `useWeek` у циклі: власників стільки, скільки профілів у
 * сім'ї, а хуки в циклі викликати не можна. Тому обидва запити беруть усіх
 * одразу.
 *
 * «Поточний план власника» тут означає рівно те саме, що й у `useWeek` — і це
 * не збіг, а вимога: список покупок мусить збиратися зі страв, які видно на
 * екрані «Тиждень», інакше в магазин поїде інший тиждень. Тому корельований
 * підзапит закінчується тим самим `LATEST_PLAN_ORDER`: правило одне, записане
 * один раз.
 *
 * Слоти беруться за календарним ключем «профіль + дата», як усюди після MER-66,
 * і фільтруються датою початку СВОГО плану вже в пам'яті: у SQL це була б різна
 * межа для кожного власника.
 *
 * **Нижня межа вибірки слотів не залежить від результату запиту планів**, хоч
 * найраніший `start_date` і був би точнішою межею. `useQuery` не переходить у
 * «завантажується» повторно, коли міняються ПАРАМЕТРИ (це `isFetching`, не
 * `isLoading`), тож межа, порахована з планів, давала б стабільний кадр, на
 * якому плани вже приїхали, а слоти під нову межу — ще ні: екран чесно
 * повідомляв би «у стравах цього тижня немає інгредієнтів» для повного плану.
 * Груба межа від сьогоднішньої дати цього не робить: обидва запити стартують
 * з тими самими параметрами, і `isLoading` знову означає те, що каже. Точність
 * від цього не страждає — рівно ту саму відсікає фільтр у пам'яті нижче.
 */
export function useOwnerWeeks(
  ownerIds: ReadonlyArray<string>,
  meals: ReadonlyArray<Meal>,
  todayKey: string,
): Read<Array<WeekView>> {
  const owners = inList(ownerIds)
  const planQuery = useQuery<Row>(
    'SELECT * FROM week_plan w WHERE w.deleted_at IS NULL' +
      ` AND w.profile_id IN (${placeholders(owners.length)})` +
      ' AND w.id = (SELECT x.id FROM week_plan x' +
      ' WHERE x.profile_id = w.profile_id AND x.deleted_at IS NULL' +
      LATEST_PLAN_ORDER +
      ')',
    owners,
  )

  const slotQuery = useQuery<Row>(
    'SELECT * FROM plan_slot WHERE deleted_at IS NULL' +
      ` AND profile_id IN (${placeholders(owners.length)})` +
      // `updated_at, id` — той самий розв'язувач дублікатів, що й у
      // `useCalendarDays`, і тут він потрібен ще й через відбиток списку: поки
      // дублікат клітинки живий, «останній виграє» в `buildWeekView` має дати
      // на двох пристроях ОДИН і той самий id слота, інакше однаковий на екрані
      // список дасть різні відбитки. `day_index, date` попереду лишається:
      // саме за ним `buildWeekView` бере номер дня.
      ' AND date >= ? ORDER BY day_index, date, updated_at, id',
    [...owners, todayKey ? addDays(todayKey, -PLAN_HISTORY_DAYS) : NO_DATE],
  )

  const pool = useMemo(() => mealsById(meals), [meals])

  return useMemo(() => {
    const slotsByOwner = new Map<string, Array<Row>>()
    for (const row of slotQuery.data) {
      const ownerId = String(row.profile_id)
      const found = slotsByOwner.get(ownerId)
      if (found) found.push(row)
      else slotsByOwner.set(ownerId, [row])
    }

    const views = planQuery.data.map((planRow) => {
      const ownerId = String(planRow.profile_id)
      const start = String(planRow.start_date)
      const slots = (slotsByOwner.get(ownerId) ?? []).filter(
        (row) => String(row.date) >= start,
      )
      return buildWeekView(planRow, slots, pool, todayKey)
    })

    return {
      data: views,
      isLoading: planQuery.isLoading || slotQuery.isLoading,
      problems: withQueryError(
        withQueryError([], planQuery.error),
        slotQuery.error,
      ),
    }
  }, [
    planQuery.data,
    planQuery.error,
    planQuery.isLoading,
    pool,
    slotQuery.data,
    slotQuery.error,
    slotQuery.isLoading,
    todayKey,
  ])
}

/**
 * Позначки «куплено» під заданим відбитком планів — мапа `item_key` → `checked`.
 *
 * Фільтр за відбитком і Є скиданням списку після перегенерації (рішення MER-55):
 * позначки старого походу в магазин лишаються в базі, але в новий список просто
 * не потрапляють. Прибирає їх окремо `clearStaleChecks` — це прибирання, а не
 * умова правильності.
 *
 * `checked` — прапорець, а не наявність рядка: знята позначка це UPDATE, який
 * LWW розсудить за `updated_at`, а не видалення, що конкурує зі вставкою іншого
 * пристрою.
 */
export function useShoppingChecks(
  fingerprint: string,
): Read<ReadonlyMap<string, boolean>> {
  const { data, isLoading, error } = useQuery<Row>(
    'SELECT item_key, checked FROM shopping_check' +
      ' WHERE fingerprint = ? AND deleted_at IS NULL',
    /* Порожній відбиток (плану ще немає) шукаємо як є: колонка під CHECK на
     * непорожнє значення, тож порожнього рядка в базі не буває — вибірка
     * свідомо не збігається ні з чим, і окремої заглушки для цього не треба. */
    [fingerprint],
  )
  return useMemo(() => {
    const checks = new Map<string, boolean>()
    for (const row of data) {
      // SQLite не має boolean: 1/0. Порожній ключ у базу не пройде (CHECK), але
      // читання все одно не має права видати його за позицію списку.
      const key = String(row.item_key)
      if (key) checks.set(key, Number(row.checked) !== 0)
    }
    return {
      data: checks,
      isLoading,
      problems: withQueryError([], error),
    }
  }, [data, error, isLoading])
}

/**
 * Чи використовується страва хоч в одному живому слоті плану. Видалення такої
 * страви лишило б у плані дірку (див. `model.ts`), тож екран «Страви» його
 * блокує й каже, чому.
 */
export function useMealUsage(mealId: string | null): number {
  const { data } = useQuery<{ used: number }>(
    'SELECT count(*) AS used FROM plan_slot' +
      ' WHERE meal_id = ? AND deleted_at IS NULL',
    [mealId ?? ''],
  )
  return data.length ? data[0].used : 0
}
