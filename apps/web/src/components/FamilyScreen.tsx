import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { formatDate, formatInviteCode } from '../lib/format'
import type { Failure } from '../lib/messages'
import { LOCALES, LOCALE_NAMES, setLocale } from '../lib/i18n/locale'
import type { Locale } from '../lib/i18n/locale'
import { useLocale, useMessages } from '../lib/i18n/use-messages'
import { AppShell } from './AppShell'
import {
  Avatar,
  Button,
  ErrorText,
  Hint,
  LinkButton,
  Meta,
  Panel,
  SelectField,
  Tag,
} from './ui'
import { SyncPanel } from './SyncPanel'
import { ImportV1Panel } from './ImportV1Panel'

export function FamilyScreen() {
  const { userId, family, members, invite, createInvite, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const messages = useMessages()
  const t = messages.family

  const requestInvite = async () => {
    setBusy(true)
    setFailure(null)
    const result = await createInvite()
    if (!result.ok) setFailure(result.failure)
    setBusy(false)
  }

  return (
    <AppShell
      title={family?.name ?? messages.titles.family}
      subtitle={t.subtitle}
    >
      <Panel title={t.members}>
        <ul className="m-0 list-none p-0">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0 last:pb-0"
            >
              <Avatar letter={(member.email?.[0] ?? '?').toUpperCase()} />
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                {member.email ?? t.noEmail}
              </span>
              {member.userId === userId ? <Tag>{t.you}</Tag> : null}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title={t.invite}>
        {invite ? (
          <>
            <div className="rounded-2xl bg-accent-soft px-3 py-3 text-center">
              <div className="font-mono text-xl font-semibold tracking-widest text-accent">
                {formatInviteCode(invite.code)}
              </div>
            </div>
            <p className="mb-3 mt-2 text-xs leading-normal text-muted">
              {t.inviteHint(formatDate(invite.expiresAt))}
            </p>
          </>
        ) : (
          <Hint>{t.noInvite}</Hint>
        )}
        <Button
          block
          variant={invite ? 'default' : 'primary'}
          disabled={busy}
          onClick={() => void requestInvite()}
        >
          {busy ? t.preparing : invite ? t.newCode : t.createCode}
        </Button>
        {failure ? <ErrorText failure={failure} /> : null}
      </Panel>

      <LanguagePanel />

      <SyncPanel />

      <ImportV1Panel />

      <p className="mt-4 text-center">
        <LinkButton onClick={() => void signOut()}>
          {messages.auth.signOut}
        </LinkButton>
      </p>
    </AppShell>
  )
}

function LanguagePanel() {
  const locale = useLocale()
  const t = useMessages().family
  return (
    <Panel title={t.language}>
      <SelectField
        label={t.languageLabel}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        {LOCALES.map((option) => (
          <option key={option} value={option} lang={option}>
            {LOCALE_NAMES[option]}
          </option>
        ))}
      </SelectField>
      <Meta>{t.languageHint}</Meta>
    </Panel>
  )
}
