import { test } from 'node:test'
import assert from 'node:assert/strict'

import { msUntilNextChange, parseReleaseAt, timeLeft } from './release-gate.ts'

const release = Date.parse('2026-12-10T10:00:00+02:00')
const MINUTE = 60_000

test('дата з часом і зсувом читається як мить у UTC', () => {
  assert.equal(
    parseReleaseAt('2026-12-10T10:00:00+02:00'),
    Date.UTC(2026, 11, 10, 8),
  )
  assert.equal(parseReleaseAt(' 2026-12-10T08:00Z '), Date.UTC(2026, 11, 10, 8))
})

test('сама дата — північ за UTC', () => {
  assert.equal(parseReleaseAt('2026-12-10'), Date.UTC(2026, 11, 10))
})

test('порожнє, не ISO, час без зсуву й неіснуюча дата — заглушки немає', () => {
  for (const raw of [
    '',
    '   ',
    '{{env "PUBLIC_RELEASE_AT" | js}}',
    '10.12.2026',
    'December 10, 2026',
    '2026-12-10T10:00',
    '2026-13-40',
  ])
    assert.equal(parseReleaseAt(raw), null, raw)
})

test('до релізу лишаються дні, години й хвилини', () => {
  const now = release - (2 * 24 * 60 + 3 * 60 + 15) * MINUTE
  assert.deepEqual(timeLeft(release, now), { days: 2, hours: 3, minutes: 15 })
})

test('неповна хвилина рахується цілою, тож нулі не видно до самого релізу', () => {
  assert.deepEqual(timeLeft(release, release - 1), {
    days: 0,
    hours: 0,
    minutes: 1,
  })
  assert.deepEqual(timeLeft(release, release - 61 * MINUTE + 1), {
    days: 0,
    hours: 1,
    minutes: 1,
  })
})

test('у мить релізу й після неї заглушки немає', () => {
  assert.equal(timeLeft(release, release), null)
  assert.equal(timeLeft(release, release + MINUTE), null)
})

test('наступне оновлення — коли зміниться хвилина відліку, останнє — у мить релізу', () => {
  assert.equal(msUntilNextChange(release, release - 90_000), 30_000)
  assert.equal(msUntilNextChange(release, release - 2 * MINUTE), MINUTE)
  assert.equal(msUntilNextChange(release, release - 1), 1)
  const now = release - 90_000
  const next = now + msUntilNextChange(release, now)
  assert.deepEqual(timeLeft(release, next - 1), {
    days: 0,
    hours: 0,
    minutes: 2,
  })
  assert.deepEqual(timeLeft(release, next), { days: 0, hours: 0, minutes: 1 })
})
