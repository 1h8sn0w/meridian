import { useId } from 'react'
import {
  CENTER,
  CLOCK_SIZE,
  HOUR_MARKS,
  RING_RADIUS,
  RING_WIDTH,
  angleOf,
  arcPath,
  formatMinute,
  labelPoint,
  phaseAt,
  pointAt,
  slotAt,
  windowMiddle,
} from '../lib/day-clock'
import { useMealWindows } from '../lib/meal-windows'
import { useMessages } from '../lib/i18n/use-messages'

const WINDOW_GAP_MINUTES = 6
const TICK_OUTER = RING_RADIUS - RING_WIDTH / 2 - 5
const HOUR_LABEL_RADIUS = RING_RADIUS - 36

export function DayClock({
  minutes,
  full = false,
}: {
  minutes: number
  full?: boolean
}) {
  const ids = useId()
  const t = useMessages()
  const { windows } = useMealWindows()
  const active = slotAt(minutes, windows)
  const night = phaseAt(minutes, windows) === 'night'

  const sentence = active.type
    ? t.clock.nowMeal(formatMinute(minutes), active.type)
    : t.clock.nowNight(formatMinute(minutes)) +
      (active.next
        ? t.clock.nextMeal(
            active.next.type,
            formatMinute(active.next.startMinute),
          )
        : '')

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox={`0 0 ${CLOCK_SIZE} ${CLOCK_SIZE}`}
        className={full ? 'block h-auto w-full max-w-sm' : 'block'}
        width={full ? undefined : 132}
        height={full ? undefined : 132}
        role="img"
        aria-label={sentence}
      >
        <defs>
          <filter
            id={ids + 'glow'}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur stdDeviation="6" />
          </filter>
          <mask id={ids + 'moon'}>
            <circle cx={CENTER} cy={CENTER - RING_RADIUS} r={10} fill="white" />
            <circle
              cx={CENTER + 5}
              cy={CENTER - RING_RADIUS - 4}
              r={8}
              fill="black"
            />
          </mask>
        </defs>

        <circle
          className="stroke-line"
          cx={CENTER}
          cy={CENTER}
          r={RING_RADIUS}
          fill="none"
          strokeWidth={1}
        />

        {full
          ? Array.from({ length: 24 }, (_, hour) => {
              const major = hour % 6 === 0
              const [x1, y1] = pointAt(hour * 60, TICK_OUTER)
              const [x2, y2] = pointAt(hour * 60, TICK_OUTER - (major ? 5 : 3))
              return (
                <line
                  key={hour}
                  className={major ? 'stroke-muted' : 'stroke-subtle'}
                  strokeOpacity={major ? 0.7 : 0.45}
                  strokeWidth={major ? 1.5 : 1}
                  strokeLinecap="round"
                  x1={x1.toFixed(1)}
                  y1={y1.toFixed(1)}
                  x2={x2.toFixed(1)}
                  y2={y2.toFixed(1)}
                />
              )
            })
          : null}

        {full
          ? HOUR_MARKS.map((mark) => {
              const [x, y] = pointAt(mark, HOUR_LABEL_RADIUS)
              return (
                <text
                  key={mark}
                  className="fill-subtle font-mono text-xs"
                  x={x.toFixed(1)}
                  y={y.toFixed(1)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {String(mark / 60).padStart(2, '0')}
                </text>
              )
            })
          : null}

        {windows.map((w, index) => {
          const on = active.type === w.type
          const from = w.startMinute + WINDOW_GAP_MINUTES
          const to = w.endMinute - WINDOW_GAP_MINUTES
          const now = Math.min(Math.max(minutes, from), to)
          const delay = { animationDelay: `${index * 90}ms` }
          return (
            <g key={w.type}>
              <path
                className={`motion-safe:animate-draw ${on ? 'stroke-sun opacity-35' : 'stroke-segment'}`}
                style={delay}
                d={arcPath(from, to)}
                pathLength={1}
                strokeDasharray={1}
                fill="none"
                strokeWidth={RING_WIDTH}
              />
              {on && now > from ? (
                <>
                  <path
                    className="stroke-sun opacity-50"
                    d={arcPath(from, now)}
                    fill="none"
                    strokeWidth={RING_WIDTH}
                    filter={`url(#${ids}glow)`}
                  />
                  <path
                    className="stroke-sun motion-safe:animate-draw"
                    style={delay}
                    d={arcPath(from, now)}
                    pathLength={1}
                    strokeDasharray={1}
                    fill="none"
                    strokeWidth={RING_WIDTH}
                  />
                </>
              ) : null}
            </g>
          )
        })}

        {full
          ? windows.map((w) => {
              const point = labelPoint(windowMiddle(w))
              const on = active.type === w.type
              return (
                <text
                  key={w.type}
                  className={
                    on
                      ? 'fill-content text-xs font-semibold'
                      : 'fill-muted text-xs'
                  }
                  x={point.x.toFixed(1)}
                  y={point.y.toFixed(1)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >
                  {t.common.mealType[w.type]}
                </text>
              )
            })
          : null}

        <g
          key={minutes < 720 ? 'am' : 'pm'}
          className="sun-orbit"
          style={{ transform: `rotate(${angleOf(minutes)}deg)` }}
        >
          <circle
            className="fill-sun opacity-45 transform-fill origin-center motion-safe:animate-breathe"
            cx={CENTER}
            cy={CENTER - RING_RADIUS}
            r={20}
            filter={`url(#${ids}glow)`}
          />
          {night ? (
            <rect
              className="fill-sun"
              x={CENTER - 12}
              y={CENTER - RING_RADIUS - 12}
              width={24}
              height={24}
              mask={`url(#${ids}moon)`}
            />
          ) : (
            <circle
              className="fill-sun stroke-sky"
              cx={CENTER}
              cy={CENTER - RING_RADIUS}
              r={9}
              strokeWidth={3}
            />
          )}
        </g>

        {full ? (
          <>
            <text
              className="fill-content font-mono text-2xl font-semibold tabular-nums"
              x={CENTER}
              y={CENTER - 6}
              textAnchor="middle"
            >
              {formatMinute(minutes)}
            </text>
            <text
              className="fill-content text-sm font-semibold"
              x={CENTER}
              y={CENTER + 18}
              textAnchor="middle"
            >
              {active.type ? t.common.mealType[active.type] : t.clock.night}
            </text>
            <text
              className="fill-muted text-xs"
              x={CENTER}
              y={CENTER + 36}
              textAnchor="middle"
            >
              {active.type
                ? t.clock.until(formatMinute(active.window.endMinute))
                : active.next
                  ? t.clock.nextShort(
                      active.next.type,
                      formatMinute(active.next.startMinute),
                    )
                  : ''}
            </text>
          </>
        ) : null}
      </svg>

      {full ? null : (
        <p className="mb-0 mt-3 text-center text-sm text-muted">{sentence}</p>
      )}
    </div>
  )
}
