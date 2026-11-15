import type { AuthError, SupabaseClient } from '@supabase/supabase-js'
import { isAuthImplicitGrantRedirectError } from '@supabase/supabase-js'
import type { PublicEnv } from './public-env'

export const OAUTH_PROVIDERS = ['google', 'discord', 'github'] as const

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number]

export function enabledProviders(settings: unknown): Array<OAuthProvider> {
  if (typeof settings !== 'object' || settings === null) return []
  const external: unknown = (settings as { external?: unknown }).external
  if (typeof external !== 'object' || external === null) return []
  return OAUTH_PROVIDERS.filter(
    (provider) => (external as Record<string, unknown>)[provider] === true,
  )
}

export async function fetchEnabledProviders(
  env: PublicEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Array<OAuthProvider>> {
  try {
    const response = await fetchImpl(env.supabaseUrl + '/auth/v1/settings', {
      headers: { apikey: env.supabaseAnonKey },
    })
    return response.ok ? enabledProviders(await response.json()) : []
  } catch {
    return []
  }
}

export function startOAuth(
  supabase: SupabaseClient,
  provider: OAuthProvider,
  origin: string,
) {
  return supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: origin + '/' },
  })
}

export function redirectError(error: AuthError): {
  code?: string
  message: string
} {
  return {
    code: isAuthImplicitGrantRedirectError(error)
      ? error.details?.code
      : error.code,
    message: error.message,
  }
}
