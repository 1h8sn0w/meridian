import { dayInCorridor, formatDayCalories } from '@meridian/core'
import type { DayCalories } from '@meridian/core'
import { useMessages } from '../lib/i18n/use-messages'

export function DayTotal({
  calories,
  plan,
}: {
  calories: DayCalories
  plan: { target: number; corridor: number } | null
}) {
  const t = useMessages()
  const total = formatDayCalories(calories, t.common.kcalUnit)
  if (!total) {
    return <p className="mb-0 mt-3 text-sm text-muted">{t.dayTotal.unknown}</p>
  }
  const within =
    plan !== null && dayInCorridor(calories, plan.target, plan.corridor)
  const tone =
    plan === null
      ? 'bg-app text-muted'
      : within
        ? 'bg-success-soft text-success'
        : 'bg-warning-soft text-warning'
  return (
    <p className={`mb-0 mt-3 rounded-2xl px-3.5 py-2.5 text-sm ${tone}`}>
      {t.dayTotal.total(total)}
      {plan ? t.dayTotal.target(plan.target, plan.corridor) : ''}
      {calories.unknown > 0
        ? t.dayTotal.incomplete(calories.unknown)
        : within || !plan
          ? ''
          : t.dayTotal.outside}
    </p>
  )
}
