/**
 * Публічний конфіг для браузера (MER-45).
 *
 * Адреса Supabase і anon-ключ потрібні саме в браузері: local-first означає, що
 * до GoTrue ходить клієнт, а не наш сервер. Але значення беруться з РАНТАЙМУ
 * сервера, а не запікаються у бандл — так один образ їде на будь-який
 * self-host, без перезбірки під кожну адресу. Саме це вже передбачає
 * `infra/docker-compose.yml`, який віддає сервісу `web` змінні `PUBLIC_*`.
 *
 * `import.meta.env` лишається запасним шляхом для `pnpm dev`: у розробці змінні
 * зручніше тримати в `apps/web/.env`, і Vite підставляє їх на етапі збірки
 * (префікс `PUBLIC_` дозволено в `vite.config.ts`). У продакшн-образі цього
 * файлу немає, тож виграє `process.env`.
 *
 * Anon-ключ не секрет: він і створений для того, щоб лежати у браузері, а все,
 * що він дозволяє, обмежують RLS-політики (MER-44).
 */

import process from 'node:process'
import { createServerFn } from '@tanstack/react-start'

export type PublicEnv = {
  supabaseUrl: string
  supabaseAnonKey: string
  /** Адреса sync-сервісу PowerSync для браузера (MER-46). */
  powersyncUrl: string
}

/**
 * Порожній рядок означає «не налаштовано» — і сторінка скаже про це прямо,
 * замість того щоб мовчки не працювати. Провенанс діє й тут: нічого не
 * підставляємо «за замовчуванням».
 */
export const getPublicEnv = createServerFn({ method: 'GET' }).handler(
  (): PublicEnv => ({
    supabaseUrl:
      process.env.PUBLIC_SUPABASE_URL ??
      import.meta.env.PUBLIC_SUPABASE_URL ??
      '',
    supabaseAnonKey:
      process.env.PUBLIC_SUPABASE_ANON_KEY ??
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY ??
      '',
    powersyncUrl:
      process.env.PUBLIC_POWERSYNC_URL ??
      import.meta.env.PUBLIC_POWERSYNC_URL ??
      '',
  }),
)

export function isPublicEnvReady(env: PublicEnv): boolean {
  return env.supabaseUrl !== '' && env.supabaseAnonKey !== ''
}

/**
 * Синхронізація перевіряється окремо від входу (MER-46) навмисно: без адреси
 * PowerSync застосунок цілком робочий — просто лишається на одному пристрої.
 * Гасити через це весь інтерфейс було б перебільшенням, а мовчати про це —
 * тією самою тихою поломкою, від якої тут скрізь застереження.
 */
export function isSyncConfigured(env: PublicEnv): boolean {
  return isPublicEnvReady(env) && env.powersyncUrl !== ''
}
