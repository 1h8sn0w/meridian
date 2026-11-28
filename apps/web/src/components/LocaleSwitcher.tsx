import { Translate } from '@phosphor-icons/react'
import {
  LOCALES,
  LOCALE_FLAG,
  LOCALE_NAMES,
  LOCALE_SHORT,
  setLocale,
} from '../lib/i18n/locale'
import type { Locale } from '../lib/i18n/locale'
import { useLocale, useMessages } from '../lib/i18n/use-messages'

export function LocaleSwitcher() {
  const locale = useLocale()
  const t = useMessages().header
  return (
    <label
      title={t.languageHint}
      className="relative inline-flex h-9 w-9 flex-none cursor-pointer items-center justify-center gap-1 rounded-full border border-line bg-app-solid text-xs header-lg:w-auto header-lg:pl-2 header-lg:pr-2.5 font-semibold text-muted transition-colors duration-300 hover:text-content has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
    >
      <span aria-hidden className="text-base leading-none header-lg:hidden">
        {LOCALE_FLAG[locale]}
      </span>
      <Translate aria-hidden size={16} className="hidden header-lg:block" />
      <span aria-hidden className="hidden header-lg:inline">
        {LOCALE_SHORT[locale]}
      </span>
      <select
        aria-label={t.language}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className="absolute inset-0 cursor-pointer appearance-none text-base opacity-0"
      >
        {LOCALES.map((option) => (
          <option key={option} value={option} lang={option}>
            {LOCALE_NAMES[option]}
          </option>
        ))}
      </select>
    </label>
  )
}
