/**
 * Гарантія, що екран малюється поверх готової бази пристрою (MER-49).
 *
 * Хуки PowerSync вимагають бази в контексті, а умовних хуків у React не буває —
 * тому екран із запитами існує окремим компонентом, а не гілкою всередині.
 * Той самий прийом, що в `SyncPanel` (MER-46).
 *
 * Стан «готуємо базу» короткий і чесний: він означає рівно те, що написано —
 * локальний SQLite ще відкривається. Мережі тут не чекають: її може не бути
 * взагалі. Якщо база не відкрилась, «готуємо» стає причиною (MER-73): вічне
 * очікування нічого не пояснює ні користувачу, ні тому, хто піднімав сервер.
 */

import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { useSyncState } from '../lib/powersync/provider'
import { AppShell } from './AppShell'
import { Button, ErrorText, Hint, Panel } from './ui'

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
          <LocalDbPending />
        </Panel>
      </AppShell>
    )
  }

  return <>{children(familyId)}</>
}

/**
 * Що показати замість даних, доки бази немає. Повтор — перезавантаженням
 * сторінки: база одна на вкладку (`db.ts`), і екземпляр, що вже раз не
 * відкрився, чесніше відкрити наново, ніж лагодити на ходу.
 */
export function LocalDbPending() {
  const { failure } = useSyncState()

  if (!failure) return <Hint>Готуємо локальну базу…</Hint>

  return (
    <>
      <ErrorText failure={failure} />
      {failure.retryable ? (
        <div className="mt-3.5">
          <Button onClick={() => window.location.reload()}>
            Спробувати ще раз
          </Button>
        </div>
      ) : null}
    </>
  )
}
