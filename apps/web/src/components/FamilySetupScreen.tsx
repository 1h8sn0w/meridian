/**
 * Увійшли, але сім'ї ще немає (MER-45). Два шляхи — завести свою або
 * приєднатися за кодом — стоять окремими панелями, а не однією формою з
 * роздільником: це два різні наміри, і людина приходить сюди вже знаючи свій.
 *
 * Третього шляху немає: доки акаунт поза сім'єю, у токені немає `family_id`, а
 * отже, застосунок не бачить жодного рядка.
 */

import { useState } from 'react'
import { useAuth } from '../lib/auth'
import type { Failure } from '../lib/messages'
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
    <AuthShell
      title="Сім’я"
      subtitle={`Ви увійшли як ${email ?? 'невідомий акаунт'}`}
    >
      <Panel title="Створити сім’ю">
        <Hint>
          Раціон, пул страв і список покупок будуть спільні для всіх, кого ви
          сюди запросите.
        </Hint>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run('create')
          }}
        >
          <Field
            label="Назва сім’ї"
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
              {busy === 'create' ? 'Створюємо…' : 'Створити'}
            </Button>
          </div>
        </form>
      </Panel>

      <Panel title="Приєднатися за кодом">
        <Hint>
          Код дає той, хто вже в сім’ї — на своєму екрані сім’ї. Дефіси, пробіли
          й регістр значення не мають.
        </Hint>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run('join')
          }}
        >
          <Field
            label="Код запрошення"
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
              {busy === 'join' ? 'Приєднуємось…' : 'Приєднатися'}
            </Button>
          </div>
        </form>
      </Panel>

      {failure ? <ErrorText failure={failure} /> : null}

      <p className="mt-4 text-center">
        <LinkButton onClick={() => void signOut()}>Вийти</LinkButton>
      </p>
    </AuthShell>
  )
}
