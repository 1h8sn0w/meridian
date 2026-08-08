#!/usr/bin/env node
/**
 * Підняти Meridian V2 з нуля — від свіжого клону до робочого стека.
 *
 * Кроки ті самі, що описані в infra/README.md; скрипт лише робить їх по черзі
 * й не дає забути той єдиний, який ламає все мовчки, — накладку з хуком
 * доступу GoTrue (MER-45).
 *
 * Запуск:
 *   corepack pnpm bootstrap            # Supabase + міграції + .env, далі `pnpm dev`
 *   corepack pnpm bootstrap --full     # плюс наші три сервіси через Caddy
 *
 * Чому Node, а не sh чи ps1: розробка йде на Windows, а хост — Linux, і
 * тримати дві копії однієї логіки означає, що вони розійдуться. Node тут уже
 * обовʼязковий (>=22), сторонніх залежностей скрипт не має.
 *
 * **Ідемпотентний.** Кожен крок спершу перевіряє, чи він уже зроблений: секрети
 * не перегенеровуються, наявні .env не перезаписуються. Перезапуск після збою
 * безпечний — інакше повторний запуск міняв би ключі під уже наповненою базою.
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const INFRA = path.join(ROOT, 'infra')

const args = process.argv.slice(2)
const FULL = args.includes('--full')
const SUPABASE_REF = argValue('--supabase-ref') ?? 'master'
const SUPABASE_DIR = path.resolve(
  argValue('--supabase-dir') ??
    process.env.MERIDIAN_SUPABASE_DIR ??
    path.join(ROOT, 'supabase-project'),
)

/* Локальні адреси зі стандартного .env Supabase (KONG_HTTP_PORT=8000). */
const SUPABASE_URL = 'http://localhost:8000'
const APP_DEV_URL = 'http://localhost:3000'
/* Порт PowerSync на петлі — так його публікує infra/docker-compose.yml. */
const POWERSYNC_DEV_URL = 'http://localhost:8080'
/* Ім'я орендаря supavisor замість заглушки `your-tenant-id` (див. крок 4). */
const POOLER_TENANT_ID = 'meridian'

function argValue(flag) {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const step = (m) => console.log(`\n[36m▸ ${m}[0m`)
const ok = (m) => console.log(`  [32m✓[0m ${m}`)
const skip = (m) => console.log(`  [90m•[0m ${m}`)
const warn = (m) => console.log(`  [33m![0m ${m}`)

function die(message, hint) {
  console.error(`\n[31m✗ ${message}[0m`)
  if (hint) console.error(`  ${hint}`)
  process.exit(1)
}

/**
 * Запустити команду, показуючи її вивід. Повертає результат spawnSync.
 *
 * Два шляхи, і обидва вимушені саме на Windows:
 *  - docker і git — без shell. З shell аргументи склеюються в рядок cmd.exe, і
 *    шлях тому виду `D:\...:/w` розсипається;
 *  - corepack — це .cmd-шим, а такі Node без shell не запускає з часів
 *    виправлення CVE-2024-27980. Тут shell обовʼязковий.
 *
 * Для shell-гілки команда збирається одним рядком: масив аргументів разом із
 * shell дає попередження DEP0190 (аргументи не екрануються). Щоб склейка не
 * стала колись діркою, аргументи з пробілами й лапками просто забороняємо.
 */
const WINDOWS_SHIMS = new Set(['corepack', 'pnpm', 'npm'])

function run(cmd, cmdArgs, opts = {}) {
  const viaShell = process.platform === 'win32' && WINDOWS_SHIMS.has(cmd)

  if (viaShell) {
    const unsafe = cmdArgs.find((a) => /[\s"'`&|<>^]/.test(a))
    if (unsafe) die(`Аргумент «${unsafe}» не можна передати через shell`)
  }

  const res = viaShell
    ? spawnSync([cmd, ...cmdArgs].join(' '), {
        stdio: opts.quiet ? 'pipe' : 'inherit',
        cwd: opts.cwd ?? ROOT,
        env: { ...process.env, ...opts.env },
        encoding: 'utf8',
        shell: true,
      })
    : spawnSync(cmd, cmdArgs, {
        stdio: opts.quiet ? 'pipe' : 'inherit',
        cwd: opts.cwd ?? ROOT,
        env: { ...process.env, ...opts.env },
        encoding: 'utf8',
      })

  if (res.error) die(`${cmd} не запустився: ${res.error.message}`)
  return res
}

/** Docker хоче слеші навіть на Windows: `D:\a\b` → `D:/a/b`. */
const dockerPath = (p) => p.split(path.sep).join('/')

function mustRun(cmd, cmdArgs, message, opts) {
  const res = run(cmd, cmdArgs, opts)
  if (res.status !== 0) {
    if (opts?.quiet && res.stderr) console.error(res.stderr)
    die(message)
  }
  return res
}

/**
 * pnpm через corepack: він іде разом із Node, а версію бере з `packageManager`
 * у кореневому package.json. Виклик просто `pnpm` тут не годиться — глобально
 * його може не бути (див. «Обмеження середовища» в онбордингу).
 */
function pnpm(pnpmArgs, opts = {}) {
  return mustRun(
    'corepack',
    ['pnpm', ...pnpmArgs],
    `pnpm ${pnpmArgs.join(' ')} завершився помилкою`,
    { ...opts, env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: '0', ...opts.env } },
  )
}

/* --- .env як текст ---------------------------------------------------------
 * Читаємо й правимо рядками, а не парсером: у файлі є коментарі й посилання
 * ${VAR}, які треба зберегти дослівно. */

function readEnvValue(file, key) {
  if (!existsSync(file)) return undefined
  const line = readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith(`${key}=`))
  return line ? line.slice(key.length + 1).trim() : undefined
}

function setEnvValue(file, key, value) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const i = lines.findIndex((l) => l.startsWith(`${key}=`))
  if (i >= 0) lines[i] = `${key}=${value}`
  else lines.push(`${key}=${value}`)
  writeFileSync(file, lines.join('\n'), 'utf8')
}

