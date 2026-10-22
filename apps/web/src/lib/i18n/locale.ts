import { de } from './de.ts'
import { en } from './en.ts'
import { pl } from './pl.ts'
import { uk } from './uk.ts'
import type { Messages } from './uk.ts'

export const LOCALES = ['uk', 'en', 'pl', 'de'] as const

export type Locale = (typeof LOCALES)[number]

export const LOCALE_NAMES: Record<Locale, string> = {
  uk: 'Українська',
  en: 'English',
  pl: 'Polski',
  de: 'Deutsch',
}

const DICTIONARIES: Record<Locale, Messages> = { uk, en, pl, de }

const INTL_TAGS: Record<Locale, string> = {
  uk: 'uk-UA',
  en: 'en-GB',
  pl: 'pl-PL',
  de: 'de-DE',
}

const ALIASES: Partial<Record<string, Locale>> = { ru: 'uk' }

const KEY = 'meridian.locale.v2'

function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale)
}

export function pickLocale(languages: ReadonlyArray<string>): Locale {
  for (const tag of languages) {
    const base = tag.toLowerCase().split('-')[0]
    const found = isLocale(base) ? base : ALIASES[base]
    if (found) return found
  }
  return 'uk'
}

function initialLocale(): Locale {
  if (typeof window === 'undefined') return 'uk'
  const stored = window.localStorage.getItem(KEY)
  return isLocale(stored) ? stored : pickLocale(navigator.languages)
}

let current: Locale = initialLocale()
const listeners = new Set<() => void>()

export function getLocale(): Locale {
  return current
}

export function messages(): Messages {
  return DICTIONARIES[current]
}

export function messagesFor(locale: Locale): Messages {
  return DICTIONARIES[locale]
}

export function intlLocale(): string {
  return INTL_TAGS[current]
}

export function applyLocale() {
  document.documentElement.lang = current
}

export function setLocale(next: Locale) {
  current = next
  window.localStorage.setItem(KEY, next)
  applyLocale()
  for (const listener of listeners) listener()
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
