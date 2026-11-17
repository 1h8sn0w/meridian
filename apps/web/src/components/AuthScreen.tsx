import { useState } from 'react'
import { useAuth, useRedirectFailure } from '../lib/auth'
import type { OAuthProvider } from '../lib/oauth'
import { minutesOf, useNow } from '../lib/use-now'
import type { Failure } from '../lib/messages'
import { useMessages } from '../lib/i18n/use-messages'
import { DayClock } from './DayClock'
import { PROVIDER_LOOK } from './SignInMethods'
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
  const { signIn, signUp, signInWith, providers } = useAuth()
  const redirectFailure = useRedirectFailure()
  const messages = useMessages()
  const t = messages.auth
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [confirmSent, setConfirmSent] = useState('')
  const [attempted, setAttempted] = useState(false)
  const minutes = minutesOf(useNow())
  const shownFailure = failure ?? (attempted ? null : redirectFailure)

  const submit = async () => {
    setBusy(true)
    setAttempted(true)
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

  const continueWith = async (provider: OAuthProvider) => {
    setBusy(true)
    setAttempted(true)
    setFailure(null)
    setConfirmSent('')
    const result = await signInWith(provider)
    if (!result.ok) setFailure(result.failure)
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
                ? messages.gate.loading
                : mode === 'sign-in'
                  ? t.submitSignIn
                  : t.submitSignUp}
            </Button>
          </div>
        </form>

        {providers.length > 0 ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="m-0 mb-3 text-center text-sm text-muted">
              {t.orContinueWith}
            </p>
            <div className="grid gap-2">
              {providers.map((provider) => {
                const { name, icon: Logo } = PROVIDER_LOOK[provider]
                return (
                  <Button
                    key={provider}
                    block
                    disabled={busy}
                    onClick={() => void continueWith(provider)}
                  >
                    <Logo aria-hidden size={18} weight="bold" />
                    {t.continueWith(name)}
                  </Button>
                )
              })}
            </div>
          </div>
        ) : null}

        {shownFailure ? <ErrorText failure={shownFailure} /> : null}
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
