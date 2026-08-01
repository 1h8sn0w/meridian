/**
 * Клієнт Supabase (MER-45).
 *
 * Один на вкладку: supabase-js сам тримає сесію, сам оновлює токен за
 * таймером і сам розсилає подію про зміну. Другий екземпляр означав би дві
 * незалежні спроби оновити той самий refresh-токен.
 *
 * Сесія живе в localStorage — це і є типова поведінка supabase-js, і вона ж
 * потрібна нам: застосунок local-first, після перезавантаження вхід має
 * лишатися. У Capacitor (MER-50) це той самий WebView localStorage, тож
 * окремої абстракції поверх сховища тут заводити нема за чим.
 */

import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicEnv } from './public-env'

let client: SupabaseClient | null = null

export function getSupabase(env: PublicEnv): SupabaseClient {
  if (typeof window === 'undefined') {
    // Сервер до GoTrue не ходить свідомо: сесія живе на пристрої, і саме тому
    // сервісу `web` не потрібна мережа Supabase (див. infra/README.md).
    throw new Error('Клієнт Supabase доступний лише у браузері')
  }
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Ні OAuth, ні магічних посилань поки немає — ловити в URL нема чого.
        detectSessionInUrl: false,
        storageKey: 'meridian.auth.v2',
      },
    })
  }
  return client
}

/**
 * `family_id` із access-токена.
 *
 * Читаємо claim, а не таблицю: claim — це те саме значення, яке бачить сервер
 * (RLS через `public.current_family_id()`) і бачитиме PowerSync (MER-46). Поки
 * токен не оновлено, будь-який запит до бази однаково поверне порожньо, тож
 * саме claim, а не запит, і є станом застосунку.
 *
 * Підпис тут не перевіряється — і не має: це підказка інтерфейсу, а не рішення
 * про доступ. Доступ вирішує Postgres.
 */
export function familyIdFromToken(
  accessToken: string | undefined,
): string | null {
  if (!accessToken) return null
  const payload = accessToken.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = Uint8Array.from(json, (c) => c.charCodeAt(0))
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof claims !== 'object' || claims === null) return null
    const value = (claims as Record<string, unknown>).family_id
    return typeof value === 'string' && value !== '' ? value : null
  } catch {
    return null
  }
}
