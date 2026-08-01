/**
 * Знак Meridian на екранах входу (MER-45) — кільце доби з вікнами прийомів.
 *
 * Малюється в два кроки навмисно: кільце приїжджає з сервера як частина
 * розмітки, а стрілка й підпис зʼявляються вже у браузері. Час — це стан
 * пристрою, і рендерити його на сервері означало б показати чужий годинник, а
 * потім смикнути розмітку під час гідратації.
 */

import { useEffect, useState } from 'react'
import {
  CLOCK_SIZE,
  MEAL_WINDOWS,
  RING_RADIUS,
  RING_WIDTH,
  arcPath,
  formatMinute,
  handPoints,
  slotAt,
} from '../lib/day-clock'

/** Зазор 6 хв з кожного боку — щоб межі вікон читались, як у V1. */
const GAP = 6

export function DayClock() {
  const [minutes, setMinutes] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setMinutes(now.getHours() * 60 + now.getMinutes())
    }
    tick()
    const timer = window.setInterval(tick, 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const active = minutes === null ? null : slotAt(minutes)
  const hand = minutes === null ? null : handPoints(minutes)

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`}
        width="132"
        height="132"
        role="img"
        aria-label="Годинник прийомів їжі"
      >
        <circle
          className="stroke-line opacity-50"
          cx={CLOCK_SIZE / 2}
          cy={CLOCK_SIZE / 2}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_WIDTH}
        />
        {MEAL_WINDOWS.map((w) => (
          <path
            key={w.type}
            className={
              active?.type === w.type ? 'stroke-accent' : 'stroke-segment'
            }
            d={arcPath(w.startMinute + GAP, w.endMinute - GAP)}
            fill="none"
            strokeWidth={RING_WIDTH}
            strokeLinecap="butt"
          />
        ))}
        {hand ? (
          <line
            className="stroke-warning"
            strokeWidth={2}
            strokeLinecap="round"
            x1={hand.x1}
            y1={hand.y1}
            x2={hand.x2}
            y2={hand.y2}
          />
        ) : null}
      </svg>

      {/* Поки годинник не прочитано, місце під підпис лишається зайнятим —
          інакше форма підстрибує на першому кадрі після гідратації. */}
      <p className="mb-0 mt-2 min-h-5 text-sm text-muted">
        {minutes === null || active === null ? null : active.type ? (
          <>
            Зараз <span className="text-accent">{formatMinute(minutes)}</span> —
            час {active.window.genitive}.
          </>
        ) : (
          <>
            Зараз <span className="text-accent">{formatMinute(minutes)}</span> —
            нічний час.
            {active.next
              ? ` ${active.next.label} о ${formatMinute(active.next.startMinute)}.`
              : null}
          </>
        )}
      </p>
    </div>
  )
}
