/**
 * Увійшли, але сім'ї ще немає (MER-45). Два шляхи: завести свою або приєднатися
 * до чужої за кодом. Третього немає — доки акаунт поза сім'єю, у токені немає
 * `family_id`, а отже, застосунок не бачить жодного рядка.
 */

import { useState } from 'react'
import { useAuth } from '../lib/auth'
import type { Failure } from '../lib/messages'
import { Button, Card, Field, Notice, Screen } from './ui'

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
    <Screen>
      <Card
        title="Оберіть сім’ю"
        subtitle={`Ви увійшли як ${email ?? 'невідомий акаунт'}. Раціон, страви й список покупок спільні для всієї сім’ї.`}
      >
        <form
          className="flex flex-col gap-4"
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
          <Button type="submit" disabled={busy !== null}>
            {busy === 'create' ? 'Створюємо…' : 'Створити сім’ю'}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-xs text-subtle">
          <span className="h-px flex-1 bg-line" />
          або
          <span className="h-px flex-1 bg-line" />
        </div>

        <form
          className="flex flex-col gap-4"
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
            hint="Код дає той, хто вже в сім’ї. Дефіси й регістр значення не мають."
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button type="submit" variant="ghost" disabled={busy !== null}>
            {busy === 'join' ? 'Приєднуємось…' : 'Приєднатися за кодом'}
          </Button>
        </form>

        {failure ? <Notice tone="error" failure={failure} /> : null}

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-6 w-full text-sm text-subtle"
        >
          Вийти
        </button>
      </Card>
    </Screen>
  )
}
