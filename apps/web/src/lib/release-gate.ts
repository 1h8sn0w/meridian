const ISO_MOMENT =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2}))?$/

const MINUTE_MS = 60_000
const MINUTES_PER_HOUR = 60
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR

export type TimeLeft = { days: number; hours: number; minutes: number }

export function parseReleaseAt(raw: string): number | null {
  const value = raw.trim()
  if (!ISO_MOMENT.test(value)) return null
  const moment = Date.parse(value)
  return Number.isNaN(moment) ? null : moment
}

export function timeLeft(releaseAt: number, now: number): TimeLeft | null {
  if (now >= releaseAt) return null
  const total = Math.ceil((releaseAt - now) / MINUTE_MS)
  return {
    days: Math.floor(total / MINUTES_PER_DAY),
    hours: Math.floor((total % MINUTES_PER_DAY) / MINUTES_PER_HOUR),
    minutes: total % MINUTES_PER_HOUR,
  }
}

export function msUntilNextChange(releaseAt: number, now: number): number {
  return (releaseAt - now) % MINUTE_MS || MINUTE_MS
}
