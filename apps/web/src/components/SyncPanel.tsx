/**
 * Стан синхронізації (MER-46).
 *
 * Це не «індикатор для краси»: без нього єдиний спосіб дізнатися, що дані
 * стоять у черзі й нікуди не їдуть, — дивитися в консоль. Local-first означає,
 * що застосунок працює однаково і онлайн, і офлайн, — саме тому користувач має
 * бачити, у якому саме стані він зараз.
 *
 * Місце панелі — вкладка «Сім'я» (MER-49): на головні екрани вона не проситься.
 * Local-first означає, що стан з'єднання не має впливати на роботу, тож у
 * шапці «Сьогодні» він був би шумом; сюди ж заходять свідомо — коли між
 * пристроями щось не сходиться.
 */

import { useEffect, useState } from 'react'
import { usePowerSync, useQuery, useStatus } from '@powersync/react'
import { useSyncState } from '../lib/powersync/provider'
import { SYNCED_TABLES } from '../lib/powersync/schema'
import { Hint, Panel } from './ui'

/** «18:42» — панель показує час у межах доби, дата тут нічого не додає. */
function formatTime(date: Date): string {
  return new Intl.DateTimeFormat('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0 last:pb-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  )
}

export function SyncPanel() {
  const { configured, db } = useSyncState()

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
        <Hint>Готуємо локальну базу…</Hint>
      </Panel>
    )
  }

  return <SyncDetails />
}

/**
 * Окремим компонентом, бо хуки PowerSync вимагають готової бази в контексті, а
 * умовних хуків у React не буває.
 */
function SyncDetails() {
  const db = usePowerSync()
  const status = useStatus()
  const [pending, setPending] = useState<number | null>(null)

  // Кількість невідправленого лежить у службовій черзі, а не в наших таблицях,
  // тож звичайним запитом її не поспостерігаєш. Перечитуємо на кожну зміну
  // стану — цього досить: черга росте й тане саме разом із ним.
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

  const state = status.connected
    ? 'Онлайн'
    : status.connecting
      ? 'З’єднуємось…'
      : 'Офлайн — зміни збережено на пристрої'

  return (
    <Panel title="Синхронізація">
      <div className="mb-2">
        <Row label="Стан" value={state} />
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
      <Hint>
        Застосунок читає й пише локальну базу, тому працює без мережі. Зміни
        їдуть на сервер, щойно вона з’явиться.
      </Hint>
    </Panel>
  )
}
