import type { DayView } from './data/model.ts'
import { formatDayTitle, formatWeekRange } from './format.ts'
import { messages } from './i18n/locale.ts'

export function weekMenuText(
  days: ReadonlyArray<Pick<DayView, 'date' | 'isPast' | 'slots'>>,
): string {
  const ahead = days.filter((day) => !day.isPast && day.slots.length)
  if (!ahead.length) return ''
  const first = ahead[0]
  const last = ahead[ahead.length - 1]

  const t = messages()
  const blocks = [
    first === last
      ? t.week.menuTitle
      : t.week.menuTitle + ' · ' + formatWeekRange(first.date, last.date),
  ]
  for (const day of ahead) {
    blocks.push(
      [
        formatDayTitle(day.date),
        ...day.slots.map(
          (slotView) =>
            `• ${t.common.mealType[slotView.slot]} — ${
              slotView.meal ? slotView.meal.name : t.common.mealRemoved
            }`,
        ),
      ].join('\n'),
    )
  }
  return blocks.join('\n\n')
}
