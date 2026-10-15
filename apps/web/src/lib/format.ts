import { dateKeyParts } from '@meridian/core'

const PLURAL = new Intl.PluralRules('uk-UA')

function dateFromKey(key: string): Date {
  const parts = dateKeyParts(key)
  return parts ? new Date(parts[0], parts[1] - 1, parts[2]) : new Date(NaN)
}

export function plural(n: number, one: string, few: string, many: string) {
  const forms: Partial<Record<Intl.LDMLPluralRule, string>> = { one, few }
  return forms[PLURAL.select(n)] ?? many
}

export function formatDayTitle(key: string): string {
  const text = dateFromKey(key).toLocaleDateString('uk-UA', {
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
  const end = to.toLocaleDateString('uk-UA', opts) + ' ' + to.getFullYear()
  return from.getMonth() === to.getMonth() &&
    from.getFullYear() === to.getFullYear()
    ? from.getDate() + '–' + end
    : from.toLocaleDateString('uk-UA', opts) + ' – ' + end
}

export function formatToday(now: Date): string {
  return now.toLocaleDateString('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

export function formatMoment(value: string): string {
  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
  })
  const time = date.toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return day + ' о ' + time
}

export function grams(value: number): string {
  return value.toLocaleString('uk-UA') + ' г'
}

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
