import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const ORIGIN = 'https://meridian.example'
const SOURCE = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8')

type FetchEvent = {
  request: { url: string; method: string; mode: string }
  respondWith: (response: Promise<Response>) => void
  waitUntil: (work: Promise<unknown>) => void
}

function worker(network: (url: string) => Response) {
  const listeners = new Map<string, (event: FetchEvent) => void>()
  const stored: Array<string> = []
  const cache = {
    put: (key: string | { url: string }) => {
      stored.push(typeof key === 'string' ? key : key.url)
      return Promise.resolve()
    },
  }
  runInNewContext(SOURCE, {
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, listener: (event: FetchEvent) => void) =>
        listeners.set(type, listener),
    },
    caches: {
      match: () => Promise.resolve(undefined),
      open: () => Promise.resolve(cache),
    },
    fetch: (request: { url: string }) => Promise.resolve(network(request.url)),
    URL,
    console,
  })

  return async (
    path: string,
    init: { method?: string; mode?: string } = {},
  ) => {
    const pending: Array<Promise<unknown>> = []
    let handled = false
    listeners.get('fetch')?.({
      request: {
        url: path.startsWith('http') ? path : ORIGIN + path,
        method: init.method ?? 'GET',
        mode: init.mode ?? 'no-cors',
      },
      respondWith: (response) => {
        handled = true
        pending.push(response)
      },
      waitUntil: (work) => void pending.push(work),
    })
    for (const work of pending) await work
    return { handled, stored: [...stored] }
  }
}

const html = () =>
  new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } })
const json = () =>
  new Response('{}', { headers: { 'content-type': 'application/json' } })

test('API на тому самому походженні воркер не чіпає: /auth/v1, /rest/v1, /sync', async () => {
  const request = worker(json)
  for (const path of ['/auth/v1/token', '/rest/v1/meal', '/sync/stream']) {
    assert.equal((await request(path)).handled, false, path)
  }
})

test('чуже походження й не-GET ідуть повз воркер', async () => {
  const request = worker(json)
  assert.equal(
    (await request('https://cdn.example/assets/a.js')).handled,
    false,
  )
  assert.equal(
    (await request('/assets/a.js', { method: 'POST' })).handled,
    false,
  )
})

test('файли збірки, іконки й маніфест беруться з кешу й кладуться в нього', async () => {
  const request = worker(html)
  for (const path of [
    '/assets/index-abc.js',
    '/icons/icon-192.png',
    '/manifest.webmanifest',
  ]) {
    const result = await request(path)
    assert.equal(result.handled, true, path)
    assert.ok(result.stored.includes(ORIGIN + path), path)
  }
})

test('навігація будь-якої адреси кладе HTML під один ключ оболонки', async () => {
  const result = await worker(html)('/week', { mode: 'navigate' })
  assert.equal(result.handled, true)
  assert.deepEqual(result.stored, ['/'])
})

test('навігація, що повернула не HTML, у кеш оболонки не потрапляє', async () => {
  const result = await worker(json)('/rest/v1/meal', { mode: 'navigate' })
  assert.equal(result.handled, true)
  assert.deepEqual(result.stored, [])
})
