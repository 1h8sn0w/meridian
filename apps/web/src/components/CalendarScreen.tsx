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
 *
 * **Сітка тижня й панель дня — окремі компоненти з `key`.** Кожен має власний
 * запит до бази, і при зміні діапазону `useQuery` якийсь час віддає ще СТАРІ
 * рядки. Ключ робить зміну діапазону новим монтуванням: замість чужих даних
 * компонент чесно починає з «завантажується». Тримати це прапорцем
 * «зараз перезапитуємо» не вийшло б — той самий прапорець підіймається й на
 * звичайний прихід даних із sync, і тоді сітка блимала б порожнечею на кожній
 * порції синхронізації. Кнопки гортання лишаються ЗОВНІ ключа: інакше
 * перемонтування забирало б у них фокус на кожному натисканні.
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
import type { DayCalories, Meal } from '@meridian/core'
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
import { AppShell } from './AppShell'
import { Button, Hint, Meta, Panel, Tag, Warn } from './ui'

/** Тиждень в Україні — з понеділка, як у `startOfWeek`. */
const DOW_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'] as const

/**
 * Однакові тексти від різних запитів схлопуємо: та сама помилка бази, показана
 * двічі, нікому не допомагає — а `key` у React вона ще й ламає.
 */
function unique(problems: ReadonlyArray<string>): Array<string> {
  return [...new Set(problems)]
}

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

  const plannedRead = usePlannedDayCount(ownerId)
  const problems = unique([
    ...mealsRead.problems,
    ...profilesRead.problems,
    ...plannedRead.problems,
  ])

  // Кнопка повертає ОБИДВА: і тиждень, і вибір. Тож ховати її можна лише тоді,
  // коли обидва вже на сьогодні. Інакше після «‹ → вибрати день → ›» вибір
  // лишався б у минулому тижні, жодна клітинка не була б підсвічена — і
  // повернутися до сьогодні не було б чим.
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

              <WeekGrid
                key={start}
                ownerId={ownerId}
                start={start}
                end={end}
                selected={selected}
                todayKey={todayKey}
                meals={mealsRead.data}
                onSelect={(date) => setView({ start, selected: date })}
              />

              {atToday ? null : (
                <div className="mt-2">
                  <Button block onClick={() => setView(null)}>
                    Сьогодні
                  </Button>
                </div>
              )}
            </Panel>
          ) : null}

          {/* Порожня історія — нормальний перший стан, і кажемо це прямо. */}
          {plannedRead.data === 0 && !plannedRead.isLoading ? (
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

/* ==========================================================================
 * Сітка тижня
 * ======================================================================== */

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
      {unique(daysRead.problems).map((problem) => (
        <Warn key={problem}>{problem}</Warn>
      ))}

      <div className="grid grid-cols-7 gap-1">
        {DOW_LABELS.map((dow, i) => {
          const key = addDays(start, i)
          const day = daysRead.data.get(key)
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
                (daysRead.isLoading
                  ? ''
                  : day
                    ? kcal
                      ? ', ' + kcal
                      : ''
                    : ', без плану')
              }
              onClick={() => onSelect(key)}
              className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-0 py-1.5 text-content ${border}`}
            >
              <span className="text-xs text-muted">{dow}</span>
              <span className="text-sm font-semibold">
                {Number(key.slice(8, 10))}
              </span>
              {/* «—» — плану немає; порожньо — або план є без цифр, або
                  вибірка ще в дорозі й стверджувати нічого не можна. */}
              <span className="max-w-full truncate px-0.5 text-xs text-muted">
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

/* ==========================================================================
 * Панель вибраного дня — лише перегляд
 * ======================================================================== */

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
  const problems = unique([...daysRead.problems, ...planRead.problems])

  return (
    <Panel>
      <h2 className="mb-2 mt-0 text-base font-bold">
        {formatDayTitle(date)}{' '}
        {date === todayKey ? <Tag tone="accent">сьогодні</Tag> : null}
      </h2>

      {problems.map((problem) => (
        <Warn key={problem}>{problem}</Warn>
      ))}

      {!day ? (
        // Доки запит у дорозі, «плану немає» було б неправдою — мовчимо.
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

          <DaySummary calories={day.calories} plan={planRead.data} />

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
  calories,
  plan,
}: {
  calories: DayCalories
  plan: { target: number; corridor: number } | null
}) {
  const total = formatDayCalories(calories)
  if (!total) {
    return (
      <p className="mb-0 mt-2.5 text-sm text-muted">
        Калорійність дня невідома — у страв цього дня немає цифр.
      </p>
    )
  }
  const within =
    plan !== null &&
    calories.unknown === 0 &&
    Math.abs(calories.total - plan.target) <= plan.corridor
  // Без відомої цілі сума — довідка, а не вирок, тож і колір нейтральний.
  const tone =
    plan === null ? 'text-muted' : within ? 'text-success' : 'text-warning'
  return (
    <p className={`mb-0 mt-2.5 text-sm ${tone}`}>
      Разом: {total}
      {plan ? ` · ціль ${plan.target} ± ${plan.corridor} ккал` : ''}
      {calories.unknown > 0
        ? ' · сума неповна: без цифр ' + calories.unknown + ' слот(и)'
        : within || !plan
          ? ''
          : ' · поза коридором'}
    </p>
  )
}
