import { useEffect, useId, useState } from 'react'
import {
  DiscordLogo,
  EnvelopeSimple,
  GithubLogo,
  GoogleLogo,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import type { UserIdentity } from '@supabase/supabase-js'
import { useAuth } from '../lib/auth'
import { authFailure } from '../lib/messages'
import type { Failure } from '../lib/messages'
import { signInMethods } from '../lib/oauth'
import type { OAuthProvider, SignInMethod } from '../lib/oauth'
import { useMessages } from '../lib/i18n/use-messages'
import { Button, ErrorText, Hint, InfoText, Meta, Panel } from './ui'

export const PROVIDER_LOOK: Record<OAuthProvider, { name: string; icon: Icon }> =
  {
    google: { name: 'Google', icon: GoogleLogo },
    discord: { name: 'Discord', icon: DiscordLogo },
    github: { name: 'GitHub', icon: GithubLogo },
  }

export function SignInMethodsPanel() {
  const { supabase, providers, linkReturn, linkWith } = useAuth()
  const messages = useMessages()
  const t = messages.family
  const [identities, setIdentities] = useState<Array<UserIdentity> | null>(
    null,
  )
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const lastMethodId = useId()
  const anyEnabled = providers.length > 0

  useEffect(() => {
    if (!supabase || !anyEnabled) return
    const stale = new AbortController()
    void supabase.auth.getUserIdentities().then(({ data, error }) => {
      if (stale.signal.aborted) return
      if (error) setFailure(authFailure(error))
      else setIdentities(data.identities)
    })
    return () => stale.abort()
  }, [supabase, anyEnabled])

  if (!anyEnabled) return null

  const methods = identities ? signInMethods(identities, providers) : []
  const lastMethodLocked = methods.some(
    (method) =>
      method.kind === 'linked' &&
      method.provider !== 'email' &&
      !method.unlinkable,
  )

  const link = async (provider: OAuthProvider) => {
    setBusy(true)
    setFailure(null)
    const result = await linkWith(provider)
    if (!result.ok) setFailure(result.failure)
    setBusy(false)
  }

  const unlink = async (identity: UserIdentity) => {
    if (!supabase) return
    setBusy(true)
    setFailure(null)
    const { error } = await supabase.auth.unlinkIdentity(identity)
    if (error) setFailure(authFailure(error))
    else
      setIdentities(
        (current) =>
          current?.filter((i) => i.identity_id !== identity.identity_id) ??
          null,
      )
    setBusy(false)
  }

  return (
    <Panel title={t.signInMethods}>
      <Hint>{t.signInMethodsHint}</Hint>
      {identities ? (
        <ul className="m-0 list-none p-0">
          {methods.map((method) => (
            <MethodRow
              key={
                method.kind === 'linked'
                  ? method.identity.identity_id
                  : method.provider
              }
              method={method}
              busy={busy}
              lastMethodId={lastMethodId}
              onLink={(provider) => void link(provider)}
              onUnlink={(identity) => void unlink(identity)}
            />
          ))}
        </ul>
      ) : failure ? null : (
        <Meta>{t.signInMethodsLoading}</Meta>
      )}
      {lastMethodLocked ? <Meta id={lastMethodId}>{t.lastMethod}</Meta> : null}
      {linkReturn?.failure ? <ErrorText failure={linkReturn.failure} /> : null}
      {linkReturn && !linkReturn.failure ? (
        <InfoText>{t.linked(PROVIDER_LOOK[linkReturn.provider].name)}</InfoText>
      ) : null}
      {failure ? <ErrorText failure={failure} /> : null}
    </Panel>
  )
}

function MethodRow({
  method,
  busy,
  lastMethodId,
  onLink,
  onUnlink,
}: {
  method: SignInMethod
  busy: boolean
  lastMethodId: string
  onLink: (provider: OAuthProvider) => void
  onUnlink: (identity: UserIdentity) => void
}) {
  const t = useMessages().family
  const { name, icon: Logo } =
    method.provider === 'email'
      ? { name: t.emailMethod, icon: EnvelopeSimple }
      : PROVIDER_LOOK[method.provider]

  return (
    <li className="flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0 last:pb-0">
      <span className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full bg-accent-soft text-accent">
        <Logo aria-hidden size={18} weight="bold" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{name}</span>
        <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-xs text-muted">
          {method.kind === 'available'
            ? t.notLinked
            : (method.address ?? t.linkedNoEmail)}
        </span>
      </span>
      {method.kind === 'available' ? (
        <Button disabled={busy} onClick={() => onLink(method.provider)}>
          {t.link}
        </Button>
      ) : method.provider === 'email' ? null : (
        <Button
          disabled={busy || !method.unlinkable}
          aria-describedby={method.unlinkable ? undefined : lastMethodId}
          onClick={() => onUnlink(method.identity)}
        >
          {t.unlink}
        </Button>
      )}
    </li>
  )
}
