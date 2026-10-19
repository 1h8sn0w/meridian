import { dateKeyParts } from '@meridian/core'
import { intlLocale, messages } from './i18n/locale.ts'

function dateFromKey(key: string): Date {
  const parts = dateKeyParts(key)
  return parts ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(NaN)
}

export function formatDayTitle(key: string): string {
  const text = dateFromKey(key).toLocaleDateString(intlLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatWeekRange(fromKey: string, toKey: string): string {
  const from = dateFromKey(fromKey)
  const to = dateFromKey(toKey)
  const opts = { day: 'numeric', month: 'short' } as const
  const locale = intlLocale()
  const end = to.toLocaleDateString(locale, opts) + ' ' + to.getFullYear()
  return from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear()
    ? from.getDate() + '–' + end
    : from.toLocaleDateString(locale, opts) + ' – ' + end
}

export function formatToday(now: Date): string {
  return now.toLocaleDateString(intlLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function formatMoment(value: string): string {
  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const locale = intlLocale()
  const day = date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
  })
  const time = date.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })
  return messages().common.at(day, time)
}

export function grams(value: number): string {
  return messages().common.grams(value.toLocaleString(intlLocale()))
}

export function formatInviteCode(code: string): string {
  return (code.match(/.{1,4}/g) ?? [code]).join('-')
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso))
}
