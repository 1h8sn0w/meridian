import { useSyncExternalStore } from 'react'
import { getLocale, messagesFor, subscribeLocale } from './locale.ts'
import type { Locale } from './locale.ts'
import type { Messages } from './uk.ts'

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale)
}

export function useMessages(): Messages {
  return messagesFor(useLocale())
}
