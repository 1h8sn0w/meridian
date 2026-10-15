import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicEnv } from './public-env'

let client: SupabaseClient | null = null

export function getSupabase(env: PublicEnv): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        detectSessionInUrl: false,
        storageKey: 'meridian.auth.v2',
      },
    })
  }
  return client
}

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
