import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  README_LIMIT,
  isReadme,
  oversizedReadmes,
} from './check-readme-size.mjs'

const oversized = (texts) =>
  oversizedReadmes(Object.keys(texts), (file) => texts[file])

test('межа включна: рівно ліміт проходить, на символ більше — ні', () => {
  assert.deepEqual(
    oversized({
      'a/README.md': 'x'.repeat(README_LIMIT),
      'b/README.md': 'x'.repeat(README_LIMIT + 1),
    }),
    [{ file: 'b/README.md', size: README_LIMIT + 1 }],
  )
})

test('розмір — у кодових точках Unicode, а не в байтах чи UTF-16', () => {
  assert.deepEqual(
    oversized({
      'a/README.md': 'ї'.repeat(README_LIMIT),
      'b/README.md': '🌞'.repeat(README_LIMIT),
    }),
    [],
  )
})

test('перевіряються лише файли README.md, у будь-якій теці', () => {
  for (const file of [
    'README.md',
    'packages/core/README.md',
    'new/README.md',
  ]) {
    assert.equal(isReadme(file), true, file)
  }
  for (const file of [
    'README.en.md',
    'infra/DECISIONS.md',
    'docs/readme.md',
    'README.md.bak',
    'NOT_README.md',
  ]) {
    assert.equal(isReadme(file), false, file)
  }
})
