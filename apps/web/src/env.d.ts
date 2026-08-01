/// <reference types="vite/client" />

/**
 * Змінні, які Vite підставляє на етапі збірки. Префікс `PUBLIC_` дозволено в
 * `vite.config.ts` — імена ті самі, що в контракті `infra/.env.example`, щоб не
 * заводити другий словник назв для того самого значення (MER-45).
 */
interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL?: string
  readonly PUBLIC_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
