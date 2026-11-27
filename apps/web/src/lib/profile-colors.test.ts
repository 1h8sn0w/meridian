import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const palette = /PROFILE_COLORS = \[([^\]]*)\]/.exec(
  read('./active-profile.ts'),
)?.[1]
const colors = [...(palette ?? '').matchAll(/'([^']*)'/g)].map((m) => m[1])
const ink = /--color-button-ink:\s*(#[0-9a-f]{6});/.exec(
  read('../styles.css'),
)?.[1]

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('літера аватара (button-ink) на кожному кольорі палітри ≥ 4.5:1', () => {
  assert.ok(ink)
  assert.ok(colors.length > 0)
  for (const color of colors) {
    assert.match(color, /^#[0-9a-f]{6}$/)
    assert.ok(contrast(ink, color) >= 4.5, `${color}: ${contrast(ink, color)}`)
  }
})
