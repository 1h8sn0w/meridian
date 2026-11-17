import type {
  AuthError,
  SupabaseClient,
  UserIdentity,
} from '@supabase/supabase-js'
import { isAuthImplicitGrantRedirectError } from '@supabase/supabase-js'
import type { PublicEnv } from './public-env'

const OAUTH_PROVIDERS = ['google', 'discord', 'github'] as const

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
    const response = await fetchImpl(env.supabaseUrl + '/auth/v1/settings')
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

const PENDING_LINK_KEY = 'meridian.linking'

type LinkStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export async function startLink(
  supabase: SupabaseClient,
  provider: OAuthProvider,
  origin: string,
  storage: LinkStorage,
) {
  storage.setItem(PENDING_LINK_KEY, provider)
  const result = await supabase.auth.linkIdentity({
    provider,
    options: { redirectTo: origin + '/family' },
  })
  if (result.error) storage.removeItem(PENDING_LINK_KEY)
  return result
}

export function takePendingLink(storage: LinkStorage): OAuthProvider | null {
  const value = storage.getItem(PENDING_LINK_KEY)
  storage.removeItem(PENDING_LINK_KEY)
  return OAUTH_PROVIDERS.find((provider) => provider === value) ?? null
}

export type SignInMethod =
  | {
      kind: 'linked'
      provider: OAuthProvider | 'email'
      identity: UserIdentity
      address: string | null
      unlink: 'allowed' | 'last-method' | 'never'
    }
  | { kind: 'available'; provider: OAuthProvider }

export function signInMethods(
  identities: ReadonlyArray<UserIdentity>,
  enabled: ReadonlyArray<OAuthProvider>,
): Array<SignInMethod> {
  const several = identities.length > 1
  return (['email', ...OAUTH_PROVIDERS] as const).flatMap(
    (provider): Array<SignInMethod> => {
      const linked = identities.filter((i) => i.provider === provider)
      if (linked.length === 0) {
        return provider !== 'email' && enabled.includes(provider)
          ? [{ kind: 'available', provider }]
          : []
      }
      return linked.map((identity) => ({
        kind: 'linked',
        provider,
        identity,
        address: addressOf(identity),
        unlink:
          provider === 'email' ? 'never' : several ? 'allowed' : 'last-method',
      }))
    },
  )
}

function addressOf(identity: UserIdentity): string | null {
  const email: unknown = identity.identity_data?.email
  return typeof email === 'string' && email !== '' ? email : null
}

const REDIRECT_ERROR_PARAMS = ['error', 'error_code', 'error_description']

export function withoutRedirectError(href: string): string | null {
  const url = new URL(href)
  const hash = new URLSearchParams(url.hash.slice(1))
  const inSearch = REDIRECT_ERROR_PARAMS.some((key) =>
    url.searchParams.has(key),
  )
  const inHash = REDIRECT_ERROR_PARAMS.some((key) => hash.has(key))
  if (!inSearch && !inHash) return null
  for (const key of REDIRECT_ERROR_PARAMS) {
    if (inSearch) url.searchParams.delete(key)
    hash.delete(key)
  }
  if (inHash) url.hash = hash.toString()
  return url.toString()
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
