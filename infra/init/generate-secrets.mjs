#!/usr/bin/env node

import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DIR = process.env.SECRETS_DIR ?? '/secrets'
const ENV_FILE = path.join(DIR, 'app.env')
const PGRST_FILE = path.join(DIR, 'postgrest.conf')

const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60

const b64url = (value) => Buffer.from(value).toString('base64url')

function signJwt(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const signature = createHmac('sha256', secret)
    .update(`${header}.${body}`)
    .digest()
  return `${header}.${body}.${b64url(signature)}`
}

if (existsSync(ENV_FILE)) {
  console.log(`секрети вже є (${ENV_FILE}) — не чіпаємо`)
  process.exit(0)
}

mkdirSync(DIR, { recursive: true })

const postgresPassword = randomBytes(24).toString('hex')
const jwtSecret = randomBytes(32).toString('hex')

const issuedAt = Math.floor(Date.now() / 1000)
const anonKey = signJwt(
  {
    role: 'anon',
    iss: 'supabase',
    iat: issuedAt,
    exp: issuedAt + TEN_YEARS_SECONDS,
  },
  jwtSecret,
)

writeFileSync(
  ENV_FILE,
  [
    '# Згенеровано автоматично сервісом `init`. Не редагувати руками.',
    `POSTGRES_PASSWORD=${postgresPassword}`,
    `JWT_SECRET=${jwtSecret}`,
    `ANON_KEY=${anonKey}`,
    '',
  ].join('\n'),
  { mode: 0o644 },
)

writeFileSync(
  PGRST_FILE,
  [
    '# Згенеровано автоматично сервісом `init`. Не редагувати руками.',
    `db-uri = "postgres://authenticator:${postgresPassword}@db:5432/postgres"`,
    'db-schemas = "public"',
    'db-anon-role = "anon"',
    'db-use-legacy-gucs = false',
    `jwt-secret = "${jwtSecret}"`,
    'server-port = 3000',
    '',
  ].join('\n'),
  { mode: 0o644 },
)

console.log('секрети згенеровано: POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY')
