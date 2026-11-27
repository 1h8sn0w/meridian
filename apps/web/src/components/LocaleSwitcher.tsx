import { Translate } from '@phosphor-icons/react'
import {
  LOCALES,
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
      className="relative inline-flex h-9 flex-none cursor-pointer items-center gap-1 rounded-full border border-line bg-app-solid px-2.5 text-xs font-semibold text-muted transition-colors duration-300 hover:text-content has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
    >
      <Translate aria-hidden size={16} />
      <span aria-hidden>{LOCALE_SHORT[locale]}</span>
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
