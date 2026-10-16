import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { usePowerSync } from '@powersync/react'
import {
  MEAL_TYPE_LABELS,
  addDays,
  dateKey,
  dayInCorridor,
  formatCalories,
  formatDayCalories,
  formatMealCalories,
  generateWeek,
  generationPool,
  poolForProfile,
  poolShortage,
  poolShortageMessage,
  portionOf,
  precedingMealIds,
  precedingWindow,
} from '@meridian/core'
import type {
  MealType,
  PortionLetter,
  Profile,
  TastePrefs,
} from '@meridian/core'
import { useActiveProfile } from '../lib/active-profile'
import {
  prefOf,
  useAntiRepeatDays,
  useMeals,
  usePrecedingSlots,
  useProfiles,
  useTastePrefs,
  useWeek,
} from '../lib/data/queries'
import { manualSwapsAhead } from '../lib/data/model'
import type { DayView, WeekView } from '../lib/data/model'
import { saveWeek } from '../lib/data/mutations'
import { formatDayTitle, formatMoment, plural } from '../lib/format'
import { useNow } from '../lib/use-now'
import { AppShell } from './AppShell'
import { RecipeLink } from './RecipeLink'
import { SwapDialog } from './SwapDialog'
import { TasteMark } from './TodayScreen'
import {
  ArrowsClockwise,
  ArrowsLeftRight,
  CookingPot,
  ShoppingCart,
} from '@phosphor-icons/react'
import {
  Button,
  Hint,
  IconButton,
  Meta,
  Panel,
  Problems,
  Sheet,
  Tag,
  Warn,
} from './ui'

