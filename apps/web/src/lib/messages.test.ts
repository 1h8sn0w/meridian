/**
 * Причина, чому не відкрилась база пристрою (MER-73). Без неї застосунок
 * лишався на «Готуємо локальну базу…» назавжди — і саме тут легко знову
 * сховати оригінальний текст помилки або пообіцяти повтор, який не допоможе.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { localDbFailure } from './messages.ts'

test('незахищена адреса: що робити, яка адреса, і без повтору', () => {
  const failure = localDbFailure(
    new Error('Navigator locks are not available'),
    {
      secure: false,
      origin: 'http://192.0.2.10:8080',
    },
  )
  assert.match(failure.text, /HTTPS/)
  assert.equal(failure.detail, 'http://192.0.2.10:8080')
  assert.equal(failure.retryable, false)
})

test('інша причина: оригінальний текст помилки й повтор', () => {
  const failure = localDbFailure(new Error('QuotaExceededError'), {
    secure: true,
    origin: 'https://meridian.example.com',
  })
  assert.equal(failure.detail, 'QuotaExceededError')
  assert.equal(failure.retryable, true)
})

test('кинуто не Error — текст однаково доходить до людини', () => {
  const failure = localDbFailure('wasm unavailable', {
    secure: true,
    origin: 'https://meridian.example.com',
  })
  assert.equal(failure.detail, 'wasm unavailable')
})
