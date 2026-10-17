import { useEffect, useState } from 'react'
import { usePowerSync, useQuery, useStatus } from '@powersync/react'
import { plural } from '../lib/format'
import { rejectionFailure, syncFailure } from '../lib/messages'
import type { Failure } from '../lib/messages'
import { useSyncState } from '../lib/powersync/provider'
import { SYNCED_TABLES } from '../lib/powersync/schema'
import { LocalDbPending } from './RequireLocalDb'
import { Button, ErrorText, Hint, Panel } from './ui'

const REJECTED_SHOWN = 5

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function Row({
  label,
  value,
  alert = false,
}: {
  label: string
  value: string
  alert?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0 last:pb-0">
      <span className="text-sm text-muted">{label}</span>
      <span className={alert ? 'text-sm text-warning' : 'text-sm'}>
        {value}
      </span>
    </div>
  )
}

function statusFailures(status: {
  downloadError?: Error
  uploadError?: Error
}): { download: Failure | null; upload: Failure | null } {
  const online = navigator.onLine
  const download = status.downloadError
    ? syncFailure(status.downloadError, { direction: 'download', online })
    : null
  const upload = status.uploadError
    ? syncFailure(status.uploadError, { direction: 'upload', online })
    : null
  return {
    download,
    upload: upload && upload.text === download?.text ? null : upload,
  }
}

export function SyncPanel() {
  const { configured, db, failure } = useSyncState()

  if (failure) {
    return (
      <Panel title="Синхронізація">
        <LocalDbPending />
      </Panel>
    )
  }

  if (!configured) {
    return (
      <Panel title="Синхронізація">
        <Hint>
          Не налаштована: сервер не отримав{' '}
          <code className="text-content">PUBLIC_POWERSYNC_URL</code>. Застосунок
          працює, але дані лишаються на цьому пристрої. Де взяти адресу — в{' '}
          <code className="text-content">infra/README.md</code>.
        </Hint>
      </Panel>
    )
  }

  if (!db) {
    return (
      <Panel title="Синхронізація">
        <LocalDbPending />
      </Panel>
    )
  }

  return <SyncDetails />
}

function SyncDetails() {
  const db = usePowerSync()
  const status = useStatus()
  const { connectFailure, retryConnect, rejected, dismissRejected } =
    useSyncState()
  const [pending, setPending] = useState<number | null>(null)

  useEffect(() => {
    let stale = false
    void db.getUploadQueueStats().then((stats) => {
      if (!stale) setPending(stats.count)
    })
    return () => {
      stale = true
    }
  }, [db, status])

  const { data: counts } = useQuery<{ table_name: string; rows: number }>(
    SYNCED_TABLES.map(
      (table) =>
        `SELECT '${table}' AS table_name, count(*) AS rows FROM ${table}`,
    ).join(' UNION ALL '),
  )
  const stored = counts.reduce((sum, row) => sum + row.rows, 0)

  const failures = statusFailures(status)
  const failing = connectFailure ?? failures.download
  const state = failing
    ? 'Помилка'
    : status.connected
      ? 'Онлайн'
      : status.connecting
        ? 'З’єднуємось…'
        : 'Офлайн — зміни збережено на пристрої'

  return (
    <Panel title="Синхронізація">
      <div className="mb-2">
        <Row label="Стан" value={state} alert={failing !== null} />
        <Row
          label="Останнє оновлення"
          value={
            status.lastSyncedAt ? formatTime(status.lastSyncedAt) : 'ще не було'
          }
        />
        <Row label="Записів на пристрої" value={String(stored)} />
        {pending !== null && pending > 0 ? (
          <Row label="Чекають на відправку" value={String(pending)} />
        ) : null}
      </div>
      {connectFailure ? (
        <div className="mb-3.5">
          <ErrorText failure={connectFailure} />
          <div className="mt-3">
            <Button onClick={retryConnect}>Спробувати ще раз</Button>
          </div>
        </div>
      ) : null}
      {rejected.length ? (
        <div className="mb-3.5">
          <p className="m-0 text-sm text-warning">
            Сервер не прийняв {rejected.length}{' '}
            {plural(rejected.length, 'зміну', 'зміни', 'змін')} з цього
            пристрою. Їх відкинуто: на сервері й інших пристроях їх немає —
            повторіть дію, якщо вона ще потрібна.
          </p>
          {rejected.slice(-REJECTED_SHOWN).map((rejection, i) => (
            <ErrorText key={i} failure={rejectionFailure(rejection)} />
          ))}
          <div className="mt-3">
            <Button onClick={dismissRejected}>Зрозуміло</Button>
          </div>
        </div>
      ) : null}
      {!connectFailure && (failures.download || failures.upload) ? (
        <div className="mb-3.5">
          {failures.download ? <ErrorText failure={failures.download} /> : null}
          {failures.upload ? <ErrorText failure={failures.upload} /> : null}
          <p className="m-0 mt-2 text-xs text-subtle">
            Застосунок повторює спроби сам, щойно сервер відповість — помилка
            зникне.
          </p>
        </div>
      ) : null}
      <Hint>
        Застосунок читає й пише локальну базу, тому працює без мережі. Зміни
        їдуть на сервер, щойно вона з’явиться.
      </Hint>
    </Panel>
  )
}
