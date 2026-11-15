import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AuthImplicitGrantRedirectError,
  createClient,
} from '@supabase/supabase-js'

import {
  enabledProviders,
  fetchEnabledProviders,
  redirectError,
  startOAuth,
} from './oauth.ts'
import { clientAuthOptions } from './supabase.ts'

const env = {
  supabaseUrl: 'https://app.example.com',
  supabaseAnonKey: 'anon-key',
  powersyncUrl: '',
}

function memoryStorage() {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function clientWith(fetchImpl: typeof fetch) {
  const storage = memoryStorage()
  const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { ...clientAuthOptions, storage, autoRefreshToken: false },
    global: { fetch: fetchImpl },
  })
  return { supabase, storage }
}

test('кнопки лише для увімкнених провайдерів із трьох підтримуваних', () => {
  assert.deepEqual(
    enabledProviders({
      external: { email: true, github: true, google: false, apple: true },
    }),
    ['github'],
  )
  assert.deepEqual(
    enabledProviders({
      external: { google: true, discord: true, github: true },
    }),
    ['google', 'discord', 'github'],
  )
})

test('без налаштувань або з чужою відповіддю провайдерів немає', () => {
  assert.deepEqual(enabledProviders(null), [])
  assert.deepEqual(enabledProviders({}), [])
  assert.deepEqual(enabledProviders({ external: { google: 'true' } }), [])
})

test('налаштування читаються з GoTrue, а збій мережі ховає кнопки', async () => {
  const urls: Array<string> = []
  const enabled = await fetchEnabledProviders(env, (input) => {
    urls.push(String(input))
    return Promise.resolve(json({ external: { discord: true } }))
  })
  assert.deepEqual(enabled, ['discord'])
  assert.deepEqual(urls, ['https://app.example.com/auth/v1/settings'])

  assert.deepEqual(
    await fetchEnabledProviders(env, () => Promise.resolve(json({}, 503))),
    [],
  )
  assert.deepEqual(
    await fetchEnabledProviders(env, () =>
      Promise.reject(new TypeError('Failed to fetch')),
    ),
    [],
  )
})

test('вхід через провайдера веде на authorize з PKCE і поверненням у застосунок', async () => {
  const { supabase, storage } = clientWith(() =>
    Promise.reject(new Error('мережі тут не має бути')),
  )

  const { data, error } = await startOAuth(
    supabase,
    'github',
    'https://app.example.com',
  )

  assert.equal(error, null)
  const url = new URL(data.url)
  assert.equal(
    url.origin + url.pathname,
    'https://app.example.com/auth/v1/authorize',
  )
  assert.equal(url.searchParams.get('provider'), 'github')
  assert.equal(url.searchParams.get('redirect_to'), 'https://app.example.com/')
  assert.equal(url.searchParams.get('code_challenge_method'), 's256')
  assert.ok(url.searchParams.get('code_challenge'))
  assert.ok(storage.items.get('meridian.auth.v2-code-verifier'))
})

test('повернення з code обмінюється на сесію тим самим верифікатором', async () => {
  const requests: Array<{ url: string; body: unknown }> = []
  const session = {
    access_token: 'header.e30.signature',
    refresh_token: 'refresh-1',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: {
      id: 'user-1',
      aud: 'authenticated',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00Z',
    },
  }
  const { supabase, storage } = clientWith((input, init) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) })
    return Promise.resolve(json(session))
  })

  await startOAuth(supabase, 'google', 'https://app.example.com')
  const verifier: unknown = JSON.parse(
    storage.items.get('meridian.auth.v2-code-verifier') ?? 'null',
  )
  const exchanged = await supabase.auth.exchangeCodeForSession('code-1')

  assert.equal(exchanged.error, null)
  assert.equal(exchanged.data.session.refresh_token, 'refresh-1')
  assert.equal(requests.length, 1)
  assert.equal(
    requests[0]?.url,
    'https://app.example.com/auth/v1/token?grant_type=pkce',
  )
  assert.deepEqual(requests[0]?.body, {
    auth_code: 'code-1',
    code_verifier: verifier,
  })
  assert.ok(storage.items.get('meridian.auth.v2'))
})

test('помилка з адреси повернення бере код GoTrue, щоб знайти переклад', () => {
  const error = new AuthImplicitGrantRedirectError('Signups not allowed', {
    error: 'access_denied',
    code: 'signup_disabled',
  })
  assert.deepEqual(redirectError(error), {
    code: 'signup_disabled',
    message: 'Signups not allowed',
  })
})
