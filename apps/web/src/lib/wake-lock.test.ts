import { test } from 'node:test'
import assert from 'node:assert/strict'

import { keepScreenAwake } from './wake-lock.ts'

function fakeScreen(refuse = false) {
  const sentinels: Array<{ released: boolean }> = []
  const pending: Array<() => void> = []
  const host = {
    wakeLock: {
      request: () =>
        new Promise<{ release: () => Promise<void> }>((resolve, reject) => {
          pending.push(() => {
            if (refuse) {
              reject(new Error('NotAllowedError'))
              return
            }
            const state = { released: false }
            sentinels.push(state)
            resolve({
              release: async () => {
                state.released = true
              },
            })
          })
        }),
    },
  }
  const settle = async () => {
    for (const grant of pending.splice(0)) grant()
    await new Promise((resolve) => setImmediate(resolve))
  }
  return { host, sentinels, pending, settle }
}

function fakePage(visibilityState: DocumentVisibilityState = 'visible') {
  const page = Object.assign(new EventTarget(), { visibilityState })
  const show = (state: DocumentVisibilityState) => {
    page.visibilityState = state
    page.dispatchEvent(new Event('visibilitychange'))
  }
  return { page, show }
}

const noError = () => assert.fail('помилки не мало бути')

test('видима сторінка просить блокування одразу', async () => {
  const screen = fakeScreen()
  const { page } = fakePage()
  keepScreenAwake(screen.host, page, noError)
  await screen.settle()
  assert.equal(screen.sentinels.length, 1)
  assert.equal(screen.sentinels[0].released, false)
})

test('прихована сторінка не просить, а повернення на неї просить знову', async () => {
  const screen = fakeScreen()
  const { page, show } = fakePage('hidden')
  keepScreenAwake(screen.host, page, noError)
  assert.equal(screen.pending.length, 0)
  show('visible')
  await screen.settle()
  assert.equal(screen.sentinels.length, 1)
})

test('новий запит знімає попереднє блокування, тож живе лише одне', async () => {
  const screen = fakeScreen()
  const { page, show } = fakePage()
  keepScreenAwake(screen.host, page, noError)
  await screen.settle()
  show('visible')
  await screen.settle()
  assert.deepEqual(
    screen.sentinels.map((sentinel) => sentinel.released),
    [true, false],
  )
})

test('зупинка знімає блокування й більше не просить', async () => {
  const screen = fakeScreen()
  const { page, show } = fakePage()
  const stop = keepScreenAwake(screen.host, page, noError)
  await screen.settle()
  stop()
  await screen.settle()
  assert.equal(screen.sentinels[0].released, true)
  show('visible')
  assert.equal(screen.pending.length, 0)
})

test('блокування, що прийшло вже після зупинки, знімається одразу', async () => {
  const screen = fakeScreen()
  const { page } = fakePage()
  const stop = keepScreenAwake(screen.host, page, noError)
  stop()
  await screen.settle()
  assert.equal(screen.sentinels[0].released, true)
})

test('відмову браузера отримує onError, а після зупинки — ніхто', async () => {
  const refused = fakeScreen(true)
  const errors: Array<unknown> = []
  keepScreenAwake(refused.host, fakePage().page, (cause) => errors.push(cause))
  await refused.settle()
  assert.equal(errors.length, 1)

  const late = fakeScreen(true)
  const stop = keepScreenAwake(late.host, fakePage().page, (cause) =>
    errors.push(cause),
  )
  stop()
  await late.settle()
  assert.equal(errors.length, 1)
})
