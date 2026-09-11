/**
 * Нагадування перед прийомами їжі (MER-65, порт MER-20): такт і налаштування.
 *
 * Такт (`MealReminders`) висить у кореневому гейті, а не на екрані «Сьогодні»:
 * нагадування мають приходити й тоді, коли користувач на «Тижні» чи «Стравах»
 * (те саме рішення, що у V1). Свого таймера тут немає — такт дає `useNow`, той
 * самий, з якого живе годинник дня, тож «зараз» в усьому застосунку одне.
 *
 * Налаштування (`RemindersPanel`) стоять на «Сьогодні», поруч із годинником,
 * бо саме його вікна вони й зсувають.
 *
 * Обидві частини читають налаштування з `localStorage` (`lib/reminders.ts`), а
 * не з React-стану: вони в різних гілках дерева, і будь-який спільний стан
 * коштував би контексту заради двох полів. Ціна названа вголос — вимкнення
 * доходить до такту не миттєво, а з наступним тактом (пів хвилини); показані
 * сповіщення при цьому прибираються одразу.
 */

import { useEffect, useState } from 'react'
import {
  MEAL_TYPE_LABELS,
  dateKey,
  formatMealCalories,
  planOwnerId,
} from '@meridian/core'
import type { MealType } from '@meridian/core'
import { useSyncState } from '../lib/powersync/provider'
import { useActiveProfile } from '../lib/active-profile'
import { useMeals, useProfiles, useWeek } from '../lib/data/queries'
import type { WeekView } from '../lib/data/model'
import { minutesOf, useNow } from '../lib/use-now'
import { formatMinute } from '../lib/day-clock'
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

/** Страва слота з плану на сьогодні — рівно те, що піде в текст сповіщення. */
function mealLabel(week: WeekView | null, slot: MealType): string | null {
  const meal = week?.days.find((day) => day.isToday)?.byType[slot]?.meal
  if (!meal) return null
  const calories = formatMealCalories(meal)
  return calories ? meal.name + ' · ' + calories : meal.name
}

/* ==========================================================================
 * Такт
 * ======================================================================== */

/**
 * Хуки запитів вимагають бази в контексті, а умовних хуків у React не буває —
 * тому такт існує окремим компонентом (той самий прийом, що в `RequireLocalDb`).
 */
export function MealReminders() {
  const { db } = useSyncState()
  return db ? <ReminderTicker /> : null
}

function ReminderTicker() {
  const now = useNow()
  const meals = useMeals()
  const profiles = useProfiles()
  const { profile } = useActiveProfile(profiles.data)
  const week = useWeek(
    profile ? planOwnerId(profile) : null,
    meals.data,
    dateKey(now),
  )
  const plan = week.data

  useEffect(() => {
    // Налаштування й дозвіл читаються щотакту: користувач міг вимкнути
    // нагадування хвилину тому — або заблокувати їх у налаштуваннях браузера,
    // про що застосунку ніхто не повідомляє.
    const settings = readSettings()
    if (!settings.enabled || notificationState() !== 'granted') return

    const today = dateKey(now)
    for (const item of dueReminders(
      minutesOf(now),
      settings.leadMinutes,
      readFired(today),
    )) {
      // Позначку ставимо ДО показу: інакше збій показу повторював би спробу
      // щотакту, поки триває вікно «доганяємо».
      markFired(today, item.type)
      void showReminder(
        reminderMessage(item, today, mealLabel(plan, item.type)),
      )
    }
  }, [now, plan])

  return null
}

/* ==========================================================================
 * Налаштування
 * ======================================================================== */

/** Чому нагадувань не буде. «Дозволено» тут немає — тоді й казати нічого. */
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

  // Дозвіл і налаштування читаються в ефекті: до першого рендера вони не
  // потрібні, а дозвіл ще й міняється ззовні застосунку.
  // «Заблоковано» видно одразу, ще до дотику до перемикача: інакше єдиною
  // підказкою був би перемикач, що мовчки не вмикається.
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
    // Щойно змінили умови — сьогоднішні позначки не мають глушити те, про що
    // користувач тільки що попросив.
    clearFired()
  }

  const toggle = async (on: boolean) => {
    if (!on) {
      save({ ...settings, enabled: false })
      // Вимкнули — на екрані не має лишитись нічого: сповіщення з тегом висить,
      // доки його не закрили.
      void closeReminders()
      setError(null)
      return
    }
    // Дозвіл питаємо саме тут — це жест користувача, без нього браузер відмовить.
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
    const schedule = reminderSchedule(settings.leadMinutes)
    // Найближче наступне нагадування, а після останнього за добу — перше.
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
        {reminderSchedule(settings.leadMinutes)
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
