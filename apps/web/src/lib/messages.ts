import type { UpdateType } from '@powersync/web'
import type { Rejection } from './powersync/connector'

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
  const key = Object.keys(RPC).find((k) => error.message.includes(k))
  return key
    ? { text: RPC[key] }
    : { text: 'Не вдалося виконати дію.', detail: error.message }
}

export type LocalDbFailure = Failure & { retryable: boolean }

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

type SyncDirection = 'connect' | 'download' | 'upload'

const NETWORK =
  /failed to fetch|networkerror|load failed|network request failed/i

const UNAUTHORIZED = /not signed in|unauthorized|received 40[13]\b|jwt expired/i

export function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
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

export function syncFailure(
  error: unknown,
  context: { direction: SyncDirection; online: boolean },
): Failure | null {
  const detail = errorText(error)
  if (!context.online || NETWORK.test(detail)) {
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

const REJECTED_TABLE: Record<string, string> = {
  profile: 'Профіль',
  meal: 'Страва',
  recipe: 'Рецепт',
  meal_pref: 'Позначка смаку',
  week_plan: 'План тижня',
  plan_slot: 'Страва в плані',
  shopping_check: 'Позначка в списку покупок',
  family_settings: 'Налаштування сім’ї',
}

const REJECTED_OP: Record<UpdateType, string> = {
  PUT: 'створення',
  PATCH: 'зміну',
  DELETE: 'видалення',
}

const REJECTED_REASON: ReadonlyArray<[RegExp, string]> = [
  [/^23505$/, 'такий запис уже є (мабуть, його створили на іншому пристрої)'],
  [/^23503$/, 'пов’язаного запису вже немає'],
  [/^23502$/, 'бракує обов’язкового поля'],
  [/^23514$/, 'значення поза допустимими межами'],
  [/^42501$/, 'немає доступу — можливо, пристрій уже не в цій сім’ї'],
  [/^22/, 'некоректне значення'],
]

export function rejectionFailure(rejection: Rejection): Failure {
  const what = REJECTED_TABLE[rejection.table] ?? rejection.table
  const reason =
    REJECTED_REASON.find(([code]) => code.test(rejection.code))?.[1] ??
    'сервер відхилив дані'
  return {
    text:
      what +
      ': сервер не прийняв ' +
      REJECTED_OP[rejection.op] +
      ' — ' +
      reason +
      '.',
    detail: rejection.code + ' ' + rejection.message,
  }
}
