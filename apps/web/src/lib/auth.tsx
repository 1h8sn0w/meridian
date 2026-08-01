/**
 * Стан входу й сім'ї (MER-45).
 *
 * Одне джерело правди — claim `family_id` в access-токені. Він же вирішує, що
 * покаже інтерфейс, він же лежить в основі RLS на сервері (MER-44) і саме його
 * читатимуть sync-правила PowerSync (MER-46). Тому після створення сім'ї або
 * прийняття запрошення обов'язково йде `refreshSession()`: без нового токена
 * застосунок бачив би порожньо, і це найнеприємніший спосіб зламатися — тихий.
 *
 * На сервері (SSR) стан завжди `loading`: сесія живе на пристрої, і сервер про
 * неї не знає й не має знати.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { familyIdFromToken, getSupabase } from './supabase'
import { isPublicEnvReady } from './public-env'
import type { PublicEnv } from './public-env'
import { authFailure, rpcFailure } from './messages'
import type { Failure } from './messages'

export type Status =
  /** Конфіг не заданий — сервер не знає адреси Supabase. */
  | 'not-configured'
  /** Ще не знаємо: SSR або читаємо збережену сесію. */
  | 'loading'
  | 'signed-out'
  /** Увійшли, але сім'ї ще немає — створити або приєднатися за кодом. */
  | 'no-family'
  | 'ready'

export type FamilyMember = { id: string; userId: string; email: string | null }
export type Family = { id: string; name: string }
export type Invite = { code: string; expiresAt: string }

/** Рядки як їх віддає PostgREST — snake_case, без згенерованих типів схеми. */
type FamilyRow = { id: string; name: string }
type MemberRow = { id: string; user_id: string; email: string | null }
type InviteRow = { code: string; expires_at: string }

export type Result<T> = { ok: true; value: T } | { ok: false; failure: Failure }

type AuthValue = {
  status: Status
  email: string | null
  /** `auth.users.id` поточної сесії — щоб упізнати свій рядок у складі сім'ї. */
  userId: string | null
  familyId: string | null
  family: Family | null
  members: Array<FamilyMember>
  invite: Invite | null
  signIn: (email: string, password: string) => Promise<Result<null>>
  /** `false` у значенні — сесії немає: GoTrue чекає підтвердження пошти. */
  signUp: (email: string, password: string) => Promise<Result<boolean>>
  signOut: () => Promise<void>
  createFamily: (name: string) => Promise<Result<null>>
  joinFamily: (code: string) => Promise<Result<null>>
  createInvite: () => Promise<Result<Invite>>
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth поза AuthProvider')
  return value
}

export function AuthProvider({
  env,
  children,
}: {
  env: PublicEnv
  children: ReactNode
}) {
  const configured = isPublicEnvReady(env)
  const [session, setSession] = useState<Session | null>(null)
  const [resolved, setResolved] = useState(false)
  const [family, setFamily] = useState<Family | null>(null)
  const [members, setMembers] = useState<Array<FamilyMember>>([])
  const [invite, setInvite] = useState<Invite | null>(null)

  const familyId = familyIdFromToken(session?.access_token)

  /** Клієнт існує лише у браузері — на сервері до нього не звертаємось. */
  const client = useCallback((): SupabaseClient => getSupabase(env), [env])

  useEffect(() => {
    if (!configured) return
    const supabase = client()
    // Підписка сама віддає INITIAL_SESSION, тож окремий getSession() не
    // потрібен. У колбеку — лише setState: документація Supabase попереджає не
    // викликати звідси інші методи клієнта.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setResolved(true)
    })
    return () => data.subscription.unsubscribe()
  }, [client, configured])

  useEffect(() => {
    if (!configured || !familyId) {
      setFamily(null)
      setMembers([])
      setInvite(null)
      return
    }
    // Сім'я може змінитися, доки запити в дорозі, — тоді відповіді вже нікому.
    const stale = new AbortController()
    const supabase = client()

    void (async () => {
      // RLS уже звузила вибірку до своєї сім'ї — фільтрувати по family_id у
      // запиті не треба, і саме так це має виглядати з боку клієнта.
      const [familyRows, memberRows, inviteRows] = await Promise.all([
        supabase
          .from('family')
          .select('id,name')
          .is('deleted_at', null)
          .limit(1)
          .returns<Array<FamilyRow>>(),
        supabase
          .from('family_member')
          .select('id,user_id,email')
          .is('deleted_at', null)
          .order('created_at')
          .returns<Array<MemberRow>>(),
        supabase
          .from('family_invite')
          .select('code,expires_at')
          .is('deleted_at', null)
          .is('accepted_at', null)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .returns<Array<InviteRow>>(),
      ])
      if (stale.signal.aborted) return

      const row = familyRows.data?.[0]
      setFamily(row ? { id: row.id, name: row.name } : null)
      setMembers(
        (memberRows.data ?? []).map((m) => ({
          id: m.id,
          userId: m.user_id,
          email: m.email,
        })),
      )
      const pending = inviteRows.data?.[0]
      setInvite(
        pending ? { code: pending.code, expiresAt: pending.expires_at } : null,
      )
    })()

    return () => stale.abort()
  }, [client, configured, familyId])

  const value = useMemo<AuthValue>(() => {
    const status: Status = !configured
      ? 'not-configured'
      : !resolved
        ? 'loading'
        : !session
          ? 'signed-out'
          : familyId
            ? 'ready'
            : 'no-family'

    return {
      status,
      email: session?.user.email ?? null,
      userId: session?.user.id ?? null,
      familyId,
      family,
      members,
      invite,

      signIn: async (email, password) => {
        const { error } = await client().auth.signInWithPassword({
          email,
          password,
        })
        return error
          ? { ok: false, failure: authFailure(error) }
          : { ok: true, value: null }
      },

      signUp: async (email, password) => {
        const { data, error } = await client().auth.signUp({ email, password })
        if (error) return { ok: false, failure: authFailure(error) }
        // Без сесії GoTrue чекає підтвердження пошти. Кажемо це прямо, а не
        // вдаємо, що вхід стався.
        return { ok: true, value: data.session !== null }
      },

      signOut: async () => {
        await client().auth.signOut()
      },

      createFamily: async (name) => {
        const supabase = client()
        const { error } = await supabase.rpc('create_family', {
          family_name: name,
        })
        if (error) return { ok: false, failure: rpcFailure(error) }
        // Токен ще без claim — без оновлення сесії сім'ї ніби й немає.
        await supabase.auth.refreshSession()
        return { ok: true, value: null }
      },

      joinFamily: async (code) => {
        const supabase = client()
        const { error } = await supabase.rpc('accept_family_invite', {
          invite_code: code,
        })
        if (error) return { ok: false, failure: rpcFailure(error) }
        await supabase.auth.refreshSession()
        return { ok: true, value: null }
      },

      createInvite: async () => {
        const supabase = client()
        const { data, error } = await supabase.rpc('create_family_invite')
        if (error) return { ok: false, failure: rpcFailure(error) }
        const code = String(data)
        // Термін дії читаємо з бази, а не рахуємо тут: показане в інтерфейсі
        // має збігатися з тим, що справді записано.
        const row = await supabase
          .from('family_invite')
          .select('code,expires_at')
          .eq('code', code)
          .single()
          .returns<InviteRow>()
        if (row.error) return { ok: false, failure: rpcFailure(row.error) }
        const fresh = { code: row.data.code, expiresAt: row.data.expires_at }
        setInvite(fresh)
        return { ok: true, value: fresh }
      },
    }
  }, [client, configured, family, familyId, invite, members, resolved, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
