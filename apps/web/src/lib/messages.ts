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
