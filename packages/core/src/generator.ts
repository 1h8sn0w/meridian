/**
 * MER-10 — Генератор тижня (ядро продукту), перенесений з V1 `WeekGenerator`.
 *
 * Збирає план на N днів із пулу страв: по одній страві на кожен слот дня так,
 * щоб виконувались чотири правила дієтолога:
 *
 *   1. Тип збігався — сніданок лише на сніданок і т.д.
 *   2. Калорійність дня трималась у коридорі від цілі (типово ±100 ккал).
 *   3. Антиповтор — страва не частіше, ніж раз на N днів.
 *   4. Мікс планів — тиждень поєднує страви з різних джерел, а не копіює одне.
 *
 * Підхід той самий: задача про виконання обмежень, жадібний добір із
 * випадковістю й обмеженим бектрекуванням (MER-27). День збирається перебором з
 * поверненням по слотах, тиждень — DFS між днями; якщо не складається, коридор
 * поступово послаблюється, і про це чесно повідомляється у `warnings`.
 *
 * Що змінилось проти V1 і чому:
 *
 *  - **жодних сховищ.** Пул, профіль і смаки приходять аргументами; ядро не
 *    знає ні про localStorage, ні про SQLite (інструкція каркаса, §1);
 *  - **страви без калорійності не беруть участі в доборі.** У V2 `calories`
 *    nullable, а коридор — це порівняння чисел. Підставити нуль означало б
 *    вигадати значення, чого правило провенансу не дозволяє навіть тимчасово,
 *    тож такі страви виключаються, і генератор каже про це вголос;
 *  - **джерело випадковості — параметр.** `random` типово `Math.random`, але
 *    його можна підмінити: інакше поведінку генератора неможливо перевірити
 *    юніт-тестом.
 */

import { dayCalories } from './provenance.ts'
import {
  allWeekMeals,
  isMixedWeek,
  mixPossibleIn,
  poolPlans,
  weekSources,
} from './plans.ts'
import { poolForProfile } from './profile.ts'
import { MEAL_TYPES, MEAL_TYPE_LABELS, NO_PREFS } from './types.ts'
import type {
  Meal,
  MealType,
  PlanDay,
  PlannedMeal,
  Profile,
  Result,
  TastePrefs,
  WeekParams,
  WeekPlan,
} from './types.ts'

/** Параметри за замовчуванням. Ціль і коридор — у ккал. */
export const DEFAULTS: Readonly<WeekParams> = {
  targetCalories: 2000, // ціль дієтолога на день
  corridor: 100, // допустиме відхилення дня: ±100 ккал
  antiRepeatDays: 3, // страва не частіше, ніж раз на 3 дні
  days: 7,
}

const CORRIDOR_STEP = 50 // крок послаблення коридору
const CORRIDOR_MAX = 500 // далі не послаблюємо — чесно повідомляємо про невдачу
const WEEK_TRIES = 25 // спроб зібрати тиждень на кожному рівні коридору

/* MER-27: обмежене бектрекування між днями. Раніше день обирався жадібно й
 * назад не переглядався — за вузьких умов (точний коридор, тісний антиповтор)
 * валідний тиждень існував, а спроба «глухла» на пізньому дні. Тепер тиждень
 * шукаємо DFS із поверненням: на кожному дні розглядаємо до DAY_CANDS
 * варіантів, а вся спроба обмежена стелею WEEK_NODE_BUDGET (антизависання). */
const DAY_CANDS = 24 // варіантів дня на вузлі пошуку
const WEEK_NODE_BUDGET = 12000 // стеля розстановок дня на одну спробу

/* MER-18: вага улюбленої страви в доборі. Не «завжди перша» — інакше кожен
 * тиждень був би той самий; просто вчетверо більший шанс стати попереду інших
 * кандидатів слота. Правила калорій, типу й антиповтору не чіпаємо. */
const FAVORITE_WEIGHT = 4

/** Джерело випадковості: `Math.random`-сумісна функція [0, 1). */
export type Random = () => number

