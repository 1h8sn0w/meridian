import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { PowerSyncContext } from '@powersync/react'
import type { PowerSyncDatabase } from '@powersync/web'
import { useAuth } from '../auth'
import { getSupabase } from '../supabase'
import { isSyncConfigured } from '../public-env'
import type { PublicEnv } from '../public-env'
import { localDbFailure, syncFailure } from '../messages'
import type { Failure, LocalDbFailure } from '../messages'
import type { Rejection } from './connector'

type SyncState = {
  configured: boolean
  db: PowerSyncDatabase | null
  failure: LocalDbFailure | null
  connectFailure: Failure | null
  retryConnect: () => void
  rejected: ReadonlyArray<Rejection>
  dismissRejected: () => void
}

const SyncStateContext = createContext<SyncState>({
  configured: false,
  db: null,
  failure: null,
  connectFailure: null,
  retryConnect: () => undefined,
  rejected: [],
  dismissRejected: () => undefined,
})

type Kept<T> = { key: string; value: T }

const NO_REJECTIONS: ReadonlyArray<Rejection> = []

function keptFor<T>(kept: Kept<T> | null, key: string | null): T | null {
  return kept && kept.key === key ? kept.value : null
}

function runOf(familyId: string | null, attempt: number): string {
  return `${familyId}#${attempt}`
}

function isInsecure(): boolean {
  return import.meta.env.MODE !== 'native' && !window.isSecureContext
}

function openFailure(error: unknown): LocalDbFailure {
  return localDbFailure(error, {
    secure: window.isSecureContext,
    origin: window.location.origin,
  })
}

export function useSyncState(): SyncState {
  return useContext(SyncStateContext)
}

export function SyncProvider({
  env,
  children,
}: {
  env: PublicEnv
  children: ReactNode
}) {
  const { familyId } = useAuth()
  const configured = isSyncConfigured(env)
  const [database, setDatabase] = useState<Kept<PowerSyncDatabase> | null>(null)
  const [failed, setFailed] = useState<Kept<LocalDbFailure> | null>(null)
  const [connectFailed, setConnectFailed] =
    useState<Kept<Failure | null> | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [rejections, setRejections] = useState<Kept<
    ReadonlyArray<Rejection>
  > | null>(null)

  const run = runOf(familyId, attempt)
  const db = keptFor(database, familyId)
  const failure = !familyId
    ? null
    : isInsecure()
      ? openFailure(new Error('insecure context'))
      : keptFor(failed, run)
  const connectFailure = keptFor(connectFailed, run)
  const rejected = keptFor(rejections, familyId) ?? NO_REJECTIONS

  useEffect(() => {
    if (!familyId || isInsecure()) return

    const fail = (error: unknown) =>
      setFailed({ key: run, value: openFailure(error) })

    const superseded = new AbortController()
    const isSuperseded = () => superseded.signal.aborted

    void (async () => {
      const loading = Promise.all([import('./db'), import('./connector')])
      let modules: Awaited<typeof loading>
      let opened: PowerSyncDatabase
      try {
        modules = await loading
        if (isSuperseded()) return
        opened = await modules[0].openPowerSync(familyId)
      } catch (error) {
        if (!isSuperseded()) fail(error)
        return
      }
      if (isSuperseded()) return
      setDatabase({ key: familyId, value: opened })

      const [{ connectPowerSync, disconnectPowerSync }, connectorModule] =
        modules
      if (!configured) return
      const connector = connectorModule.createConnector(
        getSupabase(env),
        env.powersyncUrl,
        (rejection) => {
          if (!isSuperseded()) {
            setRejections((kept) => ({
              key: familyId,
              value: [...(keptFor(kept, familyId) ?? []), rejection],
            }))
          }
        },
      )
      try {
        await connectPowerSync(connector)
      } catch (error) {
        if (!isSuperseded()) {
          setConnectFailed({
            key: run,
            value: syncFailure(error, {
              direction: 'connect',
              online: navigator.onLine,
            }),
          })
        }
        return
      }
      if (isSuperseded()) await disconnectPowerSync()
    })()

    return () => {
      superseded.abort()
      void import('./db').then(({ disconnectPowerSync }) =>
        disconnectPowerSync(),
      )
    }
  }, [configured, env, familyId, run])

  const retryConnect = useCallback(() => setAttempt((n) => n + 1), [])
  const dismissRejected = useCallback(() => setRejections(null), [])

  return (
    <SyncStateContext.Provider
      value={{
        configured,
        db,
        failure,
        connectFailure,
        retryConnect,
        rejected,
        dismissRejected,
      }}
    >
      {db ? (
        <PowerSyncContext.Provider value={db}>
          {children}
        </PowerSyncContext.Provider>
      ) : (
        children
      )}
    </SyncStateContext.Provider>
  )
}
