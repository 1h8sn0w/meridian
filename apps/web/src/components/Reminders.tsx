import { useEffect, useState } from 'react'
import { MEAL_TYPE_LABELS, dateKey, formatMealCalories } from '@meridian/core'
import type { MealType } from '@meridian/core'
import { useSyncState } from '../lib/powersync/provider'
import { useActiveProfile } from '../lib/active-profile'
import { useMeals, useProfiles, useWeek } from '../lib/data/queries'
import type { WeekView } from '../lib/data/model'
import { minutesOf, useNow } from '../lib/use-now'
import { formatMinute } from '../lib/day-clock'
import { useMealWindows } from '../lib/meal-windows'
import {
  DEFAULT_SETTINGS,
  LEAD_OPTIONS,
  askPermission,
  clearFired,
  closeReminders,
  dueReminders,
  markFired,
  notificationState,
  readFired,
  readSettings,
  reminderMessage,
  reminderSchedule,
  showReminder,
  writeSettings,
} from '../lib/reminders'
import type { NotificationState, ReminderSettings } from '../lib/reminders'
import { Button, ErrorText, Hint, Meta, Panel, SelectField } from './ui'

function mealLabel(week: WeekView | null, slot: MealType): string | null {
  const meal = week?.days.find((day) => day.isToday)?.byType[slot]?.meal
  if (!meal) return null
  const calories = formatMealCalories(meal)
  return calories ? meal.name + ' · ' + calories : meal.name
}

export function MealReminders() {
  const { db } = useSyncState()
  return db ? <ReminderTicker /> : null
}

function ReminderTicker() {
  const now = useNow()
  const meals = useMeals()
  const profiles = useProfiles()
  const { planOwnerId } = useActiveProfile(profiles.data)
  const week = useWeek(planOwnerId, meals.data, dateKey(now))
  const plan = week.data
  const { windows } = useMealWindows()

  useEffect(() => {
    const settings = readSettings()
    if (!settings.enabled || notificationState() !== 'granted') return

    const today = dateKey(now)
    for (const item of dueReminders(
      minutesOf(now),
      settings.leadMinutes,
      readFired(today),
      windows,
    )) {
      markFired(today, item.type)
      void showReminder(
        reminderMessage(item, today, mealLabel(plan, item.type)),
      )
    }
  }, [now, plan, windows])

  return null
}

const PERMISSION_TEXT: Record<Exclude<NotificationState, 'granted'>, string> = {
  denied:
    'Сповіщення заблоковані для цього сайту — дозвольте їх у налаштуваннях браузера.',
  default: 'Дозвіл на сповіщення не надано.',
  unsupported: 'Цей браузер не підтримує сповіщень.',
}

export function RemindersPanel({ week }: { week: WeekView | null }) {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_SETTINGS)
  const [permission, setPermission] = useState<NotificationState>('default')
  const [error, setError] = useState<string | null>(null)
  const { windows } = useMealWindows()

  useEffect(() => {
    setSettings(readSettings())
    const state = notificationState()
    setPermission(state)
    if (state === 'denied' || state === 'unsupported')
      setError(PERMISSION_TEXT[state])
  }, [])

  const save = (next: ReminderSettings) => {
    writeSettings(next)
    setSettings(next)
    clearFired()
  }

  const toggle = async (on: boolean) => {
    if (!on) {
      save({ ...settings, enabled: false })
      void closeReminders()
      setError(null)
      return
    }
    const state = await askPermission()
    setPermission(state)
    if (state !== 'granted') {
      setError(PERMISSION_TEXT[state])
      return
    }
    setError(null)
    save({ ...settings, enabled: true })
  }

  const test = () => {
    const now = new Date()
    const minutes = minutesOf(now)
    const schedule = reminderSchedule(settings.leadMinutes, windows)
    const next =
      schedule.find((item) => item.fireMinute >= minutes) ?? schedule[0]
    void showReminder(
      reminderMessage(next, dateKey(now), mealLabel(week, next.type)),
    )
  }

  const on = settings.enabled && permission === 'granted'

  return (
    <Panel title="Нагадування">
      <label className="flex items-center gap-2 text-sm text-content">
        <input
          type="checkbox"
          className="m-0 w-auto accent-accent"
          checked={on}
          disabled={permission === 'unsupported'}
          onChange={(event) => void toggle(event.target.checked)}
        />
        Нагадувати перед прийомами
      </label>

      <div className="mt-2.5">
        <SelectField
          label="Випередження"
          value={String(settings.leadMinutes)}
          onChange={(event) =>
            save({ ...settings, leadMinutes: Number(event.target.value) })
          }
        >
          {LEAD_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} хв
            </option>
          ))}
        </SelectField>
      </div>

      <Hint>
        Сьогодні:{' '}
        {reminderSchedule(settings.leadMinutes, windows)
          .map(
            (item) =>
              MEAL_TYPE_LABELS[item.type] +
              ' — ' +
              formatMinute(item.fireMinute),
          )
          .join(' · ')}
      </Hint>

      {error ? <ErrorText failure={{ text: error }} /> : null}

      <Meta>
        Нагадування шле сама сторінка, тож вони приходять, поки застосунок
        відкритий: сервера пушів у застосунку немає. На iPhone сповіщення
        працюють лише у встановленому застосунку («Додати на екран «Додому»»).
      </Meta>

      {on ? (
        <div className="mt-2.5">
          <Button block onClick={test}>
            Надіслати тестове сповіщення
          </Button>
        </div>
      ) : null}
    </Panel>
  )
}
