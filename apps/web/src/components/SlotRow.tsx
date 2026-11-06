import { formatMealCalories } from '@meridian/core'
import type { ReactNode } from 'react'
import type { SlotView } from '../lib/data/model'
import { formatMinute } from '../lib/day-clock'
import { useMessages } from '../lib/i18n/use-messages'
import { RecipeLink } from './RecipeLink'

export function SlotRow({
  slotView,
  startMinute,
  mark,
  action,
}: {
  slotView: SlotView
  startMinute?: number
  mark?: ReactNode
  action?: ReactNode
}) {
  const t = useMessages()
  return (
    <div className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0 last:pb-0">
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted">
          {t.common.mealType[slotView.slot]}
          {startMinute === undefined ? null : (
            <>
              {' · '}
              <span className="font-mono tabular-nums">
                {formatMinute(startMinute)}
              </span>
            </>
          )}
        </span>
        <span className="block text-sm font-medium leading-snug">
          {slotView.meal ? (
            <>
              {mark && <>{mark} </>}
              <RecipeLink mealId={slotView.mealId}>
                {slotView.meal.name}
              </RecipeLink>
            </>
          ) : (
            <span className="text-warning">{t.common.mealRemoved}</span>
          )}
        </span>
      </span>
      <span className="whitespace-nowrap font-mono text-xs tabular-nums text-muted">
        {slotView.meal
          ? formatMealCalories(slotView.meal, t.common.kcalUnit)
          : ''}
      </span>
      {action}
    </div>
  )
}
