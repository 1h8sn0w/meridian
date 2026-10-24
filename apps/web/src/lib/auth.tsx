import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { familyIdFromToken, getSupabase } from './supabase'
import { isPublicEnvReady } from './public-env'
import type { PublicEnv } from './public-env'
import { authFailure, rpcFailure } from './messages'
import type { Outcome } from './messages'

type Status =
  'not-configured' | 'loading' | 'signed-out' | 'no-family' | 'ready'

type FamilyMember = { id: string; userId: string; email: string | null }
type Family = { id: string; name: string }
type Invite = { code: string; expiresAt: string }

type FamilyRow = { id: string; name: string }
type MemberRow = { id: string; user_id: string; email: string | null }
type InviteRow = { code: string; expires_at: string }

type AuthValue = {
  status: Status
  email: string | null
  userId: string | null
  familyId: string | null
  family: Family | null
  members: Array<FamilyMember>
  invite: Invite | null
  signIn: (email: string, password: string) => Promise<Outcome<null>>
  signUp: (email: string, password: string) => Promise<Outcome<boolean>>
  signOut: () => Promise<void>
  createFamily: (name: string) => Promise<Outcome<null>>
  joinFamily: (code: string) => Promise<Outcome<null>>
  createInvite: () => Promise<Outcome<Invite>>
  supabase: SupabaseClient | null
}

const AuthContext = createContext<AuthValue | null>(null)

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth outside AuthProvider')
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
  const [shownFamilyId, setShownFamilyId] = useState(familyId)
  if (shownFamilyId !== familyId) {
    setShownFamilyId(familyId)
    setFamily(null)
    setMembers([])
    setInvite(null)
  }

  useEffect(() => {
    if (!configured) return
    const supabase = getSupabase(env)
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setResolved(true)
    })
    return () => data.subscription.unsubscribe()
  }, [configured, env])

  useEffect(() => {
    if (!configured || !familyId) return
    const stale = new AbortController()
    const supabase = getSupabase(env)

    void (async () => {
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
  }, [configured, env, familyId])

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
      supabase: configured && resolved ? getSupabase(env) : null,

      signIn: async (email, password) => {
        const { error } = await getSupabase(env).auth.signInWithPassword({
          email,
          password,
        })
        return error
          ? { ok: false, failure: authFailure(error) }
          : { ok: true, value: null }
      },

      signUp: async (email, password) => {
        const { data, error } = await getSupabase(env).auth.signUp({
          email,
          password,
        })
        if (error) return { ok: false, failure: authFailure(error) }
        return { ok: true, value: data.session !== null }
      },

      signOut: async () => {
        await getSupabase(env).auth.signOut()
      },

      createFamily: async (name) => {
        const supabase = getSupabase(env)
        const { error } = await supabase.rpc('create_family', {
          family_name: name,
        })
        if (error) return { ok: false, failure: rpcFailure(error) }
        await supabase.auth.refreshSession()
        return { ok: true, value: null }
      },

      joinFamily: async (code) => {
        const supabase = getSupabase(env)
        const { error } = await supabase.rpc('accept_family_invite', {
          invite_code: code,
        })
        if (error) return { ok: false, failure: rpcFailure(error) }
        await supabase.auth.refreshSession()
        return { ok: true, value: null }
      },

      createInvite: async () => {
        const supabase = getSupabase(env)
        const { data, error } = await supabase.rpc('create_family_invite')
        if (error) return { ok: false, failure: rpcFailure(error) }
        const code = String(data)
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
  }, [configured, env, family, familyId, invite, members, resolved, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
