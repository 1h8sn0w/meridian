/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string
  readonly PUBLIC_SUPABASE_ANON_KEY?: string
  readonly PUBLIC_POWERSYNC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
