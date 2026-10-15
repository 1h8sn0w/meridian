export type PublicEnv = {
  supabaseUrl: string
  supabaseAnonKey: string
  powersyncUrl: string
}

declare global {
  interface Window {
    __MERIDIAN_ENV__?: Partial<PublicEnv>
  }
}

function fromPage(key: keyof PublicEnv): string {
  const value = window.__MERIDIAN_ENV__?.[key] ?? ''
  return value.startsWith('{{') ? '' : value
}

export function readPublicEnv(): PublicEnv {
  return {
    supabaseUrl:
      fromPage('supabaseUrl') || (import.meta.env.PUBLIC_SUPABASE_URL ?? ''),
    supabaseAnonKey:
      fromPage('supabaseAnonKey') ||
      (import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? ''),
    powersyncUrl:
      fromPage('powersyncUrl') || (import.meta.env.PUBLIC_POWERSYNC_URL ?? ''),
  }
}

export function isPublicEnvReady(env: PublicEnv): boolean {
  return env.supabaseUrl !== '' && env.supabaseAnonKey !== ''
}

export function isSyncConfigured(env: PublicEnv): boolean {
  return isPublicEnvReady(env) && env.powersyncUrl !== ''
}
