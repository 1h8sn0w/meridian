import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CATCH_UP_MINUTES,
  dueReminders,
  reminderMessage,
  reminderSchedule,
} from './reminders.ts'
import { DEFAULT_MEAL_WINDOWS, mealWindows } from './day-clock.ts'

test('розклад: випередження від початку вікна, за часом надсилання', () => {
  assert.deepEqual(
    reminderSchedule(15, DEFAULT_MEAL_WINDOWS).map((item) => [
      item.type,
      item.fireMinute,
    ]),
    [
      ['breakfast', 6 * 60 - 15],
      ['lunch', 11 * 60 - 15],
      ['snack', 15 * 60 - 15],
      ['dinner', 18 * 60 - 15],
    ],
  )
})

test("розклад іде за вікнами сім'ї, а без проміжку між обідом і вечерею перекусу немає", () => {
  const windows = mealWindows({
    breakfast: { start: 7 * 60 + 30, end: 9 * 60 },
    lunch: { start: 13 * 60, end: 14 * 60 },
    dinner: { start: 14 * 60, end: 20 * 60 },
  })
  assert.deepEqual(
    reminderSchedule(30, windows).map((item) => [item.type, item.fireMinute]),
    [
      ['breakfast', 7 * 60],
      ['lunch', 12 * 60 + 30],
      ['dinner', 13 * 60 + 30],
    ],
  )
})

test('надсилаємо лише у вікні спрацювання й лише раз на добу', () => {
  const at = (minutes: number) =>
    dueReminders(minutes, 15, [], DEFAULT_MEAL_WINDOWS).map((item) => item.type)

  const fire = 6 * 60 - 15
  assert.deepEqual(at(fire - 1), [], 'до часу — рано')
  assert.deepEqual(at(fire), ['breakfast'])
  assert.deepEqual(at(fire + CATCH_UP_MINUTES), ['breakfast'], 'доганяємо')
  assert.deepEqual(
    at(fire + CATCH_UP_MINUTES + 1),
    [],
    'пропущене давніше не шлемо',
  )
  assert.deepEqual(
    dueReminders(fire, 15, ['breakfast'], DEFAULT_MEAL_WINDOWS),
    [],
    'уже надіслане сьогодні',
  )
})

test('текст: страва з плану, а без плану — так і кажемо', () => {
  const [item] = dueReminders(6 * 60 - 30, 30, [], DEFAULT_MEAL_WINDOWS)
  assert.ok(item)

  const planned = reminderMessage(item, '2026-09-05', 'Вівсянка · 320 ккал')
  assert.equal(planned.title, 'Сніданок за 30 хв · о 06:00')
  assert.equal(planned.body, 'Вівсянка · 320 ккал')
  assert.equal(planned.tag, 'meridian-2026-09-05-breakfast')

  const empty = reminderMessage(item, '2026-09-05', null)
  assert.match(empty.body, /плану немає/)
})
