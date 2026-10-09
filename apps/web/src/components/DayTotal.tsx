import { dayInCorridor, formatDayCalories } from '@meridian/core'
import type { DayCalories } from '@meridian/core'
import { plural } from '../lib/format'

export function DayTotal({
  calories,
  plan,
}: {
  calories: DayCalories
  plan: { target: number; corridor: number } | null
}) {
  const total = formatDayCalories(calories)
  if (!total) {
    return (
      <p className="mb-0 mt-3 text-sm text-muted">
        Калорійність дня невідома — у страв цього дня немає цифр.
      </p>
    )
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
      Разом за день: {total}
      {plan ? ` · ціль ${plan.target} ± ${plan.corridor} ккал` : ''}
      {calories.unknown > 0
        ? ' · сума неповна: без цифр ' +
          calories.unknown +
          ' ' +
          plural(calories.unknown, 'слот', 'слоти', 'слотів')
        : within || !plan
          ? ''
          : ' · поза коридором'}
    </p>
  )
}
