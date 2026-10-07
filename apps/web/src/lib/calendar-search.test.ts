/**
 * День і тиждень «Календаря» з адреси (MER-88) — через той самий розбір, що й
 * у роутері: дата без лапок у JSON не розбирається, тож доходить рядком.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultParseSearch } from '@tanstack/react-router'

import { parseCalendarSearch } from './calendar-search.ts'

const parse = (search: string) =>
  parseCalendarSearch(defaultParseSearch(search))

test('день і тиждень з адреси', () => {
  assert.deepEqual(parse('?day=2026-10-07&week=2026-10-05'), {
    day: '2026-10-07',
    week: '2026-10-05',
  })
  assert.deepEqual(parse('?day=2026-10-07'), {
    day: '2026-10-07',
    week: undefined,
  })
})

test('тиждень вирівнюється на понеділок', () => {
  assert.deepEqual(parse('?week=2026-10-11'), {
    day: undefined,
    week: '2026-10-05',
  })
})

test('сміття й неіснуючі дати — без параметра', () => {
  for (const search of [
    '?day=abc',
    '?day=2026-02-30',
    '?day=2026-1-7',
    '?day=20261007',
    '?week=2026-13-01',
    '',
  ]) {
    assert.deepEqual(parse(search), { day: undefined, week: undefined }, search)
  }
})
