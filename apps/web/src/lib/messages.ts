/**
 * Помилки українською (MER-45).
 *
 * GoTrue і Postgres відповідають англійською й кодами. Перекладаємо ті, які
 * користувач справді може виправити; для решти показуємо чесне «щось пішло не
 * так» ПЛЮС оригінальний текст — інакше той, хто піднімає self-host, лишиться
 * без єдиної підказки, чому не працює.
 */

const AUTH: Record<string, string> = {
  invalid_credentials: 'Невірна пошта або пароль.',
  email_not_confirmed: 'Пошту ще не підтверджено — перевірте лист.',
  user_already_exists: 'Такий акаунт уже є. Спробуйте увійти.',
  weak_password: 'Пароль закороткий. Мінімум 6 символів.',
  validation_failed: 'Перевірте пошту й пароль.',
  over_request_rate_limit: 'Забагато спроб. Спробуйте за хвилину.',
  over_email_send_rate_limit: 'Забагато листів. Спробуйте пізніше.',
  signup_disabled: 'Реєстрацію на цьому сервері вимкнено.',
}

/** Повідомлення функцій `create_family` / `accept_family_invite` (0004_auth.sql). */
const RPC: Record<string, string> = {
  not_authenticated: 'Сесія втрачена. Увійдіть ще раз.',
  family_name_required: 'Введіть назву сім’ї.',
  already_in_family: 'Ви вже в сім’ї.',
  no_family: 'Спершу створіть сім’ю або приєднайтеся до наявної.',
  invite_not_found: 'Такого коду немає. Перевірте, чи не загубився символ.',
  invite_already_used: 'Цим кодом уже скористалися. Попросіть новий.',
  invite_expired: 'Термін дії коду минув. Попросіть новий.',
}

export type Failure = { text: string; detail?: string }

/**
 * Наслідок дії, що може не вдатися: вхід, RPC сервера. НЕ `Result` із
 * `@meridian/core`: там форма інша (`({ ok: true } & T) | Err`, а помилка —
 * рядок). Два різні типи під одним іменем в одному застосунку — пастка, а не
 * зручність.
 */
export type Outcome<T> =
  { ok: true; value: T } | { ok: false; failure: Failure }

export function authFailure(error: {
  code?: string
  message: string
}): Failure {
  const known = error.code ? AUTH[error.code] : undefined
  return known
    ? { text: known }
    : { text: 'Не вдалося виконати дію.', detail: error.message }
}

export function rpcFailure(error: { message: string }): Failure {
  // PostgREST віддає текст RAISE EXCEPTION як є, тож ключ шукаємо в ньому.
  const key = Object.keys(RPC).find((k) => error.message.includes(k))
  return key
    ? { text: RPC[key] }
    : { text: 'Не вдалося виконати дію.', detail: error.message }
}

/**
 * Чому не відкрилась база пристрою (MER-73).
 *
 * `retryable` — чи має сенс кнопка «Спробувати ще раз». На незахищеній адресі
 * її немає: перезавантаження сторінки контексту не змінить, змінить лише інша
 * адреса.
 */
export type LocalDbFailure = Failure & { retryable: boolean }

/**
 * Незахищений контекст — найчастіша причина, і єдина, яку людина виправляє
 * сама: self-host відкрили за `http://<IP>`. Браузер дає сховище й блокування
 * вкладок (`navigator.locks`) лише на `https://` або `localhost`, а PowerSync без
 * них не відкриває базу. Решту причин не вгадуємо — показуємо як є.
 */
export function localDbFailure(
  error: unknown,
  context: { secure: boolean; origin: string },
): LocalDbFailure {
  if (!context.secure) {
    return {
      text: 'Браузер не дає застосунку локальної бази: сторінку відкрито без HTTPS. Відкрийте її за адресою з https:// — або через localhost на самому сервері.',
      detail: context.origin,
      retryable: false,
    }
  }
  return {
    text: 'Не вдалося відкрити локальну базу на цьому пристрої.',
    detail: error instanceof Error ? error.message : String(error),
    retryable: true,
  }
}

/**
 * Що саме не вдалося: отримати дані із сервера (разом із самим з'єднанням)
 * чи віддати йому зміни з пристрою. Від цього залежить, що сказати про дані.
 */
export type SyncDirection = 'connect' | 'download' | 'upload'

/**
 * Мережі немає — це офлайн, а не аварія: local-first для цього й будувався.
 * Тексти — Chromium, Firefox і Safari відповідно; PowerSync шле помилки з
 * воркера, і клас `TypeError` по дорозі губиться, а текст лишається.
 */
const NETWORK =
  /failed to fetch|networkerror|load failed|network request failed/i

/**
 * Вхід не прийнято. PowerSync кладе код у `status`, але з воркера доїжджає лише
 * текст: «Not signed in» з власної перевірки, «HTTP Unauthorized» зі стріму,
 * «Received 401» з решти запитів. PostgREST на вивантаженні каже «JWT expired».
 */
const UNAUTHORIZED = /not signed in|unauthorized|received 40[13]\b|jwt expired/i

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  // PostgrestError із вивантаження — звичайний об'єкт, не Error.
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return String(error)
}

/**
 * Чому не синхронізується (MER-84).
 *
 * `null` — помилки, про яку варто казати, немає: мережа недоступна, а це стан
 * «Офлайн», який панель і так показує (крім `connect`, див. нижче). Решту перекладаємо, якщо людина може щось
 * зробити, і завжди лишаємо оригінальний текст: без нього той, хто піднімав
 * self-host, не має з чого почати.
 */
export function syncFailure(
  error: unknown,
  context: { direction: SyncDirection; online: boolean },
): Failure | null {
  const detail = errorText(error)
  if (!context.online || NETWORK.test(detail)) {
    // Стрім PowerSync переживає офлайн сам і сам повторює. А `connect()`, що
    // відмовив, не повторює ніхто, тож про нього мовчати не можна навіть офлайн.
    return context.direction === 'connect'
      ? {
          text: 'Не вдалося під’єднатися до сервера синхронізації: немає мережі. Дані на пристрої в безпеці.',
          detail,
        }
      : null
  }

  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? error.status
      : undefined
  if (status === 401 || status === 403 || UNAUTHORIZED.test(detail)) {
    return {
      text: 'Сервер синхронізації не прийняв вхід. Спробуйте вийти з акаунта й увійти знову.',
      detail,
    }
  }

  if (context.direction === 'upload') {
    return {
      text: 'Сервер не приймає зміни з цього пристрою. Вони лишаються в черзі й поїдуть, щойно сервер їх прийме.',
      detail,
    }
  }
  return {
    text: 'Не вдалося отримати дані із сервера синхронізації. Зміни з цього пристрою збережено на ньому.',
    detail,
  }
}

/** `A1B2C3D4E5F6` → `A1B2-C3D4-E5F6`: код читають уголос і набирають руками. */
export function formatInviteCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? [code]).join('-')
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}
