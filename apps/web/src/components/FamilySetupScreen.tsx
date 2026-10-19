import { useState } from 'react'
import { useAuth } from '../lib/auth'
import type { Failure } from '../lib/messages'
import { useMessages } from '../lib/i18n/use-messages'
import {
  AuthShell,
  Button,
  ErrorText,
  Field,
  Hint,
  LinkButton,
  Panel,
} from './ui'

export function FamilySetupScreen() {
  const { email, createFamily, joinFamily, signOut } = useAuth()
  const messages = useMessages()
  const t = messages.familySetup
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState<'create' | 'join' | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)

  const run = async (which: 'create' | 'join') => {
    setBusy(which)
    setFailure(null)
    const result =
      which === 'create'
        ? await createFamily(name.trim())
        : await joinFamily(code)
    if (!result.ok) setFailure(result.failure)
    setBusy(null)
  }

  return (
    <AuthShell title={messages.titles.family} subtitle={t.signedInAs(email)}>
      <Panel title={t.create}>
        <Hint>{t.createHint}</Hint>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run('create')
          }}
        >
          <Field
            label={t.name}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="mt-3.5">
            <Button
              type="submit"
              variant="primary"
              block
              disabled={busy !== null}
            >
              {busy === 'create' ? t.creating : t.submitCreate}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title={t.join}>
        <Hint>{t.joinHint}</Hint>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run('join')
          }}
        >
          <Field
            label={t.code}
            placeholder="A1B2-C3D4-E5F6"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono uppercase tracking-widest"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="mt-3.5">
            <Button type="submit" block disabled={busy !== null}>
              {busy === 'join' ? t.joining : t.submitJoin}
            </Button>
          </div>
        </form>
      </Panel>

      {failure ? <ErrorText failure={failure} /> : null}

      <p className="mt-4 text-center">
        <LinkButton onClick={() => void signOut()}>
          {messages.auth.signOut}
        </LinkButton>
      </p>
    </AuthShell>
  )
}