/* --- 1 · Передумови ------------------------------------------------------ */

function checkPrerequisites() {
  step('Передумови')

  const node = Number(process.versions.node.split('.')[0])
  if (node < 22) die(`Потрібен Node >= 22, а тут ${process.versions.node}`)
  ok(`Node ${process.versions.node}`)

  if (run('git', ['--version'], { quiet: true }).status !== 0) {
    die(
      'git не знайдено',
      'Він потрібен, щоб узяти офіційний compose Supabase.',
    )
  }
  ok('git')

  const docker = run('docker', ['info', '--format', '{{.ServerVersion}}'], {
    quiet: true,
  })
  if (docker.status !== 0) {
    die(
      'Docker не відповідає',
      'Запустіть Docker Desktop або демон і повторіть.',
    )
  }
  ok(`Docker ${String(docker.stdout).trim()}`)

  const compose = run('docker', ['compose', 'version'], { quiet: true })
  if (compose.status !== 0)
    die('Немає docker compose v2 (плагін `docker compose`)')
  ok('docker compose')
}

/* --- 2 · Офіційний compose Supabase -------------------------------------- */

async function fetchSupabase() {
  step('Supabase — офіційний compose')

  if (existsSync(path.join(SUPABASE_DIR, 'docker-compose.yml'))) {
    skip(`уже є: ${SUPABASE_DIR}`)
    return
  }

  // Розріджений клон: із усього репозиторію потрібен лише каталог docker/.
  const tmp = mkdtempSync(path.join(tmpdir(), 'meridian-supabase-'))
  try {
    mustRun(
      'git',
      [
        'clone',
        '--depth',
        '1',
        '--filter=blob:none',
        '--sparse',
        '--branch',
        SUPABASE_REF,
        'https://github.com/supabase/supabase',
        tmp,
      ],
      'Не вдалося клонувати supabase/supabase',
      { quiet: true },
    )
    mustRun(
      'git',
      ['sparse-checkout', 'set', 'docker'],
      'Не вдалося звузити клон до каталогу docker/',
      { cwd: tmp, quiet: true },
    )

    await mkdir(SUPABASE_DIR, { recursive: true })
    await cp(path.join(tmp, 'docker'), SUPABASE_DIR, { recursive: true })
    ok(`каталог docker/ скопійовано в ${SUPABASE_DIR} (ref ${SUPABASE_REF})`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  const envFile = path.join(SUPABASE_DIR, '.env')
  if (!existsSync(envFile)) {
    await cp(path.join(SUPABASE_DIR, '.env.example'), envFile)
    ok('.env створено з .env.example')
  }
}

/* --- 3 · Секрети --------------------------------------------------------- */

/**
 * Ключі генерує САМ Supabase — `utils/generate-keys.sh`. Не переписуємо його:
 * формат ANON_KEY / SERVICE_ROLE_KEY належить їм і вже змінювався (перехід на
 * асиметричні ключі). Те саме правило провенансу, що й для конфігів.
 *
 * Запускаємо в одноразовому контейнері, а не на хості: скрипту потрібні sh,
 * sed і openssl, а на Windows їх на PATH може не бути взагалі. Docker для
 * цього проєкту й так обовʼязковий, тож це найпередбачуваніше середовище.
 */
function generateSecrets() {
  step('Секрети Supabase')
  const envFile = path.join(SUPABASE_DIR, '.env')
  const current = readEnvValue(envFile, 'POSTGRES_PASSWORD')

  if (current && !current.startsWith('your-super-secret')) {
    skip('секрети вже згенеровано — не чіпаємо (інакше база стане недоступною)')
    return
  }

  const res = run(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${dockerPath(SUPABASE_DIR)}:/w`,
      '-w',
      '/w',
      'alpine:3',
      'sh',
      '-c',
      'apk add --no-cache openssl >/dev/null 2>&1 && sh utils/generate-keys.sh --update-env',
    ],
    { quiet: true },
  )

  if (res.status !== 0) {
    if (res.stderr) console.error(res.stderr)
    die(
      'utils/generate-keys.sh не відпрацював',
      'Можна зробити руками: див. «1 · Supabase» в infra/README.md.',
    )
  }
  // Вивід скрипта не показуємо: він друкує всі секрети відкритим текстом.
  ok('ключі згенеровано (JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY, паролі)')
}

/* --- 4 · Налаштування під Meridian --------------------------------------- */

function configureSupabase() {
  step('Налаштування Supabase під Meridian')
  const envFile = path.join(SUPABASE_DIR, '.env')

  // Хук доступу: без нього в JWT не буде family_id — і застосунок мовчки
  // не побачить жодного рядка (MER-45).
  const OVERRIDE = 'docker-compose.override.yml'
  const override = path.join(SUPABASE_DIR, OVERRIDE)
  if (existsSync(override)) {
    skip('накладку з хуком доступу вже покладено')
  } else {
    const src = path.join(INFRA, 'supabase', OVERRIDE)
    writeFileSync(override, readFileSync(src, 'utf8'), 'utf8')
    ok(`${OVERRIDE} — хук доступу GoTrue`)
  }

  // Найпідступніше місце всієї установки. Compose підхоплює файл з іменем
  // docker-compose.override.yml сам — але ЛИШЕ доки не задано COMPOSE_FILE. А
  // Supabase у своєму .env його задає (`COMPOSE_FILE=docker-compose.yml`), і
  // накладка просто мовчки ігнорується: усе працює, у токені немає family_id,
  // RLS віддає нуль рядків, помилки ніде немає.
  //
  // COMPOSE_PATH_SEPARATOR задаємо явно: типовий роздільник залежить від ОС
  // (`:` проти `;`), а нам потрібен той самий файл і на Windows, і на хості.
  const composeFile = readEnvValue(envFile, 'COMPOSE_FILE') ?? ''
  if (composeFile.includes(OVERRIDE)) {
    skip('COMPOSE_FILE уже містить накладку')
  } else {
    const files = composeFile
      ? composeFile.split(/[:;]/).filter(Boolean)
      : ['docker-compose.yml']
    setEnvValue(envFile, 'COMPOSE_PATH_SEPARATOR', ':')
    setEnvValue(envFile, 'COMPOSE_FILE', [...files, OVERRIDE].join(':'))
    ok('COMPOSE_FILE доповнено накладкою — інакше Compose її не бачить')
  }

  // Ім'я орендаря supavisor. У прикладі Supabase лежить заглушка
  // `your-tenant-id`, а воно потрапляє в кожен рядок підключення з хоста
  // (користувач — `postgres.<орендар>`) і в логи пулера, тож має називати
  // проєкт.
  //
  // Міняємо ЛИШЕ заглушку. На вже піднятому стеку перейменування завело б
  // другого орендаря (`volumes/pooler/pooler.exs` створює його, якщо такого
  // ще немає), а всі наявні рядки підключення з хоста мовчки перестали б
  // працювати — за це не варто платити красивішим іменем.
  const tenant = readEnvValue(envFile, 'POOLER_TENANT_ID')
  if (tenant && tenant !== 'your-tenant-id') {
    skip(`POOLER_TENANT_ID=${tenant} — уже задано, не чіпаємо`)
  } else {
    setEnvValue(envFile, 'POOLER_TENANT_ID', POOLER_TENANT_ID)
    ok(`POOLER_TENANT_ID=${POOLER_TENANT_ID}`)
  }

  if (readEnvValue(envFile, 'ENABLE_EMAIL_AUTOCONFIRM') === 'true') {
    skip('ENABLE_EMAIL_AUTOCONFIRM уже true')
  } else {
    setEnvValue(envFile, 'ENABLE_EMAIL_AUTOCONFIRM', 'true')
    warn(
      'ENABLE_EMAIL_AUTOCONFIRM=true — локально SMTP немає, інакше реєстрація ' +
        'зависне. Для публічного хоста налаштуйте SMTP або DISABLE_SIGNUP=true.',
    )
  }

  setEnvValue(envFile, 'SITE_URL', APP_DEV_URL)
  ok(`SITE_URL=${APP_DEV_URL}`)
}

/* --- 5 · Запуск Supabase ------------------------------------------------- */

async function startSupabase(anonKey) {
  step('Запуск Supabase (~11 сервісів, перший раз довго)')
  mustRun('docker', ['compose', 'up', '-d'], 'Supabase не піднявся', {
    cwd: SUPABASE_DIR,
  })

  process.stdout.write('  чекаємо на Postgres і GoTrue')
  const deadline = Date.now() + 180_000
  let dbReady = false
  let authReady = false

  while (Date.now() < deadline && !(dbReady && authReady)) {
    if (!dbReady) {
      dbReady =
        run('docker', ['exec', 'supabase-db', 'pg_isready', '-U', 'postgres'], {
          quiet: true,
        }).status === 0
    }
    if (dbReady && !authReady) {
      try {
        // Заголовок apikey обовʼязковий: назовні GoTrue віддає kong, і без
        // ключа маршрут відповідає 401 навіть на /health.
        const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
          headers: { apikey: anonKey },
        })
        authReady = r.ok
      } catch {
        authReady = false
      }
    }
    if (!(dbReady && authReady)) {
      process.stdout.write('.')
      await new Promise((r) => setTimeout(r, 2000))
    }
  }
  process.stdout.write('\n')

  if (!dbReady) die('Postgres так і не піднявся', 'docker compose logs db')
  if (!authReady) die('GoTrue не відповідає', 'docker compose logs auth')
  ok('Postgres і GoTrue готові')
}

/* --- 6 · Міграції -------------------------------------------------------- */

function applyMigrations(postgresPassword, tenantId) {
  step('Міграції схеми')

  if (!existsSync(path.join(ROOT, 'node_modules'))) {
    pnpm(['install'])
    ok('залежності встановлено')
  } else {
    skip('node_modules на місці')
  }

  // Адреса хостова — через supavisor на 5432 (session-режим). Це НЕ той шлях,
  // яким ходить реплікація PowerSync: їй потрібне пряме зʼєднання, і це
  // навмисно різні адреси.
  //
  // Імʼя користувача — `postgres.<POOLER_TENANT_ID>`, а не просто `postgres`:
  // пулер визначає орендаря саме з нього й без суфікса відповідає
  // «no tenant identifier provided». MER-44 перевіряв міграції на чистому
  // Postgres, де пулера немає, тому розбіжність спливла аж тут.
  const user = encodeURIComponent(`postgres.${tenantId}`)
  const url = `postgresql://${user}:${encodeURIComponent(postgresPassword)}@localhost:5432/postgres`
  pnpm(['--filter', '@meridian/db', 'migrate'], { env: { DATABASE_URL: url } })
  ok('міграції застосовано — таблиці, RLS, хук доступу, RPC')
}

/* --- 7 · Файли .env для нашого стека ------------------------------------- */

function writeOurEnvFiles(fromSupabaseEnv) {
  step('Конфіг Meridian')

  const infraEnv = path.join(INFRA, '.env')
  if (existsSync(infraEnv)) {
    skip('infra/.env уже є — не чіпаємо')
    // Один виняток — ім'я орендаря. Джерело правди для нього в `.env`
    // Supabase, а тут воно лише копія; розійшлися — і `pnpm db:migrate` з
    // хоста падає на «no tenant identifier provided». Вирівняти дешевше, ніж
    // ловити це потім.
    const tenant = fromSupabaseEnv.POOLER_TENANT_ID
    if (readEnvValue(infraEnv, 'POOLER_TENANT_ID') !== tenant) {
      setEnvValue(infraEnv, 'POOLER_TENANT_ID', tenant)
      warn(`POOLER_TENANT_ID вирівняно з .env Supabase (${tenant})`)
    }
  } else {
    let text = readFileSync(path.join(INFRA, '.env.example'), 'utf8')
    for (const [key, value] of Object.entries(fromSupabaseEnv)) {
      text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`)
    }
    writeFileSync(infraEnv, text, 'utf8')
    ok('infra/.env заповнено з .env.example')
  }

  const webEnv = path.join(ROOT, 'apps', 'web', '.env')
  if (existsSync(webEnv)) {
    skip('apps/web/.env уже є — не чіпаємо')
  } else {
    writeFileSync(
      webEnv,
      `PUBLIC_SUPABASE_URL=${SUPABASE_URL}\n` +
        `PUBLIC_SUPABASE_ANON_KEY=${fromSupabaseEnv.ANON_KEY}\n` +
        // Адреса sync-сервісу для браузера (MER-46). У `pnpm dev` це порт
        // PowerSync на петлі: наш compose публікує його на 127.0.0.1.
        `PUBLIC_POWERSYNC_URL=${POWERSYNC_DEV_URL}\n`,
      'utf8',
    )
    ok('apps/web/.env — для `pnpm dev`')
  }
}

/* --- 8 · Наш стек (--full) ----------------------------------------------- */

function startOurStack() {
  step('Наші сервіси: web, powersync, caddy')
  mustRun(
    'docker',
    [
      'compose',
      '-f',
      path.join(INFRA, 'docker-compose.yml'),
      'up',
      '-d',
      '--build',
    ],
    'Наш стек не піднявся',
  )
  ok('піднято')
}

/* --- Головне ------------------------------------------------------------- */

async function main() {
  console.log('[1mMeridian V2 — bootstrap[0m')

  checkPrerequisites()
  await fetchSupabase()
  generateSecrets()
  configureSupabase()

  const envFile = path.join(SUPABASE_DIR, '.env')
  const secrets = {
    POSTGRES_PASSWORD: readEnvValue(envFile, 'POSTGRES_PASSWORD'),
    // Ним GoTrue підписує токени, і ним же PowerSync їх перевіряє (MER-46):
    // JWKS у self-host лишається порожнім, доки не перейти на асиметричні
    // ключі. Без цього значення синхронізація відповідає 401.
    JWT_SECRET: readEnvValue(envFile, 'JWT_SECRET'),
    ANON_KEY: readEnvValue(envFile, 'ANON_KEY'),
    SERVICE_ROLE_KEY: readEnvValue(envFile, 'SERVICE_ROLE_KEY'),
  }
  for (const [key, value] of Object.entries(secrets)) {
    if (!value) die(`У ${envFile} немає ${key}`)
  }
  const tenantId = readEnvValue(envFile, 'POOLER_TENANT_ID')
  if (!tenantId) die(`У ${envFile} немає POOLER_TENANT_ID`)

  await startSupabase(secrets.ANON_KEY)
  applyMigrations(secrets.POSTGRES_PASSWORD, tenantId)
  // Ім'я орендаря — не секрет, але так само мусить збігатися з `.env`
  // Supabase, тому їде в infra/.env тим самим шляхом, що й ключі.
  writeOurEnvFiles({ ...secrets, POOLER_TENANT_ID: tenantId })
  if (FULL) startOurStack()

  console.log('\n[32m[1mГотово.[0m')
  console.log(`
  Supabase Studio   ${SUPABASE_URL}
  Каталог Supabase  ${SUPABASE_DIR}
${
  FULL
    ? '  Застосунок        https://localhost (Caddy, локальний CA — браузер лається)\n' +
      '  Sync              https://sync.localhost'
    : '  Далі              corepack pnpm dev  →  ' + APP_DEV_URL
}

  Секрети лежать у ${path.relative(ROOT, envFile) || envFile}, infra/.env і
  apps/web/.env — усі три в git не потрапляють.

  Зупинити:  docker compose -f infra/docker-compose.yml down
             docker compose down            (у каталозі Supabase)
`)
}

main().catch((error) =>
  die(error instanceof Error ? error.message : String(error)),
)
