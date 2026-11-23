import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useMatchRoute } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { readPublicEnv } from '../lib/public-env'
import {
  msUntilNextChange,
  parseReleaseAt,
  timeLeft,
} from '../lib/release-gate'
import type { TimeLeft } from '../lib/release-gate'
import { formatDate } from '../lib/format'
import { useMessages } from '../lib/i18n/use-messages'
import { minutesOf, useNow } from '../lib/use-now'
import { DayClock } from './DayClock'
import { AuthShell, Panel } from './ui'

const RELEASE_AT = parseReleaseAt(readPublicEnv().releaseAt)

export function ReleaseGate({ children }: { children: ReactNode }) {
  const { redirectFailure } = useAuth()
  const matchRoute = useMatchRoute()
  const left = useTimeLeft(RELEASE_AT)

  if (RELEASE_AT === null || left === null) return children
  if (matchRoute({ to: '/login' }) || redirectFailure) return children
  return <ReleaseCountdown releaseAt={RELEASE_AT} left={left} />
}

function useTimeLeft(releaseAt: number | null): TimeLeft | null {
  const [now, setNow] = useState(() => Date.now())
  const pending = releaseAt !== null && now < releaseAt

  useEffect(() => {
    if (!pending) return
    const timer = window.setTimeout(
      () => setNow(Date.now()),
      msUntilNextChange(releaseAt, now),
    )
    return () => window.clearTimeout(timer)
  }, [releaseAt, now, pending])

  return releaseAt === null ? null : timeLeft(releaseAt, now)
}

function ReleaseCountdown({
  releaseAt,
  left,
}: {
  releaseAt: number
  left: TimeLeft
}) {
  const t = useMessages()
  const minutes = minutesOf(useNow())
  const date = formatDate(new Date(releaseAt).toISOString())

  return (
    <AuthShell title="Meridian" subtitle={t.auth.tagline}>
      <div className="mb-4 mt-2">
        <DayClock minutes={minutes} />
      </div>

      <Panel title={t.release.title}>
        <p className="m-0 mb-4 text-sm leading-relaxed text-muted">
          {t.release.about}
        </p>
        <div
          role="timer"
          aria-label={t.release.timer(left.days, left.hours, left.minutes)}
          className="flex gap-2"
        >
          <CountdownUnit
            value={left.days}
            label={t.release.dayUnit(left.days)}
          />
          <CountdownUnit
            value={left.hours}
            label={t.release.hourUnit(left.hours)}
          />
          <CountdownUnit
            value={left.minutes}
            label={t.release.minuteUnit(left.minutes)}
          />
        </div>
        <p className="mb-0 mt-4 text-sm text-muted">{t.release.opens(date)}</p>
      </Panel>
    </AuthShell>
  )
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div
      aria-hidden
      className="flex-1 rounded-2xl bg-app px-2 py-3 text-center"
    >
      <div className="font-mono text-3xl font-semibold tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  )
}
