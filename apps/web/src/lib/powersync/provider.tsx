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
  const [db, setDb] = useState<PowerSyncDatabase | null>(null)
  const [failure, setFailure] = useState<LocalDbFailure | null>(null)
  const [connectFailure, setConnectFailure] = useState<Failure | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [rejected, setRejected] = useState<ReadonlyArray<Rejection>>([])

  const [shownFamilyId, setShownFamilyId] = useState(familyId)
  if (shownFamilyId !== familyId) {
    setShownFamilyId(familyId)
    setFailure(null)
    setConnectFailure(null)
    setRejected([])
    if (!familyId) setDb(null)
  }

  const insecure = import.meta.env.MODE !== 'native' && !window.isSecureContext
  const shownFailure =
    familyId && insecure ? openFailure(new Error('insecure context')) : failure

  useEffect(() => {
    if (!familyId || insecure) return

    const fail = (error: unknown) => setFailure(openFailure(error))

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
      setDb(opened)

      const [{ connectPowerSync, disconnectPowerSync }, connectorModule] =
        modules
      if (!configured) return
      const connector = connectorModule.createConnector(
        getSupabase(env),
        env.powersyncUrl,
        (rejection) => {
          if (!isSuperseded()) setRejected((list) => [...list, rejection])
        },
      )
      try {
        await connectPowerSync(connector)
      } catch (error) {
        if (!isSuperseded()) {
          setConnectFailure(
            syncFailure(error, {
              direction: 'connect',
              online: navigator.onLine,
            }),
          )
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
  }, [attempt, configured, env, familyId, insecure])

  const retryConnect = useCallback(() => {
    setFailure(null)
    setConnectFailure(null)
    setAttempt((n) => n + 1)
  }, [])
  const dismissRejected = useCallback(() => setRejected([]), [])

  return (
    <SyncStateContext.Provider
      value={{
        configured,
        db,
        failure: shownFailure,
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