export function WeekScreen({ familyId }: { familyId: string }) {
  const db = usePowerSync()
  const todayKey = dateKey(useNow())

  const profilesRead = useProfiles()
  const {
    profile,
    planOwnerId: ownerId,
    planOwner: owner,
    ownerCorridorApplies,
  } = useActiveProfile(profilesRead.data)
  const mealsRead = useMeals(profile?.portion)
  const prefsRead = useTastePrefs()
  const week = useWeek(ownerId, mealsRead.data, todayKey)

  const antiRepeat = useAntiRepeatDays()
  const antiRepeatDays = antiRepeat.data
  const windowSize = precedingWindow(antiRepeatDays)
  const preceding = usePrecedingSlots(
    ownerId,
    addDays(todayKey, -windowSize),
    todayKey,
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [swapping, setSwapping] = useState<{
    dayIndex: number
    slot: MealType
  } | null>(null)
  const [confirming, setConfirming] = useState(false)

  const sharedNote =
    profile && profile.sharedPlanWith
      ? 'Цей профіль користується спільним планом профілю «' +
        (owner?.name ?? '—') +
        '». Перегенерувати може лише власник.'
      : null

  const regenerate = async () => {
    if (!owner || !ownerId) return
    setBusy(true)
    setError(null)
    try {
      const result = generateWeek(mealsRead.data, {
        profile: owner,
        prefs: prefsRead.data,
        antiRepeatDays,
        days: week.data?.params.days,
        precedingDays: precedingMealIds(preceding, todayKey, windowSize),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
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
  const swapsAhead = view ? manualSwapsAhead(view) : 0
  const shortage =
    mealsRead.isLoading || antiRepeat.isLoading || sharedNote
      ? []
      : poolShortage(generationPool(mealsRead.data, owner), antiRepeatDays)
  const problems = [
    mealsRead.problems,
    profilesRead.problems,
    prefsRead.problems,
    week.problems,
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
      <Problems of={problems} />

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
            disabled={busy || !!sharedNote || shortage.length > 0}
            onClick={() =>
              swapsAhead > 0 ? setConfirming(true) : void regenerate()
            }
          >
            <ArrowsClockwise
              aria-hidden
              size={18}
              weight="bold"
              className={busy ? 'motion-safe:animate-spin' : ''}
            />
            {busy
              ? 'Збираємо тиждень…'
              : view
                ? 'Перегенерувати тиждень'
                : 'Згенерувати тиждень'}
          </Button>

          {view ? (
            <Link to="/shopping" className="mt-2 block no-underline">
              <Button block>
                <ShoppingCart aria-hidden size={18} />
                Список покупок
              </Button>
            </Link>
          ) : null}

          {shortage.length ? (
            <>
              <Warn>{poolShortageMessage(shortage, antiRepeatDays)}</Warn>
              <Link to="/meals" className="mt-2 block no-underline">
                <Button block>
                  <CookingPot aria-hidden size={18} />
                  Додати страви
                </Button>
              </Link>
            </>
          ) : null}
          {error ? <Warn>{error}</Warn> : null}
          {sharedNote && !error ? <Meta>{sharedNote}</Meta> : null}

          {view ? (
            <PlanSummary
              view={view}
              owner={owner}
              viewerPortion={ownerCorridorApplies ? null : portionOf(profile)}
            />
          ) : shortage.length ? null : (
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
          plan={
            ownerCorridorApplies
              ? {
                  target: view.params.targetCalories,
                  corridor: view.usedCorridor,
                }
              : null
          }
          prefs={prefsRead.data}
          onSwap={(slot) => setSwapping({ dayIndex, slot })}
        />
      ))}

      {view ? (
        <Panel>
          <Hint>
            Щоб замінити окрему страву, натисніть кнопку заміни праворуч у її
            рядку. Діалог запропонує страви того ж типу з прогнозом калорій дня.
          </Hint>
        </Panel>
      ) : null}

      {confirming ? (
        <Sheet
          title="Перегенерувати тиждень?"
          onClose={() => setConfirming(false)}
        >
          {(close) => (
            <>
              <p className="mb-4 mt-0 text-sm leading-relaxed text-muted">
                У плані {swapsAhead}{' '}
                {plural(
                  swapsAhead,
                  'ручна заміна',
                  'ручні заміни',
                  'ручних замін',
                )}{' '}
                на сьогодні й наступні дні. Генератор збере тиждень наново, і
                ручні заміни не збережуться.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  block
                  variant="primary"
                  onClick={() => {
                    close()
                    void regenerate()
                  }}
                >
                  <ArrowsClockwise aria-hidden size={18} weight="bold" />
                  Перегенерувати
                </Button>
                <Button block onClick={close}>
                  Скасувати
                </Button>
              </div>
            </>
          )}
        </Sheet>
      ) : null}

      {swapping && view ? (
        <SwapDialog
          view={view}
          dayIndex={swapping.dayIndex}
          slot={swapping.slot}
          pool={poolForProfile(mealsRead.data, owner)}
          ownerPortion={owner?.portion ?? null}
          prefs={prefsRead.data}
          antiRepeatDays={antiRepeatDays}
          onClose={() => setSwapping(null)}
        />
      ) : null}
    </AppShell>
  )
}

function PlanSummary({
  view,
  owner,
  viewerPortion,
}: {
  view: WeekView
  owner: Pick<Profile, 'targetCalories' | 'corridor' | 'portion'> | null
  viewerPortion: PortionLetter | null
}) {
  const known = view.days.filter((day) => day.calories.unknown === 0)
  const total = known.reduce((sum, day) => sum + day.calories.total, 0)
  const approx = view.days.some((day) => day.calories.approx)
  const incomplete = view.days.length - known.length

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

      {viewerPortion ? (
        <Meta>
          Калорійність показано для порції {viewerPortion}, а коридор тримає
          власник плану з порцією {portionOf(owner)}.
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
          {view.missing}{' '}
          {plural(
            view.missing,
            'слот посилається',
            'слоти посилаються',
            'слотів посилаються',
          )}{' '}
          на страви, яких уже немає в пулі — перегенеруйте тиждень.
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

function DayCard({
  day,
  plan,
  prefs,
  onSwap,
}: {
  day: DayView
  plan: { target: number; corridor: number } | null
  prefs: TastePrefs
  onSwap: (slot: MealType) => void
}) {
  const total = formatDayCalories(day.calories)
  const within =
    plan !== null && dayInCorridor(day.calories, plan.target, plan.corridor)

  return (
    <section
      className={`glass mb-4 rounded-3xl px-5 py-4 ${
        day.isToday ? 'outline-2 -outline-offset-1 outline-accent' : ''
      } ${day.isPast ? 'opacity-70' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2.5">
        <div className="text-base font-semibold tracking-tight">
          {formatDayTitle(day.date)}{' '}
          {day.isToday ? <Tag tone="accent">сьогодні</Tag> : null}
        </div>
        <div
          className={`whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-xs font-medium tabular-nums ${
            plan === null
              ? 'bg-app text-muted'
              : within
                ? 'bg-success-soft text-success'
                : 'bg-warning-soft text-warning'
          }`}
        >
          {total || 'калорійність невідома'}
          {total && day.calories.unknown > 0
            ? ' · сума неповна'
            : total && plan && !within
              ? ' · поза коридором'
              : ''}
        </div>
      </div>

      {day.slots.map((slotView) => (
        <div
          key={slotView.id}
          className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0 last:pb-0"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted">
              {MEAL_TYPE_LABELS[slotView.slot]}
            </span>
            <span className="block text-sm font-medium leading-snug">
              {slotView.meal ? (
                <>
                  <TasteMark value={prefOf(prefs, slotView.mealId)} />{' '}
                  <RecipeLink mealId={slotView.mealId}>
                    {slotView.meal.name}
                  </RecipeLink>
                </>
              ) : (
                <span className="text-warning">страву видалено з пулу</span>
              )}
            </span>
          </span>
          <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted">
            {slotView.meal ? formatMealCalories(slotView.meal) : ''}
          </span>
          {day.isPast ? null : (
            <IconButton
              label={'Замінити страву: ' + MEAL_TYPE_LABELS[slotView.slot]}
              onClick={() => onSwap(slotView.slot)}
            >
              <ArrowsLeftRight size={16} />
            </IconButton>
          )}
        </div>
      ))}
    </section>
  )
}
