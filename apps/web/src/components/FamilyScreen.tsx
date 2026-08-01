/**
 * Сім'я зібрана (MER-45): хто в ній і як покликати другого.
 *
 * Це не головний екран застосунку — «Сьогодні», «Тиждень» і «Страви» на нових
 * даних робить MER-49. Тут рівно те, що доводить готовність цієї задачі: двоє
 * акаунтів в одній сім'ї й жива сесія.
 */

import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { formatDate, formatInviteCode } from '../lib/messages'
import type { Failure } from '../lib/messages'
import { Button, Card, Notice, Screen } from './ui'

export function FamilyScreen() {
  const { email, family, members, invite, createInvite, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  const invited = async () => {
    setBusy(true)
    setFailure(null)
    const result = await createInvite()
    if (!result.ok) setFailure(result.failure)
    setBusy(false)
  }

  return (
    <Screen>
      <Card
        title={family?.name ?? 'Сім’я'}
        subtitle="Страви, тижневий план і список покупок спільні для всіх, хто тут."
      >
        <h2 className="text-sm text-muted">У сім’ї</h2>
        <ul className="mt-2 flex flex-col gap-2">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-sm"
            >
              {/* Пошти може не бути: у токені її не завжди видно, і вигадувати
                  підпис нема з чого. */}
              <span className="text-content">
                {member.email ?? 'акаунт без пошти'}
              </span>
              {member.email === email ? (
                <span className="text-xs text-subtle">це ви</span>
              ) : null}
            </li>
          ))}
        </ul>

        <h2 className="mt-6 text-sm text-muted">Запросити</h2>
        {invite ? (
          <div className="mt-2 rounded-xl border border-line px-3 py-3">
            <p className="font-mono text-lg tracking-widest text-content">
              {formatInviteCode(invite.code)}
            </p>
            <p className="mt-1 text-xs text-subtle">
              {/* Формат uk-UA сам дає «9 серпня 2026 р.» — крапка вже своя. */}
              Одноразовий, дійсний до {formatDate(invite.expiresAt)} Продиктуйте
              його тому, кого запрошуєте — він введе код після реєстрації.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-subtle">
            Активного коду немає. Створіть — і передайте другому члену сім’ї.
          </p>
        )}
        <div className="mt-3">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void invited()}
          >
            {busy ? 'Готуємо код…' : invite ? 'Новий код' : 'Створити код'}
          </Button>
        </div>

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
