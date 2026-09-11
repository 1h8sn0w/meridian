/**
 * Нагадування перед прийомами їжі — стан ПРИСТРОЮ (MER-65, порт MER-20).
 *
 * Розклад бере годинник дня (`day-clock.ts`): нагадування шлеться за N хвилин
 * до початку вікна прийому, а страву до тексту дає план активного профілю.
 *
 * **Налаштування живуть у `localStorage` і в синхронізацію не їдуть** — це те
 * саме рішення MER-55, що й для активного профілю: телефон і ноутбук мають
 * різні режими сповіщень, і спільний стан тут був би помилкою, а не зручністю.
 * Тому колонки під нього немає в схемі й не буде.
 *
 * Тверда межа, та сама, що у V1: **сервера пушів немає**, тож нагадування шле
 * сама сторінка — вони приходять, поки застосунок відкритий (вкладка або
 * встановлений PWA). Це прямо написано в інтерфейсі; обіцяти більше, ніж
 * застосунок може дати, не можна. У фоні браузер сповільнює таймери, тому
 * пропущене «доганяємо» лише в межах `CATCH_UP_MINUTES`: після повернення в
 * застосунок не має сипатись десяток старих сповіщень.
 *
 * Імпорти тут із розширенням `.ts` — саме так їх бачить `node --test`, який
 * стирає типи, але шляхів не переписує (та сама причина, що в
 * `packages/core/tsconfig.json`). Модуль навмисно без React: юніт-тест має
 * запускатись без DOM. Підписи прийомів беруться з `@meridian/core` (MER-71),
 * тож перед тестами пакет треба зібрати — це вже робить скрипт `test`.
 */

import { MEAL_TYPE_LABELS } from '@meridian/core'
import type { MealType } from '@meridian/core'

import { MEAL_WINDOWS, formatMinute } from './day-clock.ts'

export type ReminderSettings = {
  enabled: boolean
  /** Лише зі списку `LEAD_OPTIONS`. */
  leadMinutes: number
}

/** `LEAD_OPTIONS` із V1 — хвилини випередження. */
export const LEAD_OPTIONS = [5, 10, 15, 30, 60] as const

export const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: false,
  leadMinutes: 15,
}

/** Наскільки пізно ще можна надіслати пропущене (`CATCH_UP_MIN` із V1). */
export const CATCH_UP_MINUTES = 5

const SETTINGS_KEY = 'meridian.reminders.v2'
const FIRED_KEY = 'meridian.reminders.fired.v2'

/* ==========================================================================
 * Розклад доби — чиста логіка (те, що перевіряє юніт-тест)
 * ======================================================================== */

export type DueReminder = {
  type: MealType
  /** Початок вікна прийому, хвилини від півночі. */
  startMinute: number
  /** Коли слати, хвилини від півночі. */
  fireMinute: number
}

/**
 * По одному нагадуванню на кожне вікно прийому, за часом надсилання.
 *
 * Випередження, що заходить за північ, стискається до 00:00 тієї самої доби:
 * переносити на попередній день не можна — то вже інший день плану (правило
 * V1).
 */
export function reminderSchedule(leadMinutes: number): Array<DueReminder> {
  return MEAL_WINDOWS.map((window) => ({
    type: window.type,
    startMinute: window.startMinute,
    fireMinute: Math.max(0, window.startMinute - leadMinutes),
  })).sort((a, b) => a.fireMinute - b.fireMinute)
}

/**
 * Що треба надіслати просто зараз: вікно спрацювання —
 * `[fireMinute, fireMinute + CATCH_UP_MINUTES]`, і слот ще не надіслано сьогодні.
 */
export function dueReminders(
  minutes: number,
  leadMinutes: number,
  fired: ReadonlyArray<MealType>,
): Array<DueReminder> {
  return reminderSchedule(leadMinutes).filter(
    (item) =>
      !fired.includes(item.type) &&
      minutes >= item.fireMinute &&
      minutes <= item.fireMinute + CATCH_UP_MINUTES,
  )
}

export type ReminderMessage = { title: string; body: string; tag: string }

/**
 * Текст сповіщення. `meal` — страва цього слота з плану на сьогодні; її **не
 * вигадуємо**: плану немає — так і кажемо (правило провенансу, AGENTS.md).
 *
 * Тег один на слот і добу: повторне сповіщення замінює попереднє, а не
 * множиться.
 */
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

/* ==========================================================================
 * Стан пристрою: налаштування й позначки надісланого
 * ======================================================================== */

/** Збережене поверх типового, з валідацією: чуже значення мовчки ігнорується. */
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

/* Позначки надісланого за поточну добу: запис іншої дати витісняє вчорашній,
 * тож окремого прибирання не потрібно. */
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

/** Забути надіслане: після вмикання й зміни випередження — щоб сьогоднішні
 *  позначки не глушили те, про що користувач щойно попросив. */
export function clearFired(): void {
  window.localStorage.removeItem(FIRED_KEY)
}

/* ==========================================================================
 * Дозвіл браузера й показ
 * ======================================================================== */

export type NotificationState = 'granted' | 'denied' | 'default' | 'unsupported'

/** Відмова в дозволі — не аварія: застосунок працює далі, просто мовчки. */
export function notificationState(): NotificationState {
  return typeof Notification === 'undefined'
    ? 'unsupported'
    : Notification.permission
}

/** Питати дозвіл можна лише з жесту користувача — інакше браузер відмовить. */
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

/* Сповіщення, показані НЕ через воркер: інакше їх нема як закрити — з
 * реєстрації видно тільки її власні (`getNotifications`). */
const direct: Array<Notification> = []

/* Чи керує сторінкою воркер. У незахищеному контексті `navigator.serviceWorker`
 * не існує зовсім — типи DOM цього не показують, тому перевірка через `in` (та
 * сама, що при реєстрації в кореневому маршруті). Питати `ready` без
 * контролера не можна: без зареєстрованого воркера ця обіцянка не
 * розв'язується ніколи, і в `pnpm dev` показ просто завис би. */
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

/**
 * Показати сповіщення. Через service worker, якщо він керує сторінкою: лише так
 * воно доживає до згорнутого застосунку, а на Android конструктор `Notification`
 * взагалі заборонений. Без воркера (наприклад, `pnpm dev`) — напряму.
 */
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

/**
 * Прибрати показані нагадування — вимкнули, отже, на екрані не має лишитись
 * нічого (сповіщення з тегом висить, доки його не закриють). Реєстрація в
 * застосунку одна й наша, тож закриваємо все, що вона показала.
 */
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
