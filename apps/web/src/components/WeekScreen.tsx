/**
 * Екран «Тиждень» (MER-10, MER-13, MER-49) — ядро продукту в інтерфейсі.
 *
 * Кнопка «Перегенерувати» має виконувати обіцянку з AGENTS.md: за секунди —
 * інший валідний тиждень, який тримає правила дієтолога. Сам добір робить
 * `generateWeek` з ядра; тут — те, що навколо: звідки взяти пул, як заповнити
 * вікно антиповтору через межу тижнів і як записати результат так, щоб не
 * зіткнутися з чужим пристроєм.
 *
 * **Попередження генератора показуються як є.** Він чесно каже, коли розширив
 * коридор, коли мікс планів був неможливий і коли страва без калорійності не
 * брала участі в доборі. Ховати це означало б видати послаблений тиждень за
 * повноцінний.
 */

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { usePowerSync } from '@powersync/react'
import {
  DEFAULTS,
  MEAL_TYPE_LABELS,
  addDays,
  dateKey,
  formatCalories,
  formatMealCalories,
  generateWeek,
  planOwnerId,
  poolForProfile,
  precedingMealIds,
  precedingWindow,
} from '@meridian/core'
import type { MealType, TastePrefs } from '@meridian/core'
import { useActiveProfile } from '../lib/active-profile'
import {
  prefOf,
  useMeals,
  usePrecedingSlots,
  useProfiles,
  useTastePrefs,
  useWeek,
} from '../lib/data/queries'
import type { DayView, WeekView } from '../lib/data/model'
import { saveWeek } from '../lib/data/mutations'
import { formatDayTitle, formatMoment } from '../lib/format'
import { useNow } from '../lib/use-now'
import { AppShell } from './AppShell'
import { SwapDialog } from './SwapDialog'
import { TasteMark } from './TodayScreen'
import { Button, Hint, Meta, Panel, Tag, Warn } from './ui'

