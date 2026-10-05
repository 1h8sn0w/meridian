/**
 * Стартовий набір страв на сервері (MER-77): три RPC з `0007_starter_set.sql`
 * плюс перевірка формату з ядра.
 *
 * Сам засів — звичайні записи в локальну базу (`seedStarterMeals`), тож тут
 * лише мережа: стан, набір і позначка «засіяно». Мережі немає — функції
 * повертають помилку, і нічого не відбувається: автозасів спробує з наступним
 * відкриттям, кнопку можна натиснути ще раз.
 */

import { parseStarterSet } from '@meridian/core'
import type { StarterMeal } from '@meridian/core'
import type { SupabaseClient } from '@supabase/supabase-js'
import { rpcFailure } from './messages'
import type { Failure } from './messages'

/** 'none' — набору на сервері немає; 'pending' — сім'ю ще не засіяно. */
export type StarterStatus = 'none' | 'pending' | 'seeded'

type Outcome<T> = { ok: true; value: T } | { ok: false; failure: Failure }

export async function starterStatus(
  supabase: SupabaseClient,
): Promise<Outcome<StarterStatus>> {
  const { data, error } = await supabase.rpc('starter_set_status')
  if (error) return { ok: false, failure: rpcFailure(error) }
  return { ok: true, value: data as StarterStatus }
}

/** Набір із сервера, уже перевірений. `[]` — набору на сервері немає. */
export async function fetchStarterMeals(
  supabase: SupabaseClient,
): Promise<Outcome<Array<StarterMeal>>> {
  const { data, error } = await supabase.rpc('starter_set')
  if (error) return { ok: false, failure: rpcFailure(error) }
  if (data === null) return { ok: true, value: [] }
  const parsed = parseStarterSet(data)
  if (!parsed.ok) {
    return {
      ok: false,
      failure: {
        text: 'Стартовий набір на сервері некоректний — страви не додано.',
        detail: parsed.error,
      },
    }
  }
  return { ok: true, value: parsed.set.meals }
}

/** Позначити сім'ю засіяною. true — позначив саме цей виклик. */
export async function claimStarterSet(
  supabase: SupabaseClient,
): Promise<Outcome<boolean>> {
  const { data, error } = await supabase.rpc('claim_starter_set')
  if (error) return { ok: false, failure: rpcFailure(error) }
  return { ok: true, value: data === true }
}
