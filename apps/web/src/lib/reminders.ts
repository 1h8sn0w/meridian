import { MEAL_TYPE_LABELS } from '@meridian/core'
import type { MealType } from '@meridian/core'

import { formatMinute } from './day-clock.ts'
import type { MealWindow } from './day-clock.ts'

export type ReminderSettings = {
  enabled: boolean
  leadMinutes: number
}

export const LEAD_OPTIONS = [5, 10, 15, 30, 60] as const

export const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: false,
  leadMinutes: 15,
}

export const CATCH_UP_MINUTES = 5

const SETTINGS_KEY = 'meridian.reminders.v2'
const FIRED_KEY = 'meridian.reminders.fired.v2'

type DueReminder = {
  type: MealType
  startMinute: number
  fireMinute: number
}

export function reminderSchedule(
  leadMinutes: number,
  windows: ReadonlyArray<MealWindow>,
): Array<DueReminder> {
  return windows
    .map((window) => ({
      type: window.type,
      startMinute: window.startMinute,
      fireMinute: Math.max(0, window.startMinute - leadMinutes),
    }))
    .sort((a, b) => a.fireMinute - b.fireMinute)
}

export function dueReminders(
  minutes: number,
  leadMinutes: number,
  fired: ReadonlyArray<MealType>,
  windows: ReadonlyArray<MealWindow>,
): Array<DueReminder> {
  return reminderSchedule(leadMinutes, windows).filter(
    (item) =>
      !fired.includes(item.type) &&
      minutes >= item.fireMinute &&
      minutes <= item.fireMinute + CATCH_UP_MINUTES,
  )
}

type ReminderMessage = { title: string; body: string; tag: string }

export function reminderMessage(
  item: DueReminder,
  dateKey: string,
  meal: string | null,
): ReminderMessage {
  const lead = item.startMinute - item.fireMinute
  return {
    title:
      MEAL_TYPE_LABELS[item.type] +
      (lead ? ' за ' + lead + ' хв' : ' починається') +
      ' · о ' +
      formatMinute(item.startMinute),
    body: meal ?? 'На цей прийом плану немає — згенеруйте тиждень.',
    tag: 'meridian-' + dateKey + '-' + item.type,
  }
}

export function readSettings(): ReminderSettings {
  const raw = window.localStorage.getItem(SETTINGS_KEY)
  if (!raw) return DEFAULT_SETTINGS
  try {
    const saved = JSON.parse(raw) as Partial<ReminderSettings>
    const lead = Number(saved.leadMinutes)
    return {
      enabled: saved.enabled === true,
      leadMinutes: (LEAD_OPTIONS as ReadonlyArray<number>).includes(lead)
        ? lead
        : DEFAULT_SETTINGS.leadMinutes,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function writeSettings(settings: ReminderSettings): void {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export function readFired(dateKey: string): Array<MealType> {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(FIRED_KEY) ?? 'null',
    ) as { date?: string; types?: Array<MealType> } | null
    return saved && saved.date === dateKey && Array.isArray(saved.types)
      ? saved.types
      : []
  } catch {
    return []
  }
}

export function markFired(dateKey: string, type: MealType): void {
  window.localStorage.setItem(
    FIRED_KEY,
    JSON.stringify({ date: dateKey, types: readFired(dateKey).concat(type) }),
  )
}

export function clearFired(): void {
  window.localStorage.removeItem(FIRED_KEY)
}

export type NotificationState = 'granted' | 'denied' | 'default' | 'unsupported'

export function notificationState(): NotificationState {
  return typeof Notification === 'undefined'
    ? 'unsupported'
    : Notification.permission
}

export async function askPermission(): Promise<NotificationState> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch (error) {
    console.warn('Не вдалося запитати дозвіл на сповіщення:', error)
    return Notification.permission
  }
}

const direct: Array<Notification> = []

function controllingWorker(): boolean {
  return (
    'serviceWorker' in navigator && navigator.serviceWorker.controller !== null
  )
}

const OPTIONS = {
  lang: 'uk',
  icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png',
}

export async function showReminder(message: ReminderMessage): Promise<void> {
  if (notificationState() !== 'granted') return
  const options = { ...OPTIONS, body: message.body, tag: message.tag }

  if (controllingWorker()) {
    try {
      const registration = await navigator.serviceWorker.ready
      await registration.showNotification(message.title, options)
      return
    } catch (error) {
      console.warn('Воркер не показав сповіщення, показуємо напряму:', error)
    }
  }

  try {
    direct.push(new Notification(message.title, options))
  } catch (error) {
    console.warn('Не вдалося показати сповіщення:', error)
  }
}

export async function closeReminders(): Promise<void> {
  while (direct.length) direct.pop()?.close()
  if (!controllingWorker()) return
  try {
    const registration = await navigator.serviceWorker.ready
    const shown = await registration.getNotifications()
    shown.forEach((notification) => notification.close())
  } catch (error) {
    console.warn('Не вдалося прибрати сповіщення:', error)
  }
}
