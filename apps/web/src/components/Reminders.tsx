import { useEffect, useMemo, useState } from 'react'
import { dateKey, formatMealCalories } from '@meridian/core'
import type { MealType } from '@meridian/core'
import { useSyncState } from '../lib/powersync/provider'
import { useActiveProfile } from '../lib/active-profile'
import { useMeals, useProfiles, useWeek } from '../lib/data/queries'
import { windowsInPlan } from '../lib/data/model'
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
import { messages } from '../lib/i18n/locale'
import { useMessages } from '../lib/i18n/use-messages'

function mealLabel(week: WeekView | null, slot: MealType): string | null {
  const meal = week?.days.find((day) => day.isToday)?.byType[slot]?.meal
  if (!meal) return null
  const calories = formatMealCalories(meal, messages().common.kcalUnit)
  return calories ? meal.name + ' · ' + calories : meal.name
}

export function MealReminders() {
  const { db } = useSyncState()
  return db ? <ReminderTicker /> : null
}

function ReminderTicker() {
  const now = useNow()
  const profiles = useProfiles()
  const { profile, planOwnerId } = useActiveProfile(profiles.data)
  const meals = useMeals(profile?.portion)
  const week = useWeek(planOwnerId, meals.data, dateKey(now))
  const plan = week.data
  const allWindows = useMealWindows().windows
  const windows = useMemo(
    () => windowsInPlan(allWindows, plan),
    [allWindows, plan],
  )

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

type Refusal = Exclude<NotificationState, 'granted'>

export function RemindersPanel({ week }: { week: WeekView | null }) {
  const t = useMessages()
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_SETTINGS)
  const [permission, setPermission] = useState<NotificationState>('default')
  const [refusal, setRefusal] = useState<Refusal | null>(null)
  const windows = windowsInPlan(useMealWindows().windows, week)

  useEffect(() => {
    setSettings(readSettings())
    const state = notificationState()
    setPermission(state)
    if (state === 'denied' || state === 'unsupported') setRefusal(state)
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
      setRefusal(null)
      return
    }
    const state = await askPermission()
    setPermission(state)
    if (state !== 'granted') {
      setRefusal(state)
      return
    }
    setRefusal(null)
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
    <Panel title={t.reminders.title}>
      <label className="flex items-center gap-2 text-sm text-content">
        <input
          type="checkbox"
          className="m-0 w-auto accent-accent"
          checked={on}
          disabled={permission === 'unsupported'}
          onChange={(event) => void toggle(event.target.checked)}
        />
        {t.reminders.enable}
      </label>

      <div className="mt-2.5">
        <SelectField
          label={t.reminders.lead}
          value={String(settings.leadMinutes)}
          onChange={(event) =>
            save({ ...settings, leadMinutes: Number(event.target.value) })
          }
        >
          {LEAD_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t.reminders.minutes(minutes)}
            </option>
          ))}
        </SelectField>
      </div>

      <Hint>
        {t.reminders.today}
        {reminderSchedule(settings.leadMinutes, windows)
          .map(
            (item) =>
              t.common.mealType[item.type] +
              ' — ' +
              formatMinute(item.fireMinute),
          )
          .join(' · ')}
      </Hint>

      {refusal ? (
        <ErrorText failure={{ text: t.reminders.permission[refusal] }} />
      ) : null}

      <Meta>{t.reminders.hint}</Meta>

      {on ? (
        <div className="mt-2.5">
          <Button block onClick={test}>
            {t.reminders.test}
          </Button>
        </div>
      ) : null}
    </Panel>
  )
}
