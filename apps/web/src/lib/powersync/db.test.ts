import { test } from 'node:test'
import assert from 'node:assert/strict'

import { enqueue } from './db.ts'

const tick = () => new Promise((resolve) => setTimeout(resolve, 5))

test('операції з базою йдуть по черзі: наступна стартує лише після попередньої', async () => {
  const log: Array<string> = []
  const first = enqueue(async () => {
    log.push('connect:start')
    await tick()
    log.push('connect:end')
  })
  const second = enqueue(async () => {
    log.push('disconnect:start')
    await tick()
    log.push('disconnect:end')
  })
  await Promise.all([first, second])
  assert.deepEqual(log, [
    'connect:start',
    'connect:end',
    'disconnect:start',
    'disconnect:end',
  ])
})

test('відмова однієї операції не рве чергу й доходить до того, хто її чекав', async () => {
  const failed = enqueue(() => Promise.reject(new Error('connect failed')))
  const next = enqueue(() => Promise.resolve('opened'))
  await assert.rejects(failed, /connect failed/)
  assert.equal(await next, 'opened')
})
