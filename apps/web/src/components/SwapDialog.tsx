import { useState } from 'react'
import { usePowerSync } from '@powersync/react'
import {
  formatCalories,
  formatMealCalories,
  mealsForPortion,
  replaceSlot,
  suggestReplacements,
} from '@meridian/core'
import type { Meal, MealType, PortionLetter, TastePrefs } from '@meridian/core'
import { toWeekPlan } from '../lib/data/model'
import type { DayView, WeekView } from '../lib/data/model'
import { replaceSlotMeal } from '../lib/data/mutations'
import { formatDayTitle } from '../lib/format'
import { mealMatches } from '../lib/meals-search'
import { Check, Heart, Prohibit } from '@phosphor-icons/react'
import { MealSearch, SearchFound, notFoundText } from './MealSearch'
import { Button, Empty, Sheet, Tag, Warn } from './ui'
import { useMessages } from '../lib/i18n/use-messages'

const SEARCH_MIN_CANDIDATES = 6

export function SwapDialog({
  view,
  dayIndex,
  slot,
  pool,
  ownerPortion,
  prefs,
  antiRepeatDays,
  onClose,
}: {
  view: WeekView
  dayIndex: number
  slot: MealType
  pool: ReadonlyArray<Meal>
  ownerPortion: PortionLetter | null
  prefs: TastePrefs
  antiRepeatDays: number
  onClose: () => void
}) {
  const db = usePowerSync()
  const messages = useMessages()
  const t = messages.swap
  const unit = messages.common.kcalUnit
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const day: DayView | undefined =
    dayIndex >= 0 ? view.days.at(dayIndex) : undefined
  const plan = toWeekPlan(view, ownerPortion)
  const title = t.title

  if (!day) {
    return (
      <Sheet title={title} onClose={onClose}>
        <Warn>{t.noDay}</Warn>
      </Sheet>
    )
  }

  if (day.isPast) {
    return (
      <Sheet title={t.pastTitle} onClose={onClose}>
        <Warn>{t.past}</Warn>
      </Sheet>
    )
  }

  if (!plan) {
    return (
      <Sheet title={title} onClose={onClose}>
        <Warn>{t.incomplete}</Warn>
      </Sheet>
    )
  }

  const result = suggestReplacements(
    mealsForPortion(pool, ownerPortion),
    { ...plan, params: { ...plan.params, antiRepeatDays } },
    dayIndex,
    slot,
    prefs,
  )
  if (!result.ok) {
    return (
      <Sheet title={title} onClose={onClose}>
        <Warn>{result.error}</Warn>
      </Sheet>
    )
  }

  const otherApprox = Object.entries(plan.days[dayIndex]?.meals ?? {}).some(
    ([type, meal]) => type !== slot && meal.caloriesApprox,
  )

  const searchable = result.candidates.length >= SEARCH_MIN_CANDIDATES
  const searching = searchable && query.trim() !== ''
  const shown = searching
    ? result.candidates.filter((candidate) =>
        mealMatches(candidate.meal, query),
      )
    : result.candidates

  const apply = async (meal: Meal) => {
    setBusy(true)
    setFailure(null)
    const next = replaceSlot(plan, dayIndex, slot, meal)
    if (!next.ok) {
      setFailure(next.error)
      setBusy(false)
      return
    }
    const slotId = day.byType[slot]?.id
    if (!slotId) {
      setFailure(t.noSlot)
      setBusy(false)
      return
    }
    try {
      await replaceSlotMeal(db, {
        slotId,
        mealId: meal.id,
        weekPlanId: view.id,
        plan: next.plan,
      })
      onClose()
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={messages.common.mealType[slot] + ' · ' + formatDayTitle(day.date)}
      onClose={onClose}
    >
      <p className="mb-3 mt-0 text-sm leading-relaxed text-muted">
        {t.current(
          result.current.name,
          formatMealCalories(result.current, unit),
          result.target,
          result.corridor,
        )}
      </p>

      {searchable ? <MealSearch value={query} onChange={setQuery} /> : null}
      <div role="status">
        {searching ? (
          shown.length ? (
            <SearchFound count={shown.length} />
          ) : (
            <Empty>{notFoundText(query) + '.'}</Empty>
          )
        ) : null}
      </div>

      {result.candidates.length === 0 ? (
        <Empty>{t.noCandidates(slot)}</Empty>
      ) : null}

      {shown.map((candidate) => (
        <button
          key={candidate.meal.id}
          type="button"
          disabled={!candidate.valid || busy}
          onClick={() => void apply(candidate.meal)}
          className="mb-1.5 flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-transparent bg-app px-3.5 py-3 text-left text-content transition duration-300 ease-spring hover:border-accent active:scale-98 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent"
        >
          <span className="min-w-0 flex-auto">
            <span className="block text-sm font-medium leading-snug">
              {candidate.meal.name}{' '}
              {candidate.favorite ? (
                <Tag tone="accent">
                  <Heart aria-hidden size={12} weight="fill" />
                  {t.favorite}
                </Tag>
              ) : null}
              {candidate.disliked ? (
                <Tag tone="warn">
                  <Prohibit aria-hidden size={12} weight="bold" />
                  {t.disliked}
                </Tag>
              ) : null}
              {candidate.reasons.map((reason) => (
                <Tag key={reason}>{reason}</Tag>
              ))}
            </span>
            <span className="mt-1 block font-mono text-xs tabular-nums text-muted">
              {formatMealCalories(candidate.meal, unit)}
              {candidate.meal.source ? ' · ' + candidate.meal.source : ''}
            </span>
          </span>
          <span
            className={`whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-xs tabular-nums ${
              candidate.withinCorridor
                ? 'bg-success-soft text-success'
                : 'bg-warning-soft text-warning'
            }`}
          >
            {t.day}
            {formatCalories(
              candidate.dayCalories,
              otherApprox || candidate.meal.caloriesApprox,
              unit,
            )}
            {candidate.withinCorridor ? (
              <Check
                aria-hidden
                size={12}
                weight="bold"
                className="ml-1 inline align-middle"
              />
            ) : null}
          </span>
        </button>
      ))}

      {result.candidates.length && !result.candidates.some((c) => c.valid) ? (
        <p className="mb-0 mt-2 text-sm leading-normal text-muted">
          {t.noneValid}
        </p>
      ) : null}

      {failure ? <Warn>{failure}</Warn> : null}

      <div className="mt-3">
        <Button block onClick={onClose}>
          {t.cancel}
        </Button>
      </div>
    </Sheet>
  )
}
