#!/usr/bin/env node
/**
 * Секрети стека — генеруються самі, при першому `docker compose up`.
 *
 * Це той крок, який раніше робив користувач руками: брав `generate-keys.sh`
 * Supabase, копіював значення у два `.env` і стежив, щоб вони не розійшлися.
 * Тепер його немає — сервіс `init` пише секрети у спільний том, а решта
 * сервісів читає їх звідти. Нічого не треба вводити, і жоден секрет не
 * потрапляє ні в git, ні в `docker compose config`, ні в історію команд.
 *
 * Пишемо два файли, бо читачі різні:
 *   app.env        — рядки KEY=VALUE; сервіси з оболонкою роблять `. app.env`;
 *   postgrest.conf — у образі PostgREST немає навіть /bin/sh, тож єдиний спосіб
 *                    передати йому секрет — конфіг-файл, який він читає сам.
 *
 * **Ідемпотентний.** Є app.env — виходимо, не чіпаючи. Інакше перезапуск
 * стека міняв би пароль під уже наповненою базою й JWT_SECRET під уже
 * виданими токенами: база стала б недоступною, а всі сесії — недійсними.
 */

import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const DIR = process.env.SECRETS_DIR ?? '/secrets'
const ENV_FILE = path.join(DIR, 'app.env')
const PGRST_FILE = path.join(DIR, 'postgrest.conf')

/* Ключі живуть, доки живе стек: це не сесії користувачів, а конфіг сервісів.
 * Коротший строк означав би, що самохост одного дня мовчки перестає пускати. */
const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60

const b64url = (value) => Buffer.from(value).toString('base64url')

/**
 * HS256-токен без бібліотек. Формат той самий, що в `generate-keys.sh`
 * Supabase: `role` у claims, `iss: supabase`, довгий строк. Саме за цим
 * claim PostgREST перемикає роль підключення.
 */
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
/* GoTrue вимагає щонайменше 32 символи; 64 hex — з запасом. Цим же секретом
 * PostgREST і PowerSync перевіряють токени (MER-46), тому він один на стек. */
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

/* Порядок рядків не важливий, але файл читає `sh`, тож жодних пробілів
 * навколо `=` і жодних лапок: значення тут — hex і base64url, без пробілів.
 *
 * Права 0644, а не 0600: GoTrue, PostgREST і PowerSync працюють не від root
 * (uid supabase, 1000 і 901 відповідно), і 0600 від root вони б не прочитали.
 * Том усередині стека — інші контейнери його не бачать. */
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

/* PostgREST читає це сам (`postgrest /secrets/postgrest.conf`).
 * `db-uri` — під роллю `authenticator`: PostgREST входить нею, а далі
 * перемикається на `anon` чи `authenticated` залежно від claim `role`. */
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
