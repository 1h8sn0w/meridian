import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AuthImplicitGrantRedirectError,
  createClient,
} from '@supabase/supabase-js'
import type { UserIdentity } from '@supabase/supabase-js'

import {
  enabledProviders,
  fetchEnabledProviders,
  redirectError,
  signInMethods,
  startLink,
  startOAuth,
  takePendingLink,
  withoutRedirectError,
} from './oauth.ts'
import { authFailure } from './messages.ts'
import { uk } from './i18n/uk.ts'
import { clientAuthOptions } from './supabase.ts'

const env = {
  supabaseUrl: 'https://app.example.com',
  supabaseAnonKey: 'anon-key',
  powersyncUrl: '',
  releaseAt: '',
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

test('помилка повернення зникає з адреси, решта адреси лишається', () => {
  assert.equal(
    withoutRedirectError(
      'https://app.example.com/?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed#error=access_denied&error_description=Signups+not+allowed&error_code=signup_disabled&sb=',
    ),
    'https://app.example.com/',
  )
  assert.equal(
    withoutRedirectError(
      'https://app.example.com/family?tab=1&error=server_error&error_code=identity_already_exists',
    ),
    'https://app.example.com/family?tab=1',
  )
  assert.equal(
    withoutRedirectError(
      'https://app.example.com/#error_code=bad_oauth_state&state=s',
    ),
    'https://app.example.com/#state=s',
  )
})

test('адреса без помилки повернення не переписується', () => {
  assert.equal(withoutRedirectError('https://app.example.com/family'), null)
  assert.equal(
    withoutRedirectError('https://app.example.com/calendar?day=2026-11-17#top'),
    null,
  )
})

function identity(provider: string, email?: string): UserIdentity {
  return {
    id: provider + '-sub',
    user_id: 'user-1',
    identity_id: provider + '-identity',
    provider,
    identity_data: email ? { email } : {},
  }
}

test('способи входу: прив’язані з адресою, увімкнені без прив’язки — кнопкою', () => {
  const methods = signInMethods(
    [
      identity('github', 'user@example.com'),
      identity('email', 'user@example.com'),
    ],
    ['google', 'github'],
  )
  assert.deepEqual(
    methods.map((m) =>
      m.kind === 'linked'
        ? [m.kind, m.provider, m.address, m.unlink]
        : [m.kind, m.provider],
    ),
    [
      ['linked', 'email', 'user@example.com', 'never'],
      ['available', 'google'],
      ['linked', 'github', 'user@example.com', 'allowed'],
    ],
  )
})

test('останній спосіб входу не відв’язується, а пошта не відв’язується ніколи', () => {
  assert.deepEqual(signInMethods([identity('github')], ['github']), [
    {
      kind: 'linked',
      provider: 'github',
      identity: identity('github'),
      address: null,
      unlink: 'last-method',
    },
  ])

  const methods = signInMethods(
    [identity('email', 'user@example.com'), identity('discord')],
    ['discord'],
  )
  assert.deepEqual(
    methods.map((m) => m.kind === 'linked' && [m.provider, m.unlink]),
    [
      ['email', 'never'],
      ['discord', 'allowed'],
    ],
  )
})

function signedInClient(fetchImpl: typeof fetch) {
  const { supabase, storage } = clientWith(fetchImpl)
  storage.setItem(
    'meridian.auth.v2',
    JSON.stringify({
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
    }),
  )
  return supabase
}

test('прив’язка йде на identities/authorize з PKCE, поверненням на «Сім’ю» й позначкою', async () => {
  const requests: Array<{ url: URL; auth: string | null }> = []
  const supabase = signedInClient((input, init) => {
    requests.push({
      url: new URL(String(input)),
      auth: new Headers(init?.headers).get('authorization'),
    })
    return Promise.resolve(
      json({ url: 'https://github.com/login/oauth/authorize?state=s' }),
    )
  })
  const pending = memoryStorage()

  const { data, error } = await startLink(
    supabase,
    'github',
    'https://app.example.com',
    pending,
  )

  assert.equal(error, null)
  assert.equal(data.url, 'https://github.com/login/oauth/authorize?state=s')
  assert.equal(requests.length, 1)
  const [request] = requests
  assert.equal(
    `${request.url.origin}${request.url.pathname}`,
    'https://app.example.com/auth/v1/user/identities/authorize',
  )
  assert.equal(request.url.searchParams.get('provider'), 'github')
  assert.equal(
    request.url.searchParams.get('redirect_to'),
    'https://app.example.com/family',
  )
  assert.equal(request.url.searchParams.get('skip_http_redirect'), 'true')
  assert.ok(request.url.searchParams.get('code_challenge'))
  assert.equal(request.auth, 'Bearer header.e30.signature')
  assert.equal(takePendingLink(pending), 'github')
  assert.equal(takePendingLink(pending), null)
})

test('сервер відмовив у прив’язці — позначки немає, а помилка зрозуміла', async () => {
  const supabase = signedInClient(() =>
    Promise.resolve(
      json(
        {
          code: 404,
          error_code: 'manual_linking_disabled',
          msg: 'Manual linking is disabled',
        },
        404,
      ),
    ),
  )
  const pending = memoryStorage()

  const { error } = await startLink(
    supabase,
    'google',
    'https://app.example.com',
    pending,
  )

  assert.ok(error)
  assert.deepEqual(authFailure(error), {
    text: uk.errors.auth.manual_linking_disabled,
  })
  assert.equal(takePendingLink(pending), null)
})

test('чужа позначка в сховищі не вважається прив’язкою', () => {
  const pending = memoryStorage()
  pending.setItem('meridian.linking', 'apple')
  assert.equal(takePendingLink(pending), null)
  assert.equal(pending.items.size, 0)
})

test('акаунт провайдера вже в іншого користувача — текст без технічних деталей', () => {
  const error = new AuthImplicitGrantRedirectError(
    'Identity is already linked to another user',
    { error: 'server_error', code: 'identity_already_exists' },
  )
  assert.deepEqual(authFailure(redirectError(error)), {
    text: uk.errors.auth.identity_already_exists,
  })
})
