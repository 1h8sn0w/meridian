/**
 * Вхід і реєстрація (MER-45). Пошта й пароль — більше GoTrue у self-host без
 * SMTP і без зовнішніх провайдерів нічого й не вміє.
 */

import { useState } from 'react'
import { useAuth } from '../lib/auth'
import type { Failure } from '../lib/messages'
import { Button, Card, Field, Notice, Screen } from './ui'

type Mode = 'sign-in' | 'sign-up'

export function AuthScreen() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [confirmSent, setConfirmSent] = useState(false)

  const submit = async () => {
    setBusy(true)
    setFailure(null)
    setConfirmSent(false)
    const result =
      mode === 'sign-in'
        ? await signIn(email.trim(), password)
        : await signUp(email.trim(), password)
    if (!result.ok) setFailure(result.failure)
    // Реєстрація без сесії означає, що GoTrue чекає підтвердження пошти.
    else if (mode === 'sign-up' && result.value === false) setConfirmSent(true)
    setBusy(false)
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setFailure(null)
    setConfirmSent(false)
  }

  return (
    <Screen>
      <Card
        title="Meridian"
        subtitle="Планувальник харчування для сім’ї. Увійдіть, щоб бачити спільний раціон."
      >
        <div className="mb-6 flex gap-2 rounded-xl border border-line p-1">
          <TabButton
            active={mode === 'sign-in'}
            onClick={() => switchMode('sign-in')}
          >
            Вхід
          </TabButton>
          <TabButton
            active={mode === 'sign-up'}
            onClick={() => switchMode('sign-up')}
          >
            Реєстрація
          </TabButton>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <Field
            label="Пошта"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Field
            label="Пароль"
            type="password"
            autoComplete={
              mode === 'sign-in' ? 'current-password' : 'new-password'
            }
            required
            minLength={6}
            hint={mode === 'sign-up' ? 'Мінімум 6 символів.' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={busy}>
            {busy
              ? 'Хвилинку…'
              : mode === 'sign-in'
                ? 'Увійти'
                : 'Зареєструватися'}
          </Button>
        </form>

        {failure ? <Notice tone="error" failure={failure} /> : null}
        {confirmSent ? (
          <Notice tone="info">
            Акаунт створено. На пошту {email.trim()} надіслано лист із
            підтвердженням — відкрийте його й поверніться сюди, щоб увійти.
          </Notice>
        ) : null}
      </Card>
    </Screen>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-lg px-3 py-2 text-sm ${
        active ? 'bg-segment text-content' : 'text-muted'
      }`}
    >
      {children}
    </button>
  )
}