export type GenerateOptions = {
  targetCalories?: number
  corridor?: number
  antiRepeatDays?: number
  days?: number
  /** MER-21: підставляє свої ціль і коридор; явні опції мають пріоритет. */
  profile?: Profile | null
  /**
   * MER-29: id страв попередніх РЕАЛЬНИХ днів, найближчий перший. Заповнюють
   * вікно антиповтору перед днем 0, щоб перший день нового тижня не повторював
   * страв останніх днів попереднього. Будується `calendar.ts`.
   */
  precedingDays?: ReadonlyArray<ReadonlyArray<string>>
  /** MER-18: смаки сім'ї. Типово — порожні. */
  prefs?: TastePrefs | null
  random?: Random
}

export type GenerateResult = Result<WeekPlan>

type ByType = Record<MealType, Array<PlannedMeal>>

/** Вага страви в доборі (MER-18) або null, коли всі ваги однакові. */
type WeightOf = ((meal: PlannedMeal) => number) | null

/**
 * Перетасована копія масиву з вагами — джерело випадковості генератора.
 * Алгоритм Ефраїмідіса–Спіракіса: ключ = U^(1/вага), сортування за спаданням
 * ключа. Це вибірка без повторів із вагами: за однакових ваг вироджується у
 * звичайний рівномірний перетас.
 */
function weightedShuffle(
  items: ReadonlyArray<PlannedMeal>,
  weightOf: WeightOf,
  random: Random,
): Array<PlannedMeal> {
  return items
    .map((item) => {
      const w = weightOf ? Number(weightOf(item)) : 1
      return { item, key: Math.pow(random(), 1 / (w > 0 ? w : 1)) }
    })
    .sort((a, b) => b.key - a.key)
    .map((x) => x.item)
}

/**
 * Зібрати варіанти одного дня: по страві на слот, сума калорій у
 * [minSum, maxSum], без страв із `bannedIds` (антиповтор). Перебір з
 * поверненням по слотах — вужчі (з меншим вибором) першими; гілки без шансів на
 * суму відсікаються за мінімально/максимально можливим залишком.
 *
 * `weightOf` (MER-18): важчі кандидати частіше стають попереду, тож частіше
 * потрапляють у перші знайдені розстановки дня.
 */
function dayCandidates(
  byType: ByType,
  bannedIds: ReadonlySet<string>,
  minSum: number,
  maxSum: number,
  limit: number,
  weightOf: WeightOf,
  random: Random,
): Array<Record<MealType, PlannedMeal>> {
  const slots = MEAL_TYPES.map((type) => ({
    type,
    candidates: weightedShuffle(
      byType[type].filter((meal) => !bannedIds.has(meal.id)),
      weightOf,
      random,
    ),
  }))
  if (slots.some((slot) => slot.candidates.length === 0)) return []
  slots.sort((a, b) => a.candidates.length - b.candidates.length)

  // Межі суми калорій слотів i..кінець — для відсікання гілок.
  const minRest = new Array<number>(slots.length + 1).fill(0)
  const maxRest = new Array<number>(slots.length + 1).fill(0)
  for (let i = slots.length - 1; i >= 0; i--) {
    const cals = (slots[i] as (typeof slots)[number]).candidates.map(
      (meal) => meal.calories,
    )
    minRest[i] = (minRest[i + 1] as number) + Math.min(...cals)
    maxRest[i] = (maxRest[i + 1] as number) + Math.max(...cals)
  }

  const out: Array<Record<MealType, PlannedMeal>> = []
  const chosen: Partial<Record<MealType, PlannedMeal>> = {}

  function dfs(i: number, sum: number): void {
    if (out.length >= limit) return
    if (i === slots.length) {
      if (sum >= minSum && sum <= maxSum) {
        // Тут заповнені всі слоти MEAL_TYPES — інакше рекурсія сюди не дійшла б.
        out.push({ ...chosen } as Record<MealType, PlannedMeal>)
      }
      return
    }
    const slot = slots[i] as (typeof slots)[number]
    for (const meal of slot.candidates) {
      if (out.length >= limit) return
      const next = sum + meal.calories
      if (next + (minRest[i + 1] as number) > maxSum) continue // вже забагато
      if (next + (maxRest[i + 1] as number) < minSum) continue // вже не доберемо
      chosen[slot.type] = meal
      dfs(i + 1, next)
    }
  }

  dfs(0, 0)
  return out
}

