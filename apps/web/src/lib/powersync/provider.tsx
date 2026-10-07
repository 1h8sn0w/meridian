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
 * **База, що не відкрилась, — це стан, а не вічне очікування** (MER-73). Без цього
 * помилка йшла в нікуди, а екрани лишались на «Готуємо локальну базу…» назавжди.
 * Провал з'єднання екранів не блокує: з базою, що відкрилась, застосунок працює
 * й без сервісу. Але й у нікуди він не йде (MER-84) — його показує панель
 * «Синхронізація», разом із повтором.
 *
 * `@powersync/web` вантажиться **динамічно**: у ньому WASM і web-workers, і
 * тягнути їх у стартовий чанк заради екрана входу нема сенсу.
 */

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

type SyncState = {
  /** Чи задана адреса сервісу. Без неї застосунок працює, але лише тут. */
  configured: boolean
  /** База пристрою; `null`, доки не відкрилася (або поза браузером). */
  db: PowerSyncDatabase | null
  /** Чому база не відкрилась; `null`, доки відкривається або відкрилась. */
  failure: LocalDbFailure | null
  /**
   * Чому `connect()` відмовив; `null`, доки все гаразд. Помилки вже запущеного
   * стріму сюди не потрапляють — їх веде статус PowerSync, і повторює він їх
   * сам.
   */
  connectFailure: Failure | null
  /** Ще раз відкрити базу й під'єднатися — після `connectFailure`. */
  retryConnect: () => void
}

const SyncStateContext = createContext<SyncState>({
  configured: false,
  db: null,
  failure: null,
  connectFailure: null,
  retryConnect: () => undefined,
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
  const [failure, setFailure] = useState<LocalDbFailure | null>(null)
  const [connectFailure, setConnectFailure] = useState<Failure | null>(null)
  // Кожен повтор — новий запуск ефекту: та сама черга операцій (`db.ts`), той
  // самий порядок «від'єднатись → відкрити → з'єднатись», без окремого шляху.
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    setFailure(null)
    setConnectFailure(null)
    if (!familyId) {
      // Вийшли з акаунта — базу з контексту прибираємо, з диска ні.
      setDb(null)
      return
    }

    const fail = (error: unknown) =>
      setFailure(
        localDbFailure(error, {
          secure: window.isSecureContext,
          origin: window.location.origin,
        }),
      )

    // Незахищена адреса ловиться до відкриття, а не за його наслідками:
    // PowerSync падає на `navigator.locks` десь у своїй глибині, і чи дійде
    // та помилка до нас, від нас не залежить. Лише веб: нативна оболонка
    // бере SQLite платформи (MER-50), і схема її WebView тут ні до чого.
    if (import.meta.env.MODE !== 'native' && !window.isSecureContext) {
      fail(new Error('insecure context'))
      return
    }

    // Сім'я може змінитися, доки база відкривається, — тоді результат уже
    // нікому. Той самий прийом, що й у запитах складу сім'ї (lib/auth.tsx).
    const stale = new AbortController()
    // Через функцію, а не полем: інакше TypeScript вважає, що після першої
    // перевірки значення вже не зміниться, — а воно тільки те й робить.
    const aborted = () => stale.signal.aborted

    void (async () => {
      const loading = Promise.all([import('./db'), import('./connector')])
      let modules: Awaited<typeof loading>
      let opened: PowerSyncDatabase
      try {
        // Чанк не довантажився чи сама база не відкрилась — для екранів це одне:
        // даних на пристрої не буде, і сказати треба чому.
        modules = await loading
        if (aborted()) return
        opened = await modules[0].openPowerSync(familyId)
      } catch (error) {
        if (!aborted()) fail(error)
        return
      }
      if (aborted()) return
      setDb(opened)

      const [{ connectPowerSync, disconnectPowerSync }, connectorModule] =
        modules
      if (!configured) return
      const connector = connectorModule.createConnector(
        getSupabase(env),
        env.powersyncUrl,
      )
      try {
        await connectPowerSync(connector)
      } catch (error) {
        // Раніше це була необроблена відмова обіцянки: панель казала «Офлайн»,
        // а причина лишалась у консолі.
        if (!aborted()) {
          setConnectFailure(
            syncFailure(error, {
              direction: 'connect',
              online: navigator.onLine,
            }),
          )
        }
        return
      }
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
  }, [attempt, configured, env, familyId])

  const retryConnect = useCallback(() => setAttempt((n) => n + 1), [])

  return (
    <SyncStateContext.Provider
      value={{ configured, db, failure, connectFailure, retryConnect }}
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
