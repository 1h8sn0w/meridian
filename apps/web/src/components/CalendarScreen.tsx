/**
 * Екран «Календар» (MER-14, MER-61) — перегляд плану на будь-який день і
 * історія минулих тижнів.
 *
 * Форма та сама, що у V1: сітка одного тижня (пн–нд) із гортанням «‹ / ›»,
 * клік дня показує його прийоми та калорійність. Джерело — локальний SQLite за
 * календарним ключем «профіль + дата» (MER-66), тож екран однаково працює
 * офлайн і бачить дні будь-якого покоління плану.
 *
 * Екран суто читає. Минулі дні — незмінна історія (MER-33), а редагування
 * поточного тижня живе на екрані «Тиждень»: другий шлях запису до тих самих
 * слотів був би другим місцем для помилок LWW. Уся арифметика дат — через
 * `addDays`/`startOfWeek` з ядра: календарний зсув, а не «+24 години», інакше
 * осінній перехід DST дублює або з'їдає день (MER-34).
 */

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  MEAL_TYPE_LABELS,
  addDays,
  dateKey,
  formatDayCalories,
  formatMealCalories,
  planOwnerId,
  startOfWeek,
} from '@meridian/core'
import { useActiveProfile } from '../lib/active-profile'
import {
  useCalendarBounds,
  useCalendarDays,
  useDayPlan,
  useMeals,
  useProfiles,
} from '../lib/data/queries'
import type { CalendarDayView } from '../lib/data/model'
import { formatDayTitle, formatWeekRange, plural } from '../lib/format'
import { useNow } from '../lib/use-now'
import { AppShell } from './AppShell'
import { Button, Hint, Meta, Panel, Tag, Warn } from './ui'

/** Тиждень в Україні — з понеділка, як у `startOfWeek`. */
const DOW_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const

