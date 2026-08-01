/**
 * Дрібні спільні елементи екранів входу (MER-45).
 *
 * Не дизайн-система — рівно те, що повторюється на трьох екранах. Токени й
 * шкала — стандартні класи Tailwind із `src/styles.css`; arbitrary values не
 * використовуємо (правило в AGENTS.md).
 */

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react'
import { useId } from 'react'
import type { Failure } from '../lib/messages'

export function Card({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <section className="w-full max-w-md rounded-2xl border border-line bg-surface p-6">
      <h1 className="text-xl font-semibold text-content">{title}</h1>
      {subtitle ? <p className="mt-2 text-sm text-muted">{subtitle}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  )
}

export function Field({
  label,
  hint,
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <label htmlFor={id} className="block">
      <span className="text-sm text-muted">{label}</span>
      <input
        id={id}
        {...input}
        className="mt-1 w-full rounded-xl border border-line bg-app px-3 py-2 text-content outline-none focus:border-accent"
      />
      {hint ? (
        <span className="mt-1 block text-xs text-subtle">{hint}</span>
      ) : null}
    </label>
  )
}

export function Button({
  variant = 'primary',
  children,
  ...button
}: {
  variant?: 'primary' | 'ghost'
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const look =
    variant === 'primary'
      ? 'bg-accent text-button-ink disabled:opacity-50'
      : 'border border-line text-content disabled:opacity-50'
  return (
    <button
      type="button"
      {...button}
      className={`w-full rounded-xl px-4 py-2 text-sm font-medium ${look}`}
    >
      {children}
    </button>
  )
}

/**
 * Помилка показується разом із оригінальним текстом сервера, якщо перекладу
 * для нього немає: краще незрозуміле англійське речення, ніж мовчання.
 */
export function Notice({
  tone,
  failure,
  children,
}: {
  tone: 'error' | 'info'
  failure?: Failure
  children?: ReactNode
}) {
  const look =
    tone === 'error' ? 'border-dinner text-dinner' : 'border-line text-muted'
  return (
    <p
      className={`mt-4 rounded-xl border px-3 py-2 text-sm ${look}`}
      role="status"
    >
      {failure ? failure.text : children}
      {failure?.detail ? (
        <span className="mt-1 block font-mono text-xs text-subtle">
          {failure.detail}
        </span>
      ) : null}
    </p>
  )
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-app p-4">
      {children}
    </main>
  )
}
