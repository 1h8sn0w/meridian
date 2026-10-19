import { useEffect, useState } from 'react'
import { usePowerSync, useQuery, useStatus } from '@powersync/react'
import { rejectionFailure, syncFailure } from '../lib/messages'
import type { Failure } from '../lib/messages'
import { useSyncState } from '../lib/powersync/provider'
import { SYNCED_TABLES } from '../lib/powersync/schema'
import { LocalDbPending } from './RequireLocalDb'
import { Button, ErrorText, Hint, Panel } from './ui'
import { intlLocale } from '../lib/i18n/locale'
import { RichText } from '../lib/i18n/rich-text'
import { useMessages } from '../lib/i18n/use-messages'

const REJECTED_SHOWN = 5

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(intlLocale(), {
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
  const t = useMessages().sync

  if (failure) {
    return (
      <Panel title={t.title}>
        <LocalDbPending />
      </Panel>
    )
  }

  if (!configured) {
    return (
      <Panel title={t.title}>
        <Hint>
          <RichText
            text={t.notConfigured}
            parts={{
              url: <code className="text-content">PUBLIC_POWERSYNC_URL</code>,
              readme: <code className="text-content">infra/README.md</code>,
            }}
          />
        </Hint>
      </Panel>
    )
  }

  if (!db) {
    return (
      <Panel title={t.title}>
        <LocalDbPending />
      </Panel>
    )
  }

  return <SyncDetails />
}

function SyncDetails() {
  const db = usePowerSync()
  const messages = useMessages()
  const t = messages.sync
  const retry = messages.common.retry
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

  const shownFrom = Math.max(0, rejected.length - REJECTED_SHOWN)
  const failures = statusFailures(status)
  const failing = connectFailure ?? failures.download
  const state = failing
    ? t.error
    : status.connected
      ? t.online
      : status.connecting
        ? t.connecting
        : t.offline

  return (
    <Panel title={t.title}>
      <div className="mb-2">
        <Row label={t.state} value={state} alert={failing !== null} />
        <Row
          label={t.lastSynced}
          value={
            status.lastSyncedAt ? formatTime(status.lastSyncedAt) : t.never
          }
        />
        <Row label={t.stored} value={String(stored)} />
        {pending !== null && pending > 0 ? (
          <Row label={t.pending} value={String(pending)} />
        ) : null}
      </div>
      {connectFailure ? (
        <div className="mb-3.5">
          <ErrorText failure={connectFailure} />
          <div className="mt-3">
            <Button onClick={retryConnect}>{retry}</Button>
          </div>
        </div>
      ) : null}
      {rejected.length ? (
        <div className="mb-3.5">
          <p className="m-0 text-sm text-warning">
            {t.rejected(rejected.length)}
          </p>
          {rejected.slice(shownFrom).map((rejection, i) => (
            <ErrorText
              key={shownFrom + i}
              failure={rejectionFailure(rejection)}
            />
          ))}
          <div className="mt-3">
            <Button onClick={dismissRejected}>{t.understood}</Button>
          </div>
        </div>
      ) : null}
      {!connectFailure && (failures.download || failures.upload) ? (
        <div className="mb-3.5">
          {failures.download ? <ErrorText failure={failures.download} /> : null}
          {failures.upload ? <ErrorText failure={failures.upload} /> : null}
          <p className="m-0 mt-2 text-xs text-subtle">{t.retrying}</p>
        </div>
      ) : null}
      <Hint>{t.hint}</Hint>
    </Panel>
  )
}
