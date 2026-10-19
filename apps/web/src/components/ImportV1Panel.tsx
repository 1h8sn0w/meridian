import { useState } from 'react'
import { migrateV1 } from '@meridian/core'
import type { V1Migration } from '@meridian/core'
import { useAuth } from '../lib/auth'
import { useSyncState } from '../lib/powersync/provider'
import { importV1 } from '../lib/data/import-v1'
import type { ImportStats } from '../lib/data/import-v1'
import { errorText } from '../lib/messages'
import type { Failure } from '../lib/messages'
import { RichText } from '../lib/i18n/rich-text'
import { useMessages } from '../lib/i18n/use-messages'
import type { Messages } from '../lib/i18n/uk'
import { Button, ErrorText, Hint, InfoText, LinkButton, Panel } from './ui'

const COUNTED = ['meals', 'recipes', 'profiles', 'prefs'] as const

function summary(
  t: Messages['importV1'],
  counts: Record<(typeof COUNTED)[number], number>,
): string {
  const parts = COUNTED.filter((key) => counts[key] > 0).map((key) =>
    t[key](counts[key]),
  )
  return parts.length ? parts.join(', ') : t.nothing
}

export function ImportV1Panel() {
  const { familyId } = useAuth()
  const messages = useMessages()
  const t = messages.importV1
  const { db, failure: dbFailure } = useSyncState()
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
      const parsed: unknown = JSON.parse(text)
      setMigration(migrateV1(parsed, familyId ?? ''))
      setFileName(file.name)
    } catch (error) {
      setFailure({
        text: t.readFailed,
        detail: errorText(error),
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
        text: t.writeFailed,
        detail: errorText(error),
      })
    }
    setBusy(false)
  }

  if (!familyId || !db) {
    return (
      <Panel title={t.title}>
        <Hint>{dbFailure ? t.unavailable : messages.gate.localDbPending}</Hint>
      </Panel>
    )
  }

  return (
    <Panel title={t.title}>
      {stats ? (
        <>
          <InfoText>{t.done(summary(t, stats))}</InfoText>
          <p className="mt-3">
            <LinkButton onClick={reset}>{t.another}</LinkButton>
          </p>
        </>
      ) : migration ? (
        <>
          <Hint>
            <RichText
              text={t.preview}
              parts={{
                file: <span className="text-content">{fileName}</span>,
                summary: summary(t, {
                  meals: migration.meals.length,
                  recipes: migration.recipes.length,
                  profiles: migration.profiles.length,
                  prefs: migration.prefs.length,
                }),
              }}
            />
          </Hint>

          {migration.skipped.length ? (
            <>
              <p className="mb-1 mt-3 text-xs uppercase tracking-wider text-muted">
                {t.skipped(migration.skipped.length)}
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
              {busy ? t.applying : t.apply}
            </Button>
            <Button disabled={busy} onClick={reset}>
              {messages.common.cancel}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Hint>
            <RichText
              text={t.hint}
              parts={{
                script: (
                  <code className="text-content">tools/v1-export.js</code>
                ),
              }}
            />
          </Hint>
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void readFile(file)
            }}
            className="block w-full cursor-pointer rounded-2xl border border-line bg-app px-3 py-2.5 text-sm text-content file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-accent"
          />
        </>
      )}

      {failure ? <ErrorText failure={failure} /> : null}
    </Panel>
  )
}
