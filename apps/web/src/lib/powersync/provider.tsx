/**
 * Життєвий цикл локальної бази й синхронізації в React (MER-46, MER-49).
 *
 * Два різні питання, і плутати їх не можна:
 *
 *  - **база пристрою існує, доки є `family_id` у токені.** Вона — джерело істини
 *    для інтерфейсу, тож відкривається завжди, коли є кому належати;
 *  - **з'єднання із сервісом існує, доки ще й задана його адреса.** Немає
 *    `PUBLIC_POWERSYNC_URL` — застосунок працює повністю, просто лишається на
 *    одному пристрої (MER-49: екрани читають SQLite, а не мережу).
 *
 * Стан входу вже зведений до одного значення в `lib/auth.tsx`, тож тут його не
 * перевіряють удруге.
 *
 * `@powersync/web` вантажиться **динамічно**: у ньому WASM і web-workers, яких
 * на сервері немає. SSR через це рендерить той самий каркас, що й до першої
 * синхронізації, — і не вгадує, чи є в користувача дані.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { PowerSyncContext } from '@powersync/react'
import type { PowerSyncDatabase } from '@powersync/web'
import { useAuth } from '../auth'
import { getSupabase } from '../supabase'
import { isSyncConfigured } from '../public-env'
import type { PublicEnv } from '../public-env'

export type SyncState = {
  /** Чи задана адреса сервісу. Без неї застосунок працює, але лише тут. */
  configured: boolean
  /** База пристрою; `null`, доки не відкрилася (або поза браузером). */
  db: PowerSyncDatabase | null
}

const SyncStateContext = createContext<SyncState>({
  configured: false,
  db: null,
})

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

  useEffect(() => {
    if (!familyId) {
      // Вийшли з акаунта — базу з контексту прибираємо, з диска ні.
      setDb(null)
      return
    }

    // Сім'я може змінитися, доки база відкривається, — тоді результат уже
    // нікому. Той самий прийом, що й у запитах складу сім'ї (lib/auth.tsx).
    const stale = new AbortController()
    // Через функцію, а не полем: інакше TypeScript вважає, що після першої
    // перевірки значення вже не зміниться, — а воно тільки те й робить.
    const aborted = () => stale.signal.aborted

    void (async () => {
      const [
        { openPowerSync, connectPowerSync, disconnectPowerSync },
        connectorModule,
      ] = await Promise.all([import('./db'), import('./connector')])
      if (aborted()) return

      const opened = await openPowerSync(familyId)
      if (aborted()) return
      setDb(opened)

      if (!configured) return
      const connector = connectorModule.createConnector(
        getSupabase(env),
        env.powersyncUrl,
      )
      await connectPowerSync(connector)
      // Поки з'єднувалися, сім'я могла змінитись — тоді від'єднуємось відразу,
      // інакше з'єднання пережило б власний ефект.
      if (aborted()) await disconnectPowerSync()
    })()

    return () => {
      stale.abort()
      // `setDb(null)` тут НЕ робимо навмисно: база пристрою переживає і зміну
      // токена, і повторний запуск ефекту, а зайве обнулення давало б екранам
      // порожній контекст на кожному оновленні сесії. Прибирає її лише гілка
      // «сім'ї немає» вище.
      //
      // База лишається й на диску — стирає її тільки зміна сім'ї (db.ts).
      void import('./db').then(({ disconnectPowerSync }) =>
        disconnectPowerSync(),
      )
    }
  }, [configured, env, familyId])

  return (
    <SyncStateContext.Provider value={{ configured, db }}>
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
