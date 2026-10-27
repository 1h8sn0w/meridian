import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { MealType } from '@meridian/core'
import { testMeal } from './data/test-fixtures.ts'
import { formatDayTitle, formatWeekRange } from './format.ts'
import { weekMenuText } from './week-share.ts'

const slot = (type: MealType, name: string | null) => ({
  id: type + ':' + name,
  slot: type,
  mealId: name ?? 'gone',
  meal: name === null ? null : testMeal(name, type, 400),
  swapped: false,
})

const day = (
  date: string,
  slots: ReturnType<typeof slot>[],
  isPast = false,
) => ({ date, isPast, slots })

test('меню з сьогоднішнього дня: заголовок із датами, день за днем, прийом — страва', () => {
  assert.equal(
    weekMenuText([
      day('2026-10-24', [slot('breakfast', 'Сирники')], true),
      day('2026-10-25', [
        slot('breakfast', 'Вівсянка з яблуком'),
        slot('lunch', 'Борщ'),
      ]),
      day('2026-10-26', [slot('dinner', 'Риба з овочами')]),
    ]),
    [
      'Меню · ' + formatWeekRange('2026-10-25', '2026-10-26'),
      '',
      formatDayTitle('2026-10-25'),
      '• Сніданок — Вівсянка з яблуком',
      '• Обід — Борщ',
      '',
      formatDayTitle('2026-10-26'),
      '• Вечеря — Риба з овочами',
    ].join('\n'),
  )
})

test('страва, яку видалили з пулу, — з позначкою екрана, а не порожнім рядком', () => {
  const text = weekMenuText([
    day('2026-10-25', [slot('lunch', null), slot('snack', 'Яблуко')]),
    day('2026-10-26', [slot('lunch', 'Борщ')]),
  ])
  assert.match(text, /\n• Обід — страву видалено з пулу\n• Перекус — Яблуко\n/)
})

test('лишився один день — заголовок без діапазону дат', () => {
  assert.equal(
    weekMenuText([
      day('2026-10-24', [slot('lunch', 'Борщ')], true),
      day('2026-10-25', [slot('dinner', 'Риба з овочами')]),
    ]),
    [
      'Меню',
      '',
      formatDayTitle('2026-10-25'),
      '• Вечеря — Риба з овочами',
    ].join('\n'),
  )
})

test('усі дні плану минули — ділитися нічим', () => {
  assert.equal(
    weekMenuText([day('2026-10-24', [slot('lunch', 'Борщ')], true)]),
    '',
  )
  assert.equal(weekMenuText([day('2026-10-25', [])]), '')
})
