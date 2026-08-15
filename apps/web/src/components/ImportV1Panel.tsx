/**
 * Перенесення даних з V1 (MER-48).
 *
 * Місце — вкладка «Сім'я»: це разова дія рівня «налаштувати застосунок», а не
 * щоденна робота з раціоном, тож на трьох головних екранах їй нема чого робити
 * (та сама логіка, що й у панелі синхронізації).
 *
 * **Два кроки, а не один.** Файл спершу розбирається й показується: скільки
 * страв, профілів і смаків приїде — і що саме НЕ приїде та чому. Записуємо
 * лише після явного підтвердження. Міграція, яка мовчки застосувалась, а
 * половину даних загубила, помічається вже після видалення V1 — тобто пізно.
 *
 * Розбір робить чиста функція ядра (`migrateV1`), запис — `importV1`. Тут лише
 * екран: файл, попередній перегляд, підтвердження, підсумок.
 */

import { useState } from 'react'
import { migrateV1 } from '@meridian/core'
import type { V1Migration } from '@meridian/core'
import { useAuth } from '../lib/auth'
import { useSyncState } from '../lib/powersync/provider'
import { importV1 } from '../lib/data/import-v1'
import type { ImportStats } from '../lib/data/import-v1'
import type { Failure } from '../lib/messages'
import { Button, ErrorText, Hint, InfoText, LinkButton, Panel } from './ui'

/** Українська множина: 1 страва, 2–4 страви, 5+ страв. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** «3 страви, 2 профілі» — порожні складові не згадуємо взагалі. */
function summary(counts: {
  meals: number
  recipes: number
  profiles: number
  prefs: number
}): string {
  const parts: Array<string> = []
  if (counts.meals) {
    parts.push(
      counts.meals + ' ' + plural(counts.meals, 'страва', 'страви', 'страв'),
    )
  }
  if (counts.recipes) {
    parts.push(
      counts.recipes +
        ' ' +
        plural(counts.recipes, 'рецепт', 'рецепти', 'рецептів'),
    )
  }
  if (counts.profiles) {
    parts.push(
      counts.profiles +
        ' ' +
        plural(counts.profiles, 'профіль', 'профілі', 'профілів'),
    )
  }
  if (counts.prefs) {
    parts.push(
      counts.prefs + ' ' + plural(counts.prefs, 'смак', 'смаки', 'смаків'),
    )
  }
  return parts.length ? parts.join(', ') : 'нічого'
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function ImportV1Panel() {
  const { familyId } = useAuth()
  const { db } = useSyncState()
  const [migration, setMigration] = useState<V1Migration | null>(null)
  const [fileName, setFileName] = useState('')
  const [stats, setStats] = useState<ImportStats | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  const reset = () => {
    setMigration(null)
    setFileName('')
    setStats(null)
    setFailure(null)
  }

  const readFile = async (file: File) => {
    reset()
    setBusy(true)
    try {
      const text = await file.text()
      // Розбір і читання файлу падають по-різному, але для користувача це одна
      // й та сама відповідь: «цей файл не підходить», плюс оригінал причини.
      const parsed: unknown = JSON.parse(text)
      setMigration(migrateV1(parsed, familyId ?? ''))
      setFileName(file.name)
    } catch (error) {
      setFailure({
        text: 'Не вдалося прочитати файл експорту.',
        detail: describe(error),
      })
    }
    setBusy(false)
  }

  const apply = async () => {
    if (!db || !familyId || !migration) return
    setBusy(true)
    setFailure(null)
    try {
      setStats(await importV1(db, familyId, migration))
      setMigration(null)
    } catch (error) {
      setFailure({
        text: 'Не вдалося записати дані на пристрій.',
        detail: describe(error),
      })
    }
    setBusy(false)
  }

  if (!familyId || !db) {
    return (
      <Panel title="Перенести дані з V1">
        <Hint>Готуємо локальну базу…</Hint>
      </Panel>
    )
  }

  return (
    <Panel title="Перенести дані з V1">
      {stats ? (
        <>
          <InfoText>Перенесено: {summary(stats)}.</InfoText>
          <p className="mt-3">
            <LinkButton onClick={reset}>Перенести ще один файл</LinkButton>
          </p>
        </>
      ) : migration ? (
        <>
          <Hint>
            Файл <span className="text-content">{fileName}</span> — приїде:{' '}
            {summary({
              meals: migration.meals.length,
              recipes: migration.recipes.length,
              profiles: migration.profiles.length,
              prefs: migration.prefs.length,
            })}
            .
          </Hint>

          {migration.skipped.length ? (
            <>
              <p className="mb-1 mt-3 text-xs uppercase tracking-wider text-muted">
                Не переноситься ({migration.skipped.length})
              </p>
              <ul className="m-0 max-h-64 list-none overflow-y-auto p-0">
                {migration.skipped.map((item, index) => (
                  <li
                    key={item.what + index}
                    className="border-b border-line py-1.5 text-sm leading-normal last:border-b-0"
                  >
                    <span className="text-content">{item.what}</span>{' '}
                    <span className="text-muted">— {item.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              disabled={busy}
              onClick={() => void apply()}
            >
              {busy ? 'Переносимо…' : 'Перенести'}
            </Button>
            <Button disabled={busy} onClick={reset}>
              Скасувати
            </Button>
          </div>
        </>
      ) : (
        <>
          <Hint>
            Дані V1 лежать у сховищі браузера, тож дістати їх може лише сам
            браузер. Відкрийте V1 на тій самій адресі, де ним користуєтесь,
            виконайте в консолі вміст{' '}
            <code className="text-content">tools/v1-export.js</code> — і
            виберіть збережений файл тут. Повторний імпорт того самого файлу
            нічого не подвоїть.
          </Hint>
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              // Значення поля скидаємо, щоб той самий файл можна було вибрати
              // вдруге після «Скасувати» — інакше `change` просто не настане.
              event.target.value = ''
              if (file) void readFile(file)
            }}
            className="block w-full cursor-pointer rounded-lg border border-line bg-app px-2.5 py-2 text-sm text-content scheme-dark"
          />
        </>
      )}

      {failure ? <ErrorText failure={failure} /> : null}
    </Panel>
  )
}
