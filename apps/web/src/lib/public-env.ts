/**
 * Публічний конфіг для браузера (MER-45).
 *
 * Адреса Supabase, anon-ключ і адреса sync потрібні саме в браузері:
 * local-first означає, що до GoTrue й PowerSync ходить клієнт, а не наш сервер.
 *
 * Звідки вони беруться, у порядку переваги:
 *
 *  1. **Рантайм — `window.__MERIDIAN_ENV__` в `index.html`.** Шаблон заповнює
 *     Caddy на кожній відповіді змінними свого оточення (`templates` в
 *     infra/caddy/Caddyfile, значення — у compose.yaml). Так один образ їде на
 *     будь-який self-host без перезбірки під кожну адресу.
 *  2. **Збірка — `import.meta.env.PUBLIC_*`.** Vite запікає їх туди, де шаблон
 *     ніхто не заповнює: `pnpm dev` (значення з apps/web/.env) і нативна збірка
 *     під Capacitor (MER-50) — у телефоні Caddy немає. У веб-образі їх не задає
 *     ніхто, тож і перебивати там нічого.
 *
 * Незаповнений шаблон упізнається за `{{`: і Vite, і Capacitor віддають
 * `index.html` байт у байт.
 *
 * Anon-ключ не секрет: він і створений для того, щоб лежати у браузері, а все,
 * що він дозволяє, обмежують RLS-політики (MER-44).
 */

export type PublicEnv = {
  supabaseUrl: string
  supabaseAnonKey: string
  /** Адреса sync-сервісу PowerSync для браузера (MER-46). */
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

/**
 * Порожній рядок означає «не налаштовано» — і сторінка скаже про це прямо,
 * замість того щоб мовчки не працювати. Провенанс діє й тут: нічого не
 * підставляємо «за замовчуванням».
 */
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

/**
 * Синхронізація перевіряється окремо від входу (MER-46) навмисно: без адреси
 * PowerSync застосунок цілком робочий — просто лишається на одному пристрої.
 * Гасити через це весь інтерфейс було б перебільшенням, а мовчати про це —
 * тією самою тихою поломкою, від якої тут скрізь застереження.
 */
export function isSyncConfigured(env: PublicEnv): boolean {
  return isPublicEnvReady(env) && env.powersyncUrl !== ''
}