/**
 * Одна спроба зібрати тиждень пошуком у глибину з поверненням між днями
 * (MER-27). Антиповтор для дня d: заборонені страви днів d-1 … d-(N-1) із
 * поточної часткової збірки. Якщо день не складається — повертаємось і пробуємо
 * інший варіант попереднього дня. Порядок кандидатів перетасовано, тож повторні
 * спроби дають різні тижні.
 *
 * `precedingDays` (MER-29) заповнює вікно антиповтору перед днем 0.
 * Повертає масив днів або null (розв'язку не знайдено в межах бюджету).
 */
function tryBuildWeek(
  byType: ByType,
  days: number,
  antiRepeatDays: number,
  minSum: number,
  maxSum: number,
  precedingDays: ReadonlyArray<ReadonlyArray<string>>,
  weightOf: WeightOf,
  random: Random,
): Array<Record<MealType, PlannedMeal>> | null {
  const week: Array<Record<MealType, PlannedMeal>> = []
  let budget = WEEK_NODE_BUDGET

  function bansFor(d: number): Set<string> {
    const banned = new Set<string>()
    for (let b = d - antiRepeatDays + 1; b < d; b++) {
      if (b >= 0) {
        const day = week[b] as Record<MealType, PlannedMeal>
        for (const type of MEAL_TYPES) banned.add(day[type].id)
      } else {
        // b < 0 → попередній календарний день на позиції -b-1 (MER-29).
        const preceding = precedingDays[-b - 1]
        if (preceding) for (const id of preceding) banned.add(id)
      }
    }
    return banned
  }

  function dfs(d: number): boolean {
    if (d === days) return true
    if (budget <= 0) return false
    const candidates = dayCandidates(
      byType,
      bansFor(d),
      minSum,
      maxSum,
      DAY_CANDS,
      weightOf,
      random,
    )
    for (const meals of candidates) {
      if (budget <= 0) return false
      budget--
      week.push(meals)
      if (dfs(d + 1)) return true
      week.pop()
    }
    return false
  }

  return dfs(0) ? week : null
}

/** Слоти дня → день плану з порахованою калорійністю. */
function toPlanDay(meals: Record<MealType, PlannedMeal>): PlanDay {
  return { meals, calories: dayCalories(meals) }
}

/**
 * Згенерувати тиждень із пулу страв.
 *
 * @param pool    страви, доступні генератору. Якщо задано `options.profile` з
 *                підмножиною `mealIds` — пул звужується до неї (MER-21).
 * @param options параметри поверх `DEFAULTS`; див. `GenerateOptions`.
 */
