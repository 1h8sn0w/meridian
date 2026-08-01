/**
 * Спільні елементи екранів входу (MER-45).
 *
 * Не нова дизайн-система: класи взяті з `UI_CLASSES` у V1 (`index.html`), щоб
 * вхід виглядав тим самим застосунком, у який веде. Звідти ж і дрібниці, які
 * легко зробити «по-своєму» й розійтися: панель — `rounded-xl border-line
 * bg-surface`, поле — `rounded-lg` з `scheme-dark`, помилка — `text-warning`
 * (не червоний із палітри страв), заголовок секції — `text-xs uppercase
 * tracking-wider`.
 *
 * Arbitrary values не використовуємо — правило в AGENTS.md.
 */

import { useId } from 'react'
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
} from 'react'
import type { Failure } from '../lib/messages'

/**
 * Каркас екранів входу — той самий, що в застосунку: липка шапка з назвою
 * екрана й підписом, вміст у колонці `max-w-screen-sm`. Нижнього таб-бару тут
 * немає, тож і відступу під нього теж.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children?: ReactNode
}) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-app px-4 pb-3 pt-5">
        <h1 className="m-0 text-xl">{title}</h1>
        {subtitle ? (
          <p className="mb-0 mt-1 text-sm text-muted">{subtitle}</p>
        ) : null}
      </header>
      <main className="mx-auto max-w-screen-sm px-4 pb-10 pt-4">
        {children}
      </main>
    </>
  )
}

/** `panel` із V1. */
export function Panel({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <section className="mb-3.5 rounded-xl border border-line bg-surface px-4 py-3.5">
      {title ? (
        <h2 className="mb-2 mt-0 text-base font-bold">{title}</h2>
      ) : null}
      {children}
    </section>
  )
}

/** `hint` із V1. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mb-3 text-sm leading-normal text-muted">{children}</p>
  )
}

/**
 * Поле форми у стилі `profile-form` із V1. Нативний фокус свідомо не
 * прибираємо: Preflight вимкнено, тож обведення браузера — єдине, що показує
 * фокус із клавіатури.
 */
export function Field({
  label,
  hint,
  className = '',
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className="mb-2.5">
      <label htmlFor={id} className="block text-sm text-muted">
        {label}
      </label>
      <input
        id={id}
        {...input}
        className={`mt-1 block w-full rounded-lg border border-line bg-app px-2.5 py-2 text-base text-content scheme-dark ${className}`}
      />
      {hint ? <p className="mb-0 mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

/** `btn` із V1 разом із модифікаторами `primary` і `block`. */
export function Button({
  variant = 'default',
  block = false,
  children,
  ...button
}: {
  variant?: 'default' | 'primary'
  block?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const look =
    variant === 'primary'
      ? 'border-accent bg-accent font-semibold text-button-ink'
      : 'border-line bg-transparent text-content'
  return (
    <button
      type="button"
      {...button}
      className={`cursor-pointer rounded-xl border px-3.5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${look} ${block ? 'w-full' : ''}`}
    >
      {children}
    </button>
  )
}

/** Текстова дія без рамки — для «Вийти» й перемикання вхід/реєстрація. */
export function LinkButton({
  children,
  ...button
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...button}
      className="cursor-pointer border-0 bg-transparent p-0 text-sm text-accent"
    >
      {children}
    </button>
  )
}

/**
 * `form-error` із V1. Оригінальний текст сервера показуємо поруч, коли для
 * нього немає перекладу: краще незрозуміле англійське речення, ніж мовчання —
 * саме воно допоможе тому, хто піднімає self-host.
 */
export function ErrorText({ failure }: { failure: Failure }) {
  return (
    <p className="mb-0 mt-3 text-sm text-warning" role="alert">
      {failure.text}
      {failure.detail ? (
        <span className="mt-1 block font-mono text-xs text-subtle">
          {failure.detail}
        </span>
      ) : null}
    </p>
  )
}

/** Спокійне повідомлення — тон `hint`, рамка як у `tag`. */
export function InfoText({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-0 mt-3 rounded-lg border border-line px-3 py-2 text-sm leading-normal text-muted"
      role="status"
    >
      {children}
    </p>
  )
}

/** `pav` із V1 — кружечок-аватар з літерою. */
export function Avatar({ letter }: { letter: string }) {
  return (
    <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
      {letter}
    </span>
  )
}

/** `tag` із V1. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full border border-line px-2 py-px text-xs text-muted">
      {children}
    </span>
  )
}
