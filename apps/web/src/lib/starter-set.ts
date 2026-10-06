/**
 * Стартовий набір страв на сервері (MER-77): три RPC з `0007_starter_set.sql`,
 * перевірка формату з ядра і порядок кроків засіву.
 *
 * Сам засів — звичайні записи в локальну базу (`seedStarterMeals`), тож тут
 * лише мережа й рішення «що робити далі». Мережі немає — функції повертають
 * помилку, і нічого не відбувається: автозасів спробує з наступним відкриттям,
 * кнопку можна натиснути ще раз.
 */

import { parseStarterSet, starterMealId } from '@meridian/core'
import type { StarterMeal } from '@meridian/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { rpcFailure } from './messages.ts'
import type { Failure, Outcome } from './messages.ts'

/** 'none' — набору на сервері немає; 'pending' — сім'ю ще не засіяно. */
export type StarterStatus = 'none' | 'pending' | 'seeded'

export async function starterStatus(
  supabase: SupabaseClient,
): Promise<Outcome<StarterStatus>> {
  const { data, error } = await supabase.rpc('starter_set_status')
  if (error) return { ok: false, failure: rpcFailure(error) }
  return { ok: true, value: data as StarterStatus }
}

/**
 * Набір із сервера, уже перевірений. `[]` — набору на сервері немає.
 * `broken` — файл на сервері зіпсований: це, на відміну від мережі, варто
 * показати людині.
 */
export type StarterFetch =
  Outcome<Array<StarterMeal>> | { ok: false; failure: Failure; broken: true }

async function loadStarterMeals(
  supabase: SupabaseClient,
): Promise<StarterFetch> {
  const { data, error } = await supabase.rpc('starter_set')
  if (error) return { ok: false, failure: rpcFailure(error) }
  if (data === null) return { ok: true, value: [] }
  const parsed = parseStarterSet(data)
  if (!parsed.ok) {
    return {
      ok: false,
      broken: true,
      failure: {
        text: 'Стартовий набір на сервері некоректний — страви не додано.',
        detail: parsed.error,
      },
    }
  }
  return { ok: true, value: parsed.set.meals }
}

// ponytail: набір один на сервер і змінюється рідко — вдалу відповідь тримаємо
// до перезавантаження сторінки, щоб «Страви» не тягнули його на кожне
// відкриття. Новий файл на сервері видно після перезавантаження.
let loaded: Promise<StarterFetch> | null = null

export function fetchStarterMeals(
  supabase: SupabaseClient,
): Promise<StarterFetch> {
  loaded ??= loadStarterMeals(supabase).then(
    (result) => {
      if (!result.ok) loaded = null
      return result
    },
    (cause: unknown) => {
      loaded = null
      throw cause
    },
  )
  return loaded
}

/** Позначити сім'ю засіяною. true — позначив саме цей виклик. */
export async function claimStarterSet(
  supabase: SupabaseClient,
): Promise<Outcome<boolean>> {
  const { data, error } = await supabase.rpc('claim_starter_set')
  if (error) return { ok: false, failure: rpcFailure(error) }
  return { ok: true, value: data === true }
}

/** Страви набору, яких немає серед живих страв пулу (id виведені з `key`). */
export function missingStarterMeals(
  familyId: string,
  meals: ReadonlyArray<StarterMeal>,
  liveIds: ReadonlySet<string>,
): Array<StarterMeal> {
  return meals.filter((meal) => !liveIds.has(starterMealId(familyId, meal.key)))
}

/* ==========================================================================
 * Порядок засіву
 * ======================================================================== */

/** Що засіву потрібно від застосунку. Окремо — щоб порядок перевірити тестом. */
export type SeedSteps = {
  /** Користувач вийшов чи змінив сім'ю — далі нічого не писати й не позначати. */
  cancelled: () => boolean
  /** Пристрій уже знає, що сім'ю засіяно (кеш за familyId). */
  seededHere: () => boolean
  rememberSeeded: () => void
  /** Перша синхронізація: до неї пул пристрою порожній, хоч що на сервері. */
  firstSync: () => Promise<void>
  status: () => Promise<Outcome<StarterStatus>>
  /** Чи є в пулі хоч одна жива страва. */
  poolHasMeals: () => Promise<boolean>
  fetchMeals: () => Promise<StarterFetch>
  /** `seedStarterMeals`: ідемпотентний, живих страв не переписує. */
  write: (meals: ReadonlyArray<StarterMeal>) => Promise<number>
  claim: () => Promise<Outcome<boolean>>
}

/**
 * Позначка «засіяно» — завжди ПІСЛЯ локального запису. Збій між ними лишає
 * сім'ю зі стравами, але без позначки, і наступне відкриття її поставить (пул
 * уже не порожній). Навпаки — позначка без страв — лишило б сім'ю ні з чим
 * назавжди. Другий пристрій нічого не дублює: id страв виведені.
 */
export async function markSeeded(
  steps: Pick<SeedSteps, 'cancelled' | 'claim' | 'rememberSeeded'>,
): Promise<void> {
  if (steps.cancelled()) return
  const claim = await steps.claim()
  // false — позначку вже поставив інший пристрій: засіяно однаково.
  if (claim.ok) steps.rememberSeeded()
}

/**
 * Автозасів при відкритті сім'ї (рішення власника):
 *  - **порожній пул** — засіваємо, як нову сім'ю;
 *  - **непорожній пул** (сім'я завела страви до появи набору) — лише
 *    позначка, страви додаються кнопкою: свої такі самі страви з іншими id
 *    інакше задублювались би;
 *  - **уже засіяна** сім'я нових страв з оновленого файлу сама не отримує.
 */
export async function autoSeed(steps: SeedSteps): Promise<void> {
  if (steps.seededHere()) return
  await steps.firstSync()
  if (steps.cancelled()) return
  const status = await steps.status()
  if (steps.cancelled() || !status.ok || status.value === 'none') return
  if (status.value === 'seeded') return steps.rememberSeeded()

  const hasMeals = await steps.poolHasMeals()
  if (steps.cancelled()) return
  if (hasMeals) return markSeeded(steps)

  const meals = await steps.fetchMeals()
  if (steps.cancelled()) return
  if (!meals.ok) {
    // Людині це покаже «Страви» — вони перевіряють той самий набір.
    console.error(meals.failure.text, meals.failure.detail ?? '')
    return
  }
  // Порожній набір засів не «спалює»: з'являться страви — засіємо.
  if (!meals.value.length) return
  await steps.write(meals.value)
  await markSeeded(steps)
}

/* Кеш «засіяно» на пристрої — щоб не питати сервер на кожному відкритті.
 * Позначка на сервері не знімається ніколи, тож кеш не застаріває. */
const seededKey = (familyId: string) => 'meridian.starter-seeded.' + familyId

export const seededHere = (familyId: string): boolean =>
  window.localStorage.getItem(seededKey(familyId)) !== null

export const rememberSeeded = (familyId: string): void =>
  window.localStorage.setItem(seededKey(familyId), '1')
