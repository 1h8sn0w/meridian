import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import {
  MEAL_TYPE_LABELS,
  addDays,
  dateKey,
  formatDayCalories,
  formatMealCalories,
  startOfWeek,
} from '@meridian/core'
import type { Meal } from '@meridian/core'
import { useActiveProfile } from '../lib/active-profile'
import {
  useCalendarDays,
  useDayPlan,
  useMeals,
  usePlannedDayCount,
  useProfiles,
} from '../lib/data/queries'
import { formatDayTitle, formatWeekRange, plural } from '../lib/format'
import { useNow } from '../lib/use-now'
import type { CalendarSearch } from '../lib/calendar-search'
import { AppShell } from './AppShell'
import { DayTotal } from './DayTotal'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { RecipeLink } from './RecipeLink'
import { Button, Hint, IconButton, Meta, Panel, Problems, Tag } from './ui'

const DOW_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const

export function CalendarScreen() {
  const todayKey = dateKey(useNow())

  const mealsRead = useMeals()
  const profilesRead = useProfiles()
  const {
    profile,
    planOwnerId: ownerId,
    planOwner: owner,
  } = useActiveProfile(profilesRead.data)

  const search = useSearch({ from: '/calendar' })
  const selected = search.day ?? todayKey
  const start = search.week ?? (selected ? startOfWeek(selected) : '')
  const end = start ? addDays(start, 6) : ''
  const navigate = useNavigate({ from: '/calendar' })
  const setView = (next: CalendarSearch) =>
    void navigate({
      search: next,
      replace: true,
      resetScroll: false,
      viewTransition: false,
    })

  const plannedRead = usePlannedDayCount(ownerId)
  const problems = [
    mealsRead.problems,
    profilesRead.problems,
    plannedRead.problems,
  ]

  const atToday =
    todayKey !== '' &&
    start <= todayKey &&
    todayKey <= end &&
    selected === todayKey

  return (
    <AppShell
      title="Календар"
      subtitle={
        plannedRead.data > 0
          ? `Заплановано ${plannedRead.data} ${plural(plannedRead.data, 'день', 'дні', 'днів')}`
          : 'Історія та плани'
      }
    >
      <Problems of={problems} />

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
              <div className="mb-3 flex items-center justify-between gap-2">
                <IconButton
                  label="Попередній тиждень"
                  onClick={() =>
                    setView({ week: addDays(start, -7), day: selected })
                  }
                >
                  <CaretLeft size={16} weight="bold" />
                </IconButton>
                <span className="text-base font-semibold tracking-tight">
                  {formatWeekRange(start, end)}
                </span>
                <IconButton
                  label="Наступний тиждень"
                  onClick={() =>
                    setView({ week: addDays(start, 7), day: selected })
                  }
                >
                  <CaretRight size={16} weight="bold" />
                </IconButton>
              </div>

              <WeekGrid
                key={start}
                ownerId={ownerId}
                start={start}
                end={end}
                selected={selected}
                todayKey={todayKey}
                meals={mealsRead.data}
                onSelect={(date) => setView({ day: date })}
              />

              {atToday ? null : (
                <div className="mt-3">
                  <Button block onClick={() => setView({})}>
                    Сьогодні
                  </Button>
                </div>
              )}
            </Panel>
          ) : null}

          {plannedRead.data === 0 && !plannedRead.isLoading ? (
            <Panel>
              <Hint>
                Історія порожня — ще жоден тиждень не згенеровано. Згенеруйте
                перший на екрані «Тиждень», і його дні з’являться тут.
              </Hint>
              <Link to="/week" className="block no-underline">
                <Button block>Відкрити екран «Тиждень»</Button>
              </Link>
            </Panel>
          ) : null}

          {selected ? (
            <DaySection
              key={selected}
              ownerId={ownerId}
              date={selected}
              todayKey={todayKey}
              meals={mealsRead.data}
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

function WeekGrid({
  ownerId,
  start,
  end,
  selected,
  todayKey,
  meals,
  onSelect,
}: {
  ownerId: string | null
  start: string
  end: string
  selected: string
  todayKey: string
  meals: ReadonlyArray<Meal>
  onSelect: (date: string) => void
}) {
  const daysRead = useCalendarDays(ownerId, start, end, meals)

  return (
    <>
      <Problems of={[daysRead.problems]} />

      <div className="grid grid-cols-7 gap-1 motion-safe:animate-rise">
        {DOW_LABELS.map((dow, i) => {
          const key = addDays(start, i)
          const day = daysRead.data.get(key)
          const kcal = day ? formatDayCalories(day.calories) : ''
          const isSelected = key === selected
          const border = isSelected
            ? 'border-transparent bg-accent-fill text-button-ink shadow-accent'
            : key === todayKey
              ? 'border-accent bg-app text-content'
              : 'border-transparent bg-app text-content hover:border-line'
          return (
            <button
              key={key}
              type="button"
              aria-pressed={isSelected}
              aria-label={
                formatDayTitle(key) +
                (daysRead.isLoading
                  ? ''
                  : day
                    ? kcal
                      ? ', ' + kcal
                      : ''
                    : ', без плану')
              }
              onClick={() => onSelect(key)}
              className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-2xl border px-0 py-2 transition duration-300 ease-spring active:scale-95 ${border}`}
            >
              <span className="text-xs opacity-70">{dow}</span>
              <span className="font-mono text-base font-semibold tabular-nums">
                {Number(key.slice(8, 10))}
              </span>
              <span className="max-w-full truncate px-0.5 font-mono text-xs tabular-nums opacity-70">
                {daysRead.isLoading
                  ? ''
                  : day
                    ? kcal.replace(' ккал', '')
                    : '—'}
              </span>
            </button>
          )
        })}
      </div>
    </>
  )
}

function DaySection({
  ownerId,
  date,
  todayKey,
  meals,
}: {
  ownerId: string | null
  date: string
  todayKey: string
  meals: ReadonlyArray<Meal>
}) {
  const daysRead = useCalendarDays(ownerId, date, date, meals)
  const planRead = useDayPlan(ownerId, date)
  const day = daysRead.data.get(date) ?? null
  const problems = [daysRead.problems, planRead.problems]

  return (
    <Panel>
      <h2 className="mb-2 mt-0 text-lg font-semibold tracking-tight">
        {formatDayTitle(date)}{' '}
        {date === todayKey ? <Tag tone="accent">сьогодні</Tag> : null}
      </h2>

      <Problems of={problems} />

      {!day ? (
        daysRead.isLoading ? null : (
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
              className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-muted">
                  {MEAL_TYPE_LABELS[slotView.slot]}
                </span>
                <span className="block text-sm font-medium leading-snug">
                  {slotView.meal ? (
                    <RecipeLink mealId={slotView.mealId}>
                      {slotView.meal.name}
                    </RecipeLink>
                  ) : (
                    <span className="text-warning">страву видалено з пулу</span>
                  )}
                </span>
              </span>
              <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted">
                {slotView.meal ? formatMealCalories(slotView.meal) : ''}
              </span>
            </div>
          ))}

          <DayTotal calories={day.calories} plan={planRead.data} />

          {todayKey && date < todayKey ? (
            <Meta>Минулий день — незмінна історія, лише перегляд.</Meta>
          ) : null}
        </>
      )}
    </Panel>
  )
}