export function WeekScreen({ familyId }: { familyId: string }) {
  const db = usePowerSync()
  const now = useNow()
  const todayKey = now === null ? '' : dateKey(now)

  const mealsRead = useMeals()
  const profilesRead = useProfiles()
  const prefsRead = useTastePrefs()
  const { profile } = useActiveProfile(profilesRead.data)
  const ownerId = profile ? planOwnerId(profile) : null
  const owner = profilesRead.data.find((p) => p.id === ownerId) ?? profile
  const week = useWeek(ownerId, mealsRead.data, todayKey)

  const antiRepeatDays =
    week.data?.params.antiRepeatDays ?? DEFAULTS.antiRepeatDays
  const windowSize = precedingWindow(antiRepeatDays)
  const preceding = usePrecedingSlots(
    ownerId,
    todayKey ? addDays(todayKey, -windowSize) : '',
    todayKey,
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [swapping, setSwapping] = useState<{
    dayIndex: number
    slot: MealType
  } | null>(null)

  // MER-17: спільний план перегенерує лише власник — інакше пов'язані профілі
  // перезаписували б одне сімейне меню різними цілями.
  const sharedNote =
    profile && profile.sharedPlanWith
      ? 'Цей профіль користується спільним планом профілю «' +
        (owner?.name ?? '—') +
        '». Перегенерувати може лише власник.'
      : null

  const regenerate = async () => {
    if (!owner || !ownerId || !todayKey) return
    setBusy(true)
    setError(null)
    try {
      const result = generateWeek(mealsRead.data, {
        profile: owner,
        prefs: prefsRead.data,
        antiRepeatDays: week.data?.params.antiRepeatDays,
        days: week.data?.params.days,
        // MER-29: вікно антиповтору заповнюється реальними попередніми днями
        // календаря, а не лише днями цього виклику.
        precedingDays: precedingMealIds(preceding, todayKey, windowSize),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      // План завжди починається сьогоднішньою датою — так минулі дні лишаються
      // недоторканою історією (MER-33).
      await saveWeek(db, familyId, {
        ownerId,
        startDate: todayKey,
        plan: result,
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const view = week.data
  const problems = [
    ...mealsRead.problems,
    ...profilesRead.problems,
    ...prefsRead.problems,
    ...week.problems,
  ]

  return (
    <AppShell
      title="Тиждень"
      subtitle={
        view
          ? `Ціль ${view.params.targetCalories} ± ${view.usedCorridor} ккал/день`
          : 'План на 7 днів'
      }
    >
      {problems.map((problem) => (
        <Warn key={problem}>{problem}</Warn>
      ))}

      {!profile ? (
        <Panel title="Спершу — профіль">
          <Hint>
            Ціль калорійності й коридор генератор бере з профілю. Створіть його
            на екрані «Сьогодні».
          </Hint>
        </Panel>
      ) : (
        <Panel>
          <Button
            block
            variant="primary"
            disabled={busy || !!sharedNote || !todayKey}
            onClick={() => void regenerate()}
          >
            {busy
              ? 'Збираємо тиждень…'
              : view
                ? 'Перегенерувати тиждень'
                : 'Згенерувати тиждень'}
          </Button>

          {/* MER-62: список покупок збирається з інгредієнтів страв цього
              плану, тож і вхід у нього — тут, як у V1. Окремої вкладки він не
              отримує: п'ять уже є, а список без плану порожній за визначенням. */}
          {view ? (
            <Link to="/shopping" className="mt-2 block no-underline">
              <Button block>Список покупок</Button>
            </Link>
          ) : null}

          {error ? <Warn>{error}</Warn> : null}
          {sharedNote && !error ? <Meta>{sharedNote}</Meta> : null}

          {view ? (
            <PlanSummary view={view} owner={owner} />
          ) : (
            <Hint>
              Плану ще немає. Натисніть кнопку — генератор збере тиждень із пулу
              страв за правилами дієтолога: тип слота, коридор калорій,
              антиповтор і мікс планів.
            </Hint>
          )}
        </Panel>
      )}

      {view?.days.map((day, dayIndex) => (
        <DayCard
          key={day.date}
          day={day}
          target={view.params.targetCalories}
          corridor={view.usedCorridor}
          prefs={prefsRead.data}
          onSwap={(slot) => setSwapping({ dayIndex, slot })}
        />
      ))}

      {view ? (
        <Panel>
          <Hint>
            Щоб замінити окрему страву, натисніть «⇄» у її рядку — діалог
            запропонує страви того ж типу з прогнозом калорій дня.
          </Hint>
        </Panel>
      ) : null}

      {swapping && view ? (
        <SwapDialog
          view={view}
          dayIndex={swapping.dayIndex}
          slot={swapping.slot}
          pool={poolForProfile(mealsRead.data, owner)}
          prefs={prefsRead.data}
          onClose={() => setSwapping(null)}
        />
      ) : null}
    </AppShell>
  )
}

/* ==========================================================================
 * Підсумок плану
 * ======================================================================== */

function PlanSummary({
  view,
  owner,
}: {
  view: WeekView
  owner: { targetCalories: number; corridor: number } | null
}) {
  const known = view.days.filter((day) => day.calories.unknown === 0)
  const total = known.reduce((sum, day) => sum + day.calories.total, 0)
  const approx = view.days.some((day) => day.calories.approx)
  const incomplete = view.days.length - known.length

  // MER-41: профіль змінили після генерації — план міг застаріти.
  const stale =
    owner !== null &&
    (owner.targetCalories !== view.params.targetCalories ||
      owner.corridor !== view.params.corridor)

  const hasToday = view.days.some((day) => day.isToday)

  return (
    <>
      {known.length ? (
        <Meta>
          Разом за {known.length} дн.: {formatCalories(total, approx)} · у
          середньому {formatCalories(Math.round(total / known.length), approx)}
          /день. Ціль {view.params.targetCalories} ± {view.usedCorridor} ккал.
          {view.sources.length
            ? ' Джерела: ' + view.sources.join(', ') + '.'
            : ''}
        </Meta>
      ) : null}

      {incomplete > 0 ? (
        <Meta>
          У {incomplete} дн. калорійність відома не для всіх слотів — ці дні в
          суму не входять.
        </Meta>
      ) : null}

      <Meta>Згенеровано {formatMoment(view.generatedAt)}.</Meta>

      {view.warnings.map((warning) => (
        <Warn key={warning}>{warning}</Warn>
      ))}

      {view.missing > 0 ? (
        <Warn>
          {view.missing} слот(и) посилаються на страви, яких уже немає в пулі —
          перегенеруйте тиждень.
        </Warn>
      ) : null}

      {stale ? (
        <Warn>
          Профіль змінився після генерації (ціль або коридор) — перегенеруйте
          тиждень.
        </Warn>
      ) : null}

      {!hasToday ? (
        <Warn>Сьогодні поза періодом цього плану — перегенеруйте тиждень.</Warn>
      ) : null}
    </>
  )
}

/* ==========================================================================
 * Картка дня
 * ======================================================================== */

function DayCard({
  day,
  target,
  corridor,
  prefs,
  onSwap,
}: {
  day: DayView
  target: number
  corridor: number
  prefs: TastePrefs
  onSwap: (slot: MealType) => void
}) {
  const total = formatCalories(day.calories.total, day.calories.approx)
  const within =
    day.calories.unknown === 0 &&
    Math.abs(day.calories.total - target) <= corridor

  return (
    <section
      className={`mb-3.5 rounded-xl border bg-surface px-4 py-3.5 ${
        day.isToday ? 'border-accent' : 'border-line'
      }`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2.5">
        <div className="text-sm font-semibold">
          {formatDayTitle(day.date)}{' '}
          {day.isToday ? <Tag tone="accent">сьогодні</Tag> : null}
        </div>
        <div
          className={`whitespace-nowrap text-sm ${
            within ? 'text-success' : 'text-warning'
          }`}
        >
          {total || 'калорійність невідома'}
          {total && !within
            ? day.calories.unknown > 0
              ? ' · сума неповна'
              : ' · поза коридором'
            : ''}
        </div>
      </div>

      {day.slots.map((slotView) => (
        <div
          key={slotView.id}
          className="flex items-baseline gap-2.5 border-b border-line py-2 last:border-b-0 last:pb-0.5"
        >
          <span className="w-20 flex-none text-xs text-muted">
            {MEAL_TYPE_LABELS[slotView.slot]}
          </span>
          <span className="flex-1 text-sm">
            {slotView.meal ? (
              <>
                <TasteMark value={prefOf(prefs, slotView.mealId)} />{' '}
                {slotView.meal.name}
              </>
            ) : (
              <span className="text-warning">страву видалено з пулу</span>
            )}
          </span>
          <span className="whitespace-nowrap text-xs text-muted">
            {slotView.meal ? formatMealCalories(slotView.meal) : ''}
          </span>
          {/* MER-33: минулий день не редагується. */}
          {day.isPast ? null : (
            <button
              type="button"
              title="Замінити страву"
              aria-label={'Замінити страву: ' + MEAL_TYPE_LABELS[slotView.slot]}
              onClick={() => onSwap(slotView.slot)}
              className="flex-none cursor-pointer self-center rounded-lg border border-line bg-transparent px-2.5 py-1 text-sm leading-none text-muted"
            >
              ⇄
            </button>
          )}
        </div>
      ))}
    </section>
  )
}
