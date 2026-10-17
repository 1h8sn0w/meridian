import { test } from 'node:test'
import assert from 'node:assert/strict'

import { UpdateType } from '@powersync/web'
import { localDbFailure, rejectionFailure, syncFailure } from './messages.ts'

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

test('немає мережі — це офлайн, а не помилка', () => {
  const online = { direction: 'download', online: true } as const
  assert.equal(syncFailure(new TypeError('Failed to fetch'), online), null)
  assert.equal(
    syncFailure(
      new Error('NetworkError when attempting to fetch resource.'),
      online,
    ),
    null,
  )
  assert.equal(syncFailure(new Error('Load failed'), online), null)
  assert.equal(
    syncFailure(new Error('HTTP Internal Server Error: boom'), {
      direction: 'download',
      online: false,
    }),
    null,
  )
})

test('вхід не прийнято — за кодом і за текстом із воркера', () => {
  const withStatus = Object.assign(new Error('HTTP Unauthorized: '), {
    status: 401,
  })
  const download = { direction: 'download', online: true } as const
  assert.match(syncFailure(withStatus, download)?.text ?? '', /вхід/)
  assert.match(
    syncFailure(new Error('Not signed in'), download)?.text ?? '',
    /вхід/,
  )
  assert.match(
    syncFailure(
      new Error(
        'Received 401 - Unauthorized when getting from /write-checkpoint2.json',
      ),
      download,
    )?.text ?? '',
    /вхід/,
  )
  assert.match(
    syncFailure(
      { message: 'JWT expired', code: 'PGRST301' },
      { direction: 'upload', online: true },
    )?.text ?? '',
    /вхід/,
  )
})

test('інша причина: напрям визначає текст, оригінал завжди поруч', () => {
  const download = syncFailure(
    new Error('HTTP Internal Server Error: replication slot missing'),
    { direction: 'download', online: true },
  )
  assert.match(download?.text ?? '', /отримати дані/)
  assert.equal(
    download?.detail,
    'HTTP Internal Server Error: replication slot missing',
  )

  const upload = syncFailure(
    { message: 'new row violates check constraint', code: '23514' },
    { direction: 'upload', online: true },
  )
  assert.match(upload?.text ?? '', /в черзі/)
  assert.equal(upload?.detail, 'new row violates check constraint')
})

test('connect() без мережі не мовчить: його ніхто не повторить сам', () => {
  const failure = syncFailure(new TypeError('Failed to fetch'), {
    direction: 'connect',
    online: true,
  })
  assert.match(failure?.text ?? '', /немає мережі/)
  assert.equal(failure?.detail, 'Failed to fetch')
})

test('відкинута зміна називає, що й чому сервер не прийняв, а код лишає в деталях', () => {
  assert.deepEqual(
    rejectionFailure({
      table: 'meal_pref',
      op: UpdateType.PUT,
      code: '23505',
      message: 'duplicate key value',
    }),
    {
      text: 'Позначка смаку: сервер не прийняв створення — такий запис уже є (мабуть, його створили на іншому пристрої).',
      detail: '23505 duplicate key value',
    },
  )
  assert.match(
    rejectionFailure({
      table: 'meal',
      op: UpdateType.PATCH,
      code: '22P02',
      message: 'invalid input',
    }).text,
    /^Страва: сервер не прийняв зміну — некоректне значення\.$/,
  )
})

test('невідома таблиця й невідомий код не ховають відмову, а кажуть загально', () => {
  assert.equal(
    rejectionFailure({
      table: 'new_table',
      op: UpdateType.DELETE,
      code: '23P01',
      message: 'x',
    }).text,
    'new_table: сервер не прийняв видалення — сервер відхилив дані.',
  )
})
