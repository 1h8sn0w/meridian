import type { Rejection } from './powersync/connector'
import { messages } from './i18n/locale.ts'
import type { Messages } from './i18n/uk.ts'

export type Failure = { text: string; detail?: string }

export type Outcome<T> =
  { ok: true; value: T } | { ok: false; failure: Failure }

export function authFailure(error: {
  code?: string
  message: string
}): Failure {
  const t = messages().errors
  const known = error.code ? t.auth[error.code] : undefined
  return known ? { text: known } : { text: t.generic, detail: error.message }
}

export function rpcFailure(error: { message: string }): Failure {
  const t = messages().errors
  const key = Object.keys(t.rpc).find((k) => error.message.includes(k))
  return key ? { text: t.rpc[key] } : { text: t.generic, detail: error.message }
}

export type LocalDbFailure = Failure & { retryable: boolean }

export function localDbFailure(
  error: unknown,
  context: { secure: boolean; origin: string },
): LocalDbFailure {
  const t = messages().errors
  if (!context.secure) {
    return {
      text: t.insecure,
      detail: context.origin,
      retryable: false,
    }
  }
  return {
    text: t.localDb,
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
  const t = messages().errors
  const detail = errorText(error)
  if (!context.online || NETWORK.test(detail)) {
    return context.direction === 'connect'
      ? { text: t.syncOffline, detail }
      : null
  }

  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? error.status
      : undefined
  if (status === 401 || status === 403 || UNAUTHORIZED.test(detail)) {
    return { text: t.syncUnauthorized, detail }
  }

  if (context.direction === 'upload') return { text: t.syncUpload, detail }
  return { text: t.syncDownload, detail }
}

type RejectedReason = keyof Messages['errors']['rejectedReason']

const REJECTED_REASON: ReadonlyArray<[RegExp, RejectedReason]> = [
  [/^23505$/, 'duplicate'],
  [/^23503$/, 'missingParent'],
  [/^23502$/, 'missingField'],
  [/^23514$/, 'outOfRange'],
  [/^42501$/, 'forbidden'],
  [/^22/, 'invalid'],
]

export function rejectionFailure(rejection: Rejection): Failure {
  const t = messages().errors
  const what = t.rejectedTable[rejection.table] ?? rejection.table
  const reason =
    REJECTED_REASON.find(([code]) => code.test(rejection.code))?.[1] ?? 'other'
  return {
    text: t.rejected(
      what,
      t.rejectedOp[rejection.op],
      t.rejectedReason[reason],
    ),
    detail: rejection.code + ' ' + rejection.message,
  }
}
