/**
 * Сім'я (MER-45): хто в ній, як покликати другого і в якому стані синхронізація.
 *
 * Четверта вкладка застосунку. Раціон живе на трьох інших екранах, тут — усе
 * про доступ: склад сім'ї, одноразовий код запрошення й вихід. Панель
 * синхронізації теж тут, а не на головній: користувач іде дивитися на неї
 * свідомо, коли щось не сходиться між пристроями.
 */

import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { formatDate, formatInviteCode } from '../lib/messages'
import type { Failure } from '../lib/messages'
import { AppShell } from './AppShell'
import { Avatar, Button, ErrorText, Hint, LinkButton, Panel, Tag } from './ui'
import { SyncPanel } from './SyncPanel'

export function FamilyScreen() {
  const { userId, family, members, invite, createInvite, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)

  const requestInvite = async () => {
    setBusy(true)
    setFailure(null)
    const result = await createInvite()
    if (!result.ok) setFailure(result.failure)
    setBusy(false)
  }

  return (
    <AppShell
      title={family?.name ?? 'Сім’я'}
      subtitle="Страви, тижневий план і список покупок — спільні"
    >
      <Panel title="У сім’ї">
        <ul className="m-0 list-none p-0">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-2.5 border-b border-line py-2.5 last:border-b-0 last:pb-0"
            >
              {/* Літера з пошти — як аватар профілю у V1. Пошти може не бути:
                  у токені вона не завжди є, і вигадувати підпис нема з чого. */}
              <Avatar letter={(member.email?.[0] ?? '?').toUpperCase()} />
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                {member.email ?? 'акаунт без пошти'}
              </span>
              {member.userId === userId ? <Tag>це ви</Tag> : null}
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Запросити">
        {invite ? (
          <>
            <div className="rounded-xl bg-accent-soft px-3 py-3 text-center">
              <div className="font-mono text-xl font-semibold tracking-widest text-accent">
                {formatInviteCode(invite.code)}
              </div>
            </div>
            <p className="mb-3 mt-2 text-xs leading-normal text-muted">
              Одноразовий, дійсний до {formatDate(invite.expiresAt)} Продиктуйте
              його тому, кого запрошуєте — він введе код після реєстрації.
            </p>
          </>
        ) : (
          <Hint>
            Активного коду немає. Створіть — і передайте другому члену сім’ї.
          </Hint>
        )}
        <Button
          block
          variant={invite ? 'default' : 'primary'}
          disabled={busy}
          onClick={() => void requestInvite()}
        >
          {busy ? 'Готуємо код…' : invite ? 'Новий код' : 'Створити код'}
        </Button>
        {failure ? <ErrorText failure={failure} /> : null}
      </Panel>

      <SyncPanel />

      <p className="mt-4 text-center">
        <LinkButton onClick={() => void signOut()}>Вийти</LinkButton>
      </p>
    </AppShell>
  )
}
