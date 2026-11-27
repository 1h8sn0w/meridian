import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { DARK_INK, contrast, darkInkReads } from './contrast.ts'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const palette = /PROFILE_COLORS = \[([^\]]*)\]/.exec(
  read('./active-profile.ts'),
)?.[1]
const colors = [...(palette ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1])

test('темне чорнило аватара — те саме, що --color-button-ink', () => {
  assert.match(
    read('../styles.css'),
    new RegExp(`--color-button-ink:\\s*${DARK_INK};`),
  )
})

test('кожен колір палітри — hex, і темна літера на ньому ≥ 4.5:1', () => {
  assert.ok(colors.length > 0)
  for (const color of colors) {
    assert.match(color, /^#[0-9a-f]{6}$/)
    assert.ok(darkInkReads(color), color)
    assert.ok(contrast(DARK_INK, color) >= 4.5, color)
  }
})

test('на темному кольорі поза палітрою літера світла', () => {
  assert.equal(darkInkReads('#1f1a3a'), false)
  assert.ok(contrast('#ffffff', '#1f1a3a') >= 4.5)
})
