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
