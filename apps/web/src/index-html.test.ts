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
