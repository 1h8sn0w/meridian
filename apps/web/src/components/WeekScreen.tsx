import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { usePowerSync } from '@powersync/react'
import {
  addDays,
  dateKey,
  dayInCorridor,
  formatCalories,
  formatDayCalories,
  formatMealCalories,
  generateWeek,
  poolForProfile,
  poolShortageFor,
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
import { manualSwapsAhead, snackSettingDrift } from '../lib/data/model'
import type { DayView, WeekView } from '../lib/data/model'
import { saveWeek } from '../lib/data/mutations'
import { formatDayTitle, formatMoment } from '../lib/format'
import { useMessages } from '../lib/i18n/use-messages'
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
  const messages = useMessages()
  const t = messages.week
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
    profile && profile.sharedPlanWith ? t.sharedNote(owner?.name ?? '—') : null

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
        setError(t.failure(result.error))
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
      : poolShortageFor(mealsRead.data, owner, antiRepeatDays)
  const problems = [
    mealsRead.problems,
    profilesRead.problems,
    prefsRead.problems,
    week.problems,
  ]

  return (
    <AppShell
      title={messages.titles.week}
      subtitle={
        view
          ? t.target(view.params.targetCalories, view.usedCorridor)
          : t.sevenDays
      }
    >
      <Problems of={problems} />

      {!profile ? (
        <Panel title={messages.common.profileFirst}>
          <Hint>{t.profileFirstHint}</Hint>
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
            {busy ? t.generating : view ? t.regenerate : t.generate}
          </Button>

          {view ? (
            <Link to="/shopping" className="mt-2 block no-underline">
              <Button block>
                <ShoppingCart aria-hidden size={18} />
                {messages.titles.shopping}
              </Button>
            </Link>
          ) : null}

          {shortage.length ? (
            <>
              <Warn>{t.poolShortage(shortage, antiRepeatDays)}</Warn>
              <Link to="/meals" className="mt-2 block no-underline">
                <Button block>
                  <CookingPot aria-hidden size={18} />
                  {t.addMeals}
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
            <Hint>{t.noPlan}</Hint>
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
          <Hint>{t.swapHint}</Hint>
        </Panel>
      ) : null}

      {confirming ? (
        <Sheet title={t.confirmTitle} onClose={() => setConfirming(false)}>
          {(close) => (
            <>
              <p className="mb-4 mt-0 text-sm leading-relaxed text-muted">
                {t.confirmText(swapsAhead)}
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
                  {t.confirm}
                </Button>
                <Button block onClick={close}>
                  {messages.common.cancel}
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
  owner: Pick<
    Profile,
    'targetCalories' | 'corridor' | 'portion' | 'withSnack'
  > | null
  viewerPortion: PortionLetter | null
}) {
  const messages = useMessages()
  const t = messages.week
  const unit = messages.common.kcalUnit
  const known = view.days.filter((day) => day.calories.unknown === 0)
  const total = known.reduce((sum, day) => sum + day.calories.total, 0)
  const approx = view.days.some((day) => day.calories.approx)
  const incomplete = view.days.length - known.length

  const stale =
    owner !== null &&
    (owner.targetCalories !== view.params.targetCalories ||
      owner.corridor !== view.params.corridor)
  const snackDrift = snackSettingDrift(view, owner)

  const hasToday = view.days.some((day) => day.isToday)

  return (
    <>
      {known.length ? (
        <Meta>
          {t.summary(
            known.length,
            formatCalories(total, approx, unit),
            formatCalories(Math.round(total / known.length), approx, unit),
            view.params.targetCalories,
            view.usedCorridor,
          )}
          {view.sources.length ? t.sources(view.sources.join(', ')) : ''}
        </Meta>
      ) : null}

      {viewerPortion ? (
        <Meta>{t.viewerPortion(viewerPortion, portionOf(owner))}</Meta>
      ) : null}

      {incomplete > 0 ? <Meta>{t.incomplete(incomplete)}</Meta> : null}

      <Meta>{t.generated(formatMoment(view.generatedAt))}</Meta>

      {view.warnings.map((warning) => (
        <Warn key={JSON.stringify(warning)}>
          {typeof warning === 'string' ? warning : t.warning(warning)}
        </Warn>
      ))}

      {view.missing > 0 ? <Warn>{t.missing(view.missing)}</Warn> : null}

      {stale ? <Warn>{t.stale}</Warn> : null}

      {snackDrift ? (
        <Warn>{snackDrift === 'on' ? t.snackOn : t.snackOff}</Warn>
      ) : null}

      {!hasToday ? <Warn>{t.outsidePlan}</Warn> : null}
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
  const messages = useMessages()
  const t = messages.week
  const unit = messages.common.kcalUnit
  const total = formatDayCalories(day.calories, unit)
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
          {day.isToday ? (
            <Tag tone="accent">{messages.common.todayTag}</Tag>
          ) : null}
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
          {total || t.unknownCalories}
          {total && day.calories.unknown > 0
            ? t.incompleteShort
            : total && plan && !within
              ? t.outside
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
              {messages.common.mealType[slotView.slot]}
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
                <span className="text-warning">
                  {messages.common.mealRemoved}
                </span>
              )}
            </span>
          </span>
          <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted">
            {slotView.meal ? formatMealCalories(slotView.meal, unit) : ''}
          </span>
          {day.isPast ? null : (
            <IconButton
              label={t.swap(slotView.slot)}
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
