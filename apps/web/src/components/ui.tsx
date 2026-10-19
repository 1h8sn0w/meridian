import { useEffect, useId, useRef } from 'react'
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { WarningCircle, X } from '@phosphor-icons/react'
import type { Failure } from '../lib/messages'
import { useMessages } from '../lib/i18n/use-messages'

export function ScreenHeader({
  title,
  subtitle,
}: {
  title: string
  subtitle?: string
}) {
  return (
    <header className="header-glass sticky top-0 z-10 px-5 pb-3 pt-6">
      <div className="mx-auto max-w-screen-sm">
        <h1 className="m-0 text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mb-0 mt-1 text-sm text-muted">{subtitle}</p>
        ) : null}
      </div>
    </header>
  )
}

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
      <ScreenHeader title={title} subtitle={subtitle} />
      <main className="stagger mx-auto max-w-screen-sm px-4 pb-10 pt-4">
        {children}
      </main>
    </>
  )
}

export function Panel({
  title,
  children,
}: {
  title?: string
  children: ReactNode
}) {
  return (
    <section className="glass mb-4 rounded-3xl px-5 py-4">
      {title ? (
        <h2 className="mb-2 mt-0 text-lg font-semibold tracking-tight">
          {title}
        </h2>
      ) : null}
      {children}
    </section>
  )
}

export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mb-3 text-sm leading-relaxed text-muted">{children}</p>
  )
}

const FIELD_LOOK =
  'mt-1.5 block w-full rounded-2xl border border-line bg-app px-3.5 py-2.5 text-base text-content transition-colors duration-200 focus:border-accent'

export function Field({
  label,
  hint,
  className = '',
  ...input
}: { label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId()
  return (
    <div className="mb-3">
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label}
      </label>
      <input id={id} {...input} className={`${FIELD_LOOK} ${className}`} />
      {hint ? <p className="mb-0 mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

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
      ? 'border-transparent bg-accent-fill font-semibold text-button-ink shadow-accent'
      : 'border-line bg-surface-strong font-medium text-content'
  return (
    <button
      type="button"
      {...button}
      className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm transition-transform duration-300 ease-spring hover:-translate-y-px active:translate-y-0 active:scale-97 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 ${look} ${block ? 'w-full' : ''}`}
    >
      {children}
    </button>
  )
}

export function LinkButton({
  children,
  ...button
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...button}
      className="cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-accent underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
    >
      {children}
    </button>
  )
}

export function ErrorText({ failure }: { failure: Failure }) {
  return (
    <div
      className="mt-3 flex gap-2.5 rounded-2xl bg-warning-soft px-3.5 py-2.5 text-sm text-warning motion-safe:animate-rise"
      role="alert"
    >
      <WarningCircle aria-hidden size={18} className="mt-px flex-none" />
      <p className="m-0">
        {failure.text}
        {failure.detail ? (
          <span className="mt-1 block whitespace-pre-line font-mono text-xs text-subtle">
            {failure.detail}
          </span>
        ) : null}
      </p>
    </div>
  )
}

export function InfoText({ children }: { children: ReactNode }) {
  return (
    <p
      className="mb-0 mt-3 rounded-2xl border border-line bg-app px-3.5 py-2.5 text-sm leading-relaxed text-muted"
      role="status"
    >
      {children}
    </p>
  )
}

export function Avatar({ letter, color }: { letter: string; color?: string }) {
  return (
    <span
      style={
        color ? ({ '--profile-color': color } as CSSProperties) : undefined
      }
      className={`inline-flex h-8 w-8 flex-none items-center justify-center rounded-full text-sm font-semibold text-profile ${
        color ? 'bg-profile-soft' : 'bg-accent-soft'
      }`}
    >
      {letter}
    </span>
  )
}

export function Tag({
  tone = 'default',
  children,
}: {
  tone?: 'default' | 'accent' | 'warn'
  children: ReactNode
}) {
  const look =
    tone === 'accent'
      ? 'bg-accent-soft text-accent'
      : tone === 'warn'
        ? 'bg-warning-soft text-warning'
        : 'bg-app text-muted'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 align-middle text-xs font-medium ${look}`}
    >
      {children}
    </span>
  )
}

export function Chip({
  active = false,
  children,
  ...button
}: { active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...button}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition duration-300 ease-spring active:scale-95 ${
        active
          ? 'border-transparent bg-accent-fill text-button-ink shadow-accent'
          : 'border-line bg-app text-muted hover:text-content'
      }`}
    >
      {children}
    </button>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm leading-relaxed text-muted">
      {children}
    </div>
  )
}

export function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="mb-0 mt-2 flex gap-2 rounded-2xl bg-warning-soft px-3.5 py-2.5 text-sm leading-normal text-warning">
      <WarningCircle aria-hidden size={18} className="mt-px flex-none" />
      <span>{children}</span>
    </p>
  )
}

export function Problems({ of }: { of: ReadonlyArray<ReadonlyArray<string>> }) {
  return (
    <>
      {[...new Set(of.flat())].map((problem) => (
        <Warn key={problem}>{problem}</Warn>
      ))}
    </>
  )
}

export function Meta({ children }: { children: ReactNode }) {
  return (
    <p className="mb-0 mt-2 text-xs leading-relaxed text-muted">{children}</p>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 mt-4 text-sm font-semibold text-content">{children}</p>
  )
}

export function TextField({
  label,
  hint,
  ...textarea
}: {
  label: string
  hint?: string
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId()
  return (
    <div className="mb-3">
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label}
      </label>
      <textarea id={id} {...textarea} className={`${FIELD_LOOK} resize-y`} />
      {hint ? <p className="mb-0 mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

export function SelectField({
  label,
  children,
  ...select
}: { label: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <div className="mb-3">
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label}
      </label>
      <select id={id} {...select} className={FIELD_LOOK}>
        {children}
      </select>
    </div>
  )
}

export function IconButton({
  label,
  children,
  ...button
}: { label: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...button}
      className="inline-flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-full border border-line bg-app p-0 text-muted transition duration-300 ease-spring hover:text-content active:scale-90"
    >
      {children}
    </button>
  )
}

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode | ((close: () => void) => ReactNode)
}) {
  const sheet = useRef<HTMLDialogElement>(null)
  const t = useMessages()

  useEffect(() => {
    sheet.current?.showModal()
  }, [])

  const close = () => {
    sheet.current?.close()
    onClose()
  }

  return (
    <dialog
      ref={sheet}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      className="fixed inset-0 m-0 h-full max-h-full w-full max-w-full items-end justify-center border-0 bg-overlay p-0 text-content backdrop-blur-sm open:flex motion-safe:animate-fade dialog:items-center"
    >
      <div className="glass m-2.5 max-h-3/4 w-full max-w-xl overflow-y-auto rounded-3xl px-5 py-4 motion-safe:animate-sheet">
        <div className="mb-2 flex items-center justify-between gap-2.5">
          <h2 className="m-0 text-lg font-semibold tracking-tight">{title}</h2>
          <IconButton label={t.common.close} onClick={close}>
            <X size={16} weight="bold" />
          </IconButton>
        </div>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </dialog>
  )
}
