/**
 * Годинник дня (MER-45, MER-49) — кільце доби з вікнами прийомів.
 *
 * Два розміри однієї фігури: значок на екранах входу й повний циферблат на
 * «Сьогодні». Різниця лише в підписах — геометрія спільна, бо це той самий знак
 * застосунку.
 *
 * Час приходить згори (`useNow`), а не читається тут: активний прийом і картка
 * страви під ним мусять показувати одну й ту саму хвилину. Доки часу немає
 * (сервер, перший кадр) — малюємо кільце без стрілки: чужий годинник показувати
 * не можна.
 */

import {
  CENTER,
  CLOCK_SIZE,
  HOUR_MARKS,
  MEAL_WINDOWS,
  RING_RADIUS,
  RING_WIDTH,
  arcPath,
  formatMinute,
  handPoints,
  labelPoint,
  slotAt,
  windowMiddle,
} from '../lib/day-clock'

/** Зазор 6 хв з кожного боку — щоб межі вікон читались, як у V1. */
const GAP = 6

export function DayClock({
  minutes,
  full = false,
}: {
  minutes: number | null
  full?: boolean
}) {
  const active = minutes === null ? null : slotAt(minutes)
  const hand = minutes === null ? null : handPoints(minutes)

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`}
        className={full ? 'block h-auto w-full max-w-xs' : 'block'}
        width={full ? undefined : 132}
        height={full ? undefined : 132}
        role="img"
        aria-label="Годинник прийомів їжі"
      >
        <circle
          className="stroke-line opacity-50"
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={RING_WIDTH}
        />

        {full
          ? HOUR_MARKS.map((mark) => {
              const point = labelPoint(mark)
              return (
                <text
                  key={mark}
                  className="fill-muted text-xs opacity-70"
                  x={point.x.toFixed(1)}
                  y={point.y.toFixed(1)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {String(mark / 60).padStart(2, '0')}
                </text>
              )
            })
          : null}

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

        {full
          ? MEAL_WINDOWS.map((w) => {
              const point = labelPoint(windowMiddle(w))
              const on = active?.type === w.type
              return (
                <text
                  key={w.type}
                  className={
                    on
                      ? 'fill-accent text-xs font-semibold'
                      : 'fill-muted text-xs'
                  }
                  x={point.x.toFixed(1)}
                  y={point.y.toFixed(1)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {w.label}
                </text>
              )
            })
          : null}

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

        {full && active ? (
          <>
            <text
              className="fill-content text-base font-semibold"
              x={CENTER}
              y={CENTER - 4}
              textAnchor="middle"
            >
              {active.type ? active.window.label : 'Ніч'}
            </text>
            <text
              className="fill-muted text-xs"
              x={CENTER}
              y={CENTER + 17}
              textAnchor="middle"
            >
              {active.type
                ? 'до ' + formatMinute(active.window.endMinute)
                : active.next
                  ? active.next.label.toLowerCase() +
                    ' о ' +
                    formatMinute(active.next.startMinute)
                  : ''}
            </text>
          </>
        ) : null}
      </svg>

      {/* Поки годинник не прочитано, місце під підпис лишається зайнятим —
          інакше форма підстрибує на першому кадрі після гідратації. */}
      <p className="mb-0 mt-2 min-h-5 text-center text-sm text-muted">
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
