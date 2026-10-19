import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth'
import { useSyncState } from '../lib/powersync/provider'
import { AppShell } from './AppShell'
import { Button, ErrorText, Hint, Panel } from './ui'
import { useMessages } from '../lib/i18n/use-messages'
import type { Messages } from '../lib/i18n/uk'

export function RequireLocalDb({
  screen,
  children,
}: {
  screen: keyof Messages['titles']
  children: (familyId: string) => ReactNode
}) {
  const { familyId } = useAuth()
  const { db } = useSyncState()
  const t = useMessages()

  if (!familyId || !db) {
    return (
      <AppShell title={t.titles[screen]}>
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
  const t = useMessages()

  if (!failure) return <Hint>{t.gate.localDbPending}</Hint>

  return (
    <>
      <ErrorText failure={failure} />
      {failure.retryable ? (
        <div className="mt-3.5">
          <Button onClick={() => window.location.reload()}>
            {t.common.retry}
          </Button>
        </div>
      ) : null}
    </>
  )
}