export function generateWeek(
  pool: ReadonlyArray<Meal>,
  options: GenerateOptions = {},
): GenerateResult {
  const profile = options.profile ?? null
  const random = options.random ?? Math.random

  // MER-21: ціль і коридор беруться з профілю, явні опції мають пріоритет.
  const target = Number(
    options.targetCalories ??
      profile?.targetCalories ??
      DEFAULTS.targetCalories,
  )
  if (!Number.isFinite(target) || target <= 0) {
    return {
      ok: false,
      error: 'Цільова калорійність дня має бути додатним числом.',
    }
  }

  const rawDays = Math.floor(Number(options.days ?? DEFAULTS.days))
  const days = Math.max(1, Number.isFinite(rawDays) ? rawDays : DEFAULTS.days)

  const rawCorridor = Number(
    options.corridor ?? profile?.corridor ?? DEFAULTS.corridor,
  )
  const corridor = Math.max(
    0,
    Number.isFinite(rawCorridor) ? rawCorridor : DEFAULTS.corridor,
  )

  // Антиповтор понад довжину тижня еквівалентний «без повторів узагалі».
  const rawAnti = Math.floor(
    Number(options.antiRepeatDays ?? DEFAULTS.antiRepeatDays),
  )
  const antiRepeatDays = Math.min(
    Math.max(1, Number.isFinite(rawAnti) ? rawAnti : 1),
    days,
  )

  const precedingDays = options.precedingDays ?? []
  const prefs = options.prefs ?? NO_PREFS
  const params: WeekParams = {
    targetCalories: target,
    corridor,
    antiRepeatDays,
    days,
  }

  const visible = poolForProfile(pool, profile)

  /* Провенанс: страву без калорійності генератор поставити не може — коридор це
   * порівняння чисел, а нуля в джерелі немає. Не вигадуємо, а виключаємо. */
  const planned = visible.filter(
    (meal): meal is PlannedMeal =>
      typeof meal.calories === 'number' && Number.isFinite(meal.calories),
  )
  const withoutCalories = visible.length - planned.length

  const byTypeOf = (list: ReadonlyArray<PlannedMeal>): ByType => {
    const out = {} as ByType
    for (const type of MEAL_TYPES) {
      out[type] = list.filter((meal) => meal.type === type)
    }
    return out
  }

  /* Достатність пулу: вікно антиповтору вимагає щонайменше N страв кожного типу. */
  const shortageOf = (byType: ByType): Array<string> =>
    MEAL_TYPES.filter((type) => byType[type].length < antiRepeatDays).map(
      (type) =>
        MEAL_TYPE_LABELS[type] +
        ' — ' +
        byType[type].length +
        ' (потрібно ≥ ' +
        antiRepeatDays +
        ')',
    )

  // MER-18: улюблені отримують вагу в доборі; небажані виключаються окремою
  // спробою (див. `attempts` нижче).
  const weightOf: WeightOf = prefs.favorites.size
    ? (meal) => (prefs.favorites.has(meal.id) ? FAVORITE_WEIGHT : 1)
    : null

  // MER-30: мікс можливий, лише коли ЖОДЕН єдиний план не покриває весь пул.
  const mixPossibleFull = mixPossibleIn(planned)

  /* Спільні для всіх спроб попередження — те, що стосується самого пулу. */
  const poolWarnings: Array<string> = []
  if (withoutCalories > 0) {
    poolWarnings.push(
      'Без калорійності: ' +
        withoutCalories +
        ' страв(и) не брали участі в доборі — коридор дня рахується лише за відомими цифрами.',
    )
  }

  // Рівні коридору: від запитаного кроком CORRIDOR_STEP до CORRIDOR_MAX. Крок
  // може «перестрибнути» максимум (125→175→…→475→525), тож додаємо сам
  // CORRIDOR_MAX окремою фінальною спробою — інакше обіцяний ±500 ніколи не
  // тестується (MER-38). Якщо запит уже ширший за максимум — пробуємо його.
  const corridorLevels: Array<number> = []
  for (let c = corridor; c < CORRIDOR_MAX; c += CORRIDOR_STEP) {
    corridorLevels.push(c)
  }
  corridorLevels.push(Math.max(corridor, CORRIDOR_MAX))
  const maxCorridorTried = corridorLevels[corridorLevels.length - 1] as number

  /** Повний пошук на заданому пулі: достатність, послаблення коридору, мікс. */
  function buildFrom(list: ReadonlyArray<PlannedMeal>): GenerateResult {
    const byType = byTypeOf(list)
    const shortage = shortageOf(byType)
    if (shortage.length) {
      return {
        ok: false,
        error:
          'Недостатньо страв у пулі. Правило «не частіше, ніж раз на ' +
          antiRepeatDays +
          ' дн.» вимагає щонайменше ' +
          antiRepeatDays +
          ' страв кожного типу, а зараз: ' +
          shortage.join('; ') +
          '. Додайте страви на екрані «Страви» або зменшіть антиповтор.',
      }
    }

    const universe = poolPlans(list)
    const mixPossible = mixPossibleIn(list)

    const finish = (
      planDays: Array<PlanDay>,
      usedCorridor: number,
      warnings: Array<string>,
    ): GenerateResult => ({
      ok: true,
      days: planDays,
      params,
      usedCorridor,
      sources: weekSources(planDays),
      // MER-30: чи тиждень справді зміксований (структурно) і чи мікс був
      // узагалі можливий — щоб single-source-релаксацію було видно окремо.
      mixed: isMixedWeek(planDays, universe),
      mixPossible,
      warnings: poolWarnings.concat(warnings),
    })

    // Пробуємо з запитаним коридором; не виходить — послаблюємо крок за кроком.
    let fallback: { days: Array<PlanDay>; usedCorridor: number } | null = null

    for (const c of corridorLevels) {
      for (let attempt = 0; attempt < WEEK_TRIES; attempt++) {
        const week = tryBuildWeek(
          byType,
          days,
          antiRepeatDays,
          target - c,
          target + c,
          precedingDays,
          weightOf,
          random,
        )
        if (!week) continue
        const planDays = week.map(toPlanDay)
        if (mixPossible && !isMixedWeek(planDays, universe)) {
          if (!fallback) fallback = { days: planDays, usedCorridor: c }
          continue // мікс обов'язковий — пробуємо ще
        }
        const warnings: Array<string> = []
        if (c > corridor) {
          warnings.push(
            'Не вдалося втриматись у ±' +
              corridor +
              ' ккал — коридор розширено до ±' +
              c +
              ' ккал.',
          )
        }
        if (!mixPossible) {
          // MER-18: якщо мікс убили саме позначки «не подобається» — кажемо прямо.
          warnings.push(
            mixPossibleFull
              ? 'Позначки «не подобається» звузили пул — мікс планів став неможливим.'
              : 'Пул не дозволяє мікс планів — усі страви покриває один план.',
          )
        }
        return finish(planDays, c, warnings)
      }
    }

    // MER-30: single-source — це релаксація, і вона названа вголос, а не видана
    // за звичайний успіх.
    if (fallback) {
      const warnings = [
        'Не вдалося поєднати різні плани — тиждень зібрано зі страв одного джерела.',
      ]
      if (fallback.usedCorridor > corridor) {
        warnings.push(
          'Коридор розширено до ±' + fallback.usedCorridor + ' ккал.',
        )
      }
      return finish(fallback.days, fallback.usedCorridor, warnings)
    }

    return {
      ok: false,
      error:
        'Не вдалося зібрати тиждень під ' +
        target +
        ' ккал/день навіть із коридором ±' +
        maxCorridorTried +
        ' ккал. Змініть ціль або поповніть пул страв.',
    }
  }

  /* MER-18: спроби по черзі. Перша — пул без небажаних страв (беремо її лише
   * якщо в ньому взагалі можна зібрати тиждень); резервна — повний пул, бо
   * правила дієтолога (калорії, тип, антиповтор) головніші за смак. */
  const attempts: Array<ReadonlyArray<PlannedMeal>> = []
  const kept = prefs.disliked.size
    ? planned.filter((meal) => !prefs.disliked.has(meal.id))
    : planned
  if (kept.length !== planned.length && !shortageOf(byTypeOf(kept)).length) {
    attempts.push(kept)
  }
  attempts.push(planned)

  let last: GenerateResult = {
    ok: false,
    error: 'Пул страв порожній — додайте страви на екрані «Страви».',
  }
  for (const list of attempts) {
    last = buildFrom(list)
    if (!last.ok) continue
    // Небажана страва в тижні означає, що без неї план не збирався.
    if (
      prefs.disliked.size &&
      allWeekMeals(last.days).some((meal) => prefs.disliked.has(meal.id))
    ) {
      last.warnings = last.warnings.concat(
        'Без страв із позначкою «не подобається» тиждень не збирається — ' +
          'вони лишились у плані. Приберіть позначку або поповніть пул.',
      )
    }
    return last
  }
  return last
}
