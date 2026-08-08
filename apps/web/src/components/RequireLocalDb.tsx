/**
 * Гарантія, що екран малюється поверх готової бази пристрою (MER-49).
 *
 * Хуки PowerSync вимагають бази в контексті, а умовних хуків у React не буває —
 * тому екран із запитами існує окремим компонентом, а не гілкою всередині.
 * Той самий прийом, що в `SyncPanel` (MER-46).
 *
 * Стан «готуємо базу» короткий і чесний: він означає рівно те, що написано —
 * локальний SQLite ще відкривається. Мережі тут не чекають: її може не бути
 * взагалі.
 */

import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { useSyncState } from '../lib/powersync/provider'
import { AppShell } from './AppShell'
import { Hint, Panel } from './ui'

export function RequireLocalDb({
  title,
  children,
}: {
  title: string
  children: (familyId: string) => ReactNode
}) {
  const { familyId } = useAuth()
  const { db } = useSyncState()

  if (!familyId || !db) {
    return (
      <AppShell title={title}>
        <Panel>
          <Hint>Готуємо локальну базу…</Hint>
        </Panel>
      </AppShell>
    )
  }

  return <>{children(familyId)}</>
}
