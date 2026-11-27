import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('index.html без вбудованих скриптів і стилів: їх заборонила б CSP', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/)
  assert.doesNotMatch(html, /<style|\sstyle=/)
})

test('публічний конфіг вантажиться раніше за застосунок', () => {
  const env = html.indexOf('src="/env.js"')
  assert.ok(env !== -1)
  assert.ok(env < html.indexOf('src="/src/main.tsx"'))
})

const APP_URL = '{{env `APP_URL` | html}}'

const metaContent = (attr: 'name' | 'property', key: string) =>
  new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`).exec(
    html.replace(/\s+/g, ' '),
  )?.[1]

test('прев’ю посилання: Open Graph і Twitter на місці, адреси абсолютні з APP_URL', () => {
  for (const key of [
    'og:type',
    'og:site_name',
    'og:title',
    'og:description',
    'og:image:width',
    'og:image:height',
    'og:image:alt',
    'og:locale',
  ]) {
    assert.ok(metaContent('property', key), key)
  }
  for (const key of ['description', 'twitter:title', 'twitter:description']) {
    assert.ok(metaContent('name', key), key)
  }
  assert.equal(metaContent('name', 'twitter:card'), 'summary_large_image')
  assert.equal(metaContent('property', 'og:url'), APP_URL + '/')
  assert.equal(metaContent('property', 'og:image'), APP_URL + '/og-image.png')
  assert.equal(metaContent('name', 'twitter:image'), APP_URL + '/og-image.png')
})

test('у index.html немає інших виразів шаблону, ніж APP_URL', () => {
  const expressions = html.match(/\{\{[^}]*\}\}/g) ?? []
  assert.ok(expressions.length > 0)
  assert.deepEqual([...new Set(expressions)], [APP_URL])
})

test('картка прев’ю — PNG 1200×630, менше 300 КБ', () => {
  const png = readFileSync(new URL('../public/og-image.png', import.meta.url))
  assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG')
  assert.equal(
    png.readUInt32BE(16),
    Number(metaContent('property', 'og:image:width')),
  )
  assert.equal(
    png.readUInt32BE(20),
    Number(metaContent('property', 'og:image:height')),
  )
  assert.ok(png.length < 300 * 1024, String(png.length))
})