export function CalendarScreen() {
  const now = useNow()
  const todayKey = now === null ? '' : dateKey(now)

  const mealsRead = useMeals()
  const profilesRead = useProfiles()
  const { profile } = useActiveProfile(profilesRead.data)
  // MER-17/21: пов'язаний профіль дивиться календар власника спільного плану.
  const ownerId = profile ? planOwnerId(profile) : null
  const owner = profilesRead.data.find((p) => p.id === ownerId) ?? profile

  // Вид: понеділок видимого тижня + вибраний день. null — «тиждень сьогодні»:
  // до першої дії користувача вид їде за годинником пристрою, і кнопка
  // «Сьогодні» просто повертає це початкове положення.
  const [view, setView] = useState<{ start: string; selected: string } | null>(
    null,
  )
  const start = view ? view.start : todayKey ? startOfWeek(todayKey) : ''
  const selected = view ? view.selected : todayKey
  const end = start ? addDays(start, 6) : ''

  const daysRead = useCalendarDays(ownerId, start, end, mealsRead.data)
  // Вибраний день читається окремо: гортання тижнів не скидає вибір, тож він
  // може лежати поза видимим діапазоном — і панель дня має показувати його
  // по-справжньому, а не «плану немає» через звужену вибірку.
  const selectedRead = useCalendarDays(
    ownerId,
    selected,
    selected,
    mealsRead.data,
  )
  const boundsRead = useCalendarBounds(ownerId)
  const dayPlan = useDayPlan(ownerId, selected)

  const problems = [
    ...mealsRead.problems,
    ...profilesRead.problems,
    ...daysRead.problems,
    ...selectedRead.problems,
    ...boundsRead.problems,
  ]

  const bounds = boundsRead.data
  const todayInView = todayKey !== '' && start <= todayKey && todayKey <= end

  return (
    <AppShell
      title="Календар"
      subtitle={
        bounds
          ? `Заплановано ${bounds.count} ${plural(bounds.count, 'день', 'дні', 'днів')}`
          : 'Історія та плани'
      }
    >
      {problems.map((problem) => (
        <Warn key={problem}>{problem}</Warn>
      ))}

      {!profile ? (
        <Panel title="Спершу — профіль">
          <Hint>
            Календар показує план профілю. Створіть його на екрані «Сьогодні».
          </Hint>
        </Panel>
      ) : (
        <>
          {start ? (
            <Panel>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Button
                  aria-label="Попередній тиждень"
                  onClick={() =>
                    setView({ start: addDays(start, -7), selected })
                  }
                >
                  ‹
                </Button>
                <span className="text-sm font-semibold">
                  {formatWeekRange(start, end)}
                </span>
                <Button
                  aria-label="Наступний тиждень"
                  onClick={() =>
                    setView({ start: addDays(start, 7), selected })
                  }
                >
                  ›
                </Button>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {DOW_LABELS.map((dow, i) => {
                  const key = addDays(start, i)
                  // Доки вибірка тижня в дорозі, у мапі лежить попередній
                  // діапазон — «без плану» в цю мить було б неправдою.
                  const day = daysRead.isLoading
                    ? undefined
                    : daysRead.data.get(key)
                  const kcal = day ? formatDayCalories(day.calories) : ''
                  const isSelected = key === selected
                  const border = isSelected
                    ? 'border-accent bg-accent-soft'
                    : key === todayKey
                      ? 'border-accent bg-transparent'
                      : 'border-line bg-transparent'
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={
                        formatDayTitle(key) +
                        (day || daysRead.isLoading
                          ? kcal
                            ? ', ' + kcal
                            : ''
                          : ', без плану')
                      }
                      onClick={() => setView({ start, selected: key })}
                      className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-0 py-1.5 text-content ${border}`}
                    >
                      <span className="text-xs text-muted">{dow}</span>
                      <span className="text-sm font-semibold">
                        {Number(key.slice(8, 10))}
                      </span>
                      {/* «—» — плану немає; порожньо — план є, цифр немає
                          (або вибірка ще в дорозі). */}
                      <span className="max-w-full truncate px-0.5 text-xs text-muted">
                        {day
                          ? kcal.replace(' ккал', '')
                          : daysRead.isLoading
                            ? ''
                            : '—'}
                      </span>
                    </button>
                  )
                })}
              </div>

              {!todayInView ? (
                <div className="mt-2">
                  <Button block onClick={() => setView(null)}>
                    Сьогодні
                  </Button>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {/* Порожня історія — нормальний перший стан, і кажемо це прямо. */}
          {!bounds && !boundsRead.isLoading ? (
            <Panel>
              <Hint>
                Історія порожня — ще жоден тиждень не згенеровано. Згенеруйте
                перший на екрані «Тиждень», і його дні з’являться тут.
              </Hint>
              <Link to="/week" className="no-underline">
                <Button block>Відкрити екран «Тиждень»</Button>
              </Link>
            </Panel>
          ) : null}

          {selected ? (
            <DayPanel
              day={selectedRead.data.get(selected) ?? null}
              loading={selectedRead.isLoading}
              date={selected}
              todayKey={todayKey}
              plan={dayPlan}
            />
          ) : null}

          {profile.sharedPlanWith ? (
            <Meta>
              Це календар спільного плану профілю «{owner?.name ?? '—'}».
            </Meta>
          ) : null}
        </>
      )}
    </AppShell>
  )
}

/* ==========================================================================
 * Панель вибраного дня — лише перегляд
 * ======================================================================== */

function DayPanel({
  day,
  loading,
  date,
  todayKey,
  plan,
}: {
  day: CalendarDayView | null
  loading: boolean
  date: string
  todayKey: string
  plan: { target: number; corridor: number } | null
}) {
  return (
    <Panel>
      <h2 className="mb-2 mt-0 text-base font-bold">
        {formatDayTitle(date)}{' '}
        {date === todayKey ? <Tag tone="accent">сьогодні</Tag> : null}
      </h2>

      {!day ? (
        // Доки запит у дорозі, «плану немає» було б неправдою — мовчимо.
        loading ? null : (
          <Hint>
            На цей день плану немає.
            {todayKey && date >= todayKey
              ? ' Новий тиждень генерується на екрані «Тиждень» і починається сьогоднішнім днем.'
              : ''}
          </Hint>
        )
      ) : (
        <>
          {day.slots.map((slotView) => (
            <div
              key={slotView.id}
              className="flex items-baseline gap-2.5 border-b border-line py-2 last:border-b-0"
            >
              <span className="w-20 flex-none text-xs text-muted">
                {MEAL_TYPE_LABELS[slotView.slot]}
              </span>
              <span className="flex-1 text-sm">
                {slotView.meal ? (
                  slotView.meal.name
                ) : (
                  <span className="text-warning">страву видалено з пулу</span>
                )}
              </span>
              <span className="whitespace-nowrap text-xs text-muted">
                {slotView.meal ? formatMealCalories(slotView.meal) : ''}
              </span>
            </div>
          ))}

          <DaySummary day={day} plan={plan} />

          {/* MER-33: минулий день — незмінна історія. */}
          {todayKey && date < todayKey ? (
            <Meta>Минулий день — незмінна історія, лише перегляд.</Meta>
          ) : null}
        </>
      )}
    </Panel>
  )
}

/**
 * Підсумок дня. Ціль і коридор — від плану, що покривав дату (`useDayPlan`);
 * без нього показуємо лише суму: вигадувати ціль заднім числом не можна.
 * Неповна сума називається неповною окремим текстом, а не «≈» (MER-26).
 */
function DaySummary({
  day,
  plan,
}: {
  day: CalendarDayView
  plan: { target: number; corridor: number } | null
}) {
  const total = formatDayCalories(day.calories)
  if (!total) {
    return (
      <p className="mb-0 mt-2.5 text-sm text-muted">
        Калорійність дня невідома — у страв цього дня немає цифр.
      </p>
    )
  }
  const within =
    plan !== null &&
    day.calories.unknown === 0 &&
    Math.abs(day.calories.total - plan.target) <= plan.corridor
  // Без відомої цілі сума — довідка, а не вирок, тож і колір нейтральний.
  const tone =
    plan === null ? 'text-muted' : within ? 'text-success' : 'text-warning'
  return (
    <p className={`mb-0 mt-2.5 text-sm ${tone}`}>
      Разом: {total}
      {plan ? ` · ціль ${plan.target} ± ${plan.corridor} ккал` : ''}
      {day.calories.unknown > 0
        ? ' · сума неповна: без цифр ' + day.calories.unknown + ' слот(и)'
        : within || !plan
          ? ''
          : ' · поза коридором'}
    </p>
  )
}
