import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { minutesOf, useNow } from '../lib/use-now'
import type { Failure } from '../lib/messages'
import { useMessages } from '../lib/i18n/use-messages'
import { DayClock } from './DayClock'
import {
  AuthShell,
  Button,
  ErrorText,
  Field,
  Hint,
  InfoText,
  LinkButton,
  Panel,
} from './ui'

type Mode = 'sign-in' | 'sign-up'

export function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const t = useMessages().auth
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [confirmSent, setConfirmSent] = useState('')
  const minutes = minutesOf(useNow())

  const submit = async () => {
    setBusy(true)
    setFailure(null)
    setConfirmSent('')
    const address = email.trim()
    const result =
      mode === 'sign-in'
        ? await signIn(address, password)
        : await signUp(address, password)
    if (!result.ok) setFailure(result.failure)
    else if (mode === 'sign-up' && result.value === false)
      setConfirmSent(address)
    setBusy(false)
  }

  const switchMode = () => {
    setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')
    setFailure(null)
    setConfirmSent('')
  }

  return (
    <AuthShell title="Meridian" subtitle={t.tagline}>
      <div className="mb-4 mt-2">
        <DayClock minutes={minutes} />
      </div>

      <Panel title={mode === 'sign-in' ? t.signIn : t.signUp}>
        <Hint>{mode === 'sign-in' ? t.signInHint : t.signUpHint}</Hint>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field
            label={t.email}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label={t.password}
            type="password"
            autoComplete={
              mode === 'sign-in' ? 'current-password' : 'new-password'
            }
            required
            minLength={6}
            hint={mode === 'sign-up' ? t.passwordHint : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="mt-3.5">
            <Button type="submit" variant="primary" block disabled={busy}>
              {busy
                ? t.busy
                : mode === 'sign-in'
                  ? t.submitSignIn
                  : t.submitSignUp}
            </Button>
          </div>
        </form>

        {failure ? <ErrorText failure={failure} /> : null}
        {confirmSent ? <InfoText>{t.confirmSent(confirmSent)}</InfoText> : null}
      </Panel>

      <p className="m-0 text-center text-sm text-muted">
        {mode === 'sign-in' ? t.noAccount : t.haveAccount}
        <LinkButton onClick={switchMode}>
          {mode === 'sign-in' ? t.submitSignUp : t.submitSignIn}
        </LinkButton>
      </p>
    </AuthShell>
  )
}
