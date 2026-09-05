/**
 * Спільні елементи інтерфейсу (MER-45, MER-49).
 *
 * Не нова дизайн-система: класи взяті з `UI_CLASSES` у V1 (`index.html`), щоб
 * V2 виглядав тим самим застосунком. Звідти ж і дрібниці, які легко зробити
 * «по-своєму» й розійтися: панель — `rounded-xl border-line bg-surface`, поле —
 * `rounded-lg` з `scheme-dark`, помилка — `text-warning` (не червоний із палітри
 * страв), заголовок секції — `text-xs uppercase tracking-wider`.
 *
 * Arbitrary values не використовуємо — правило в AGENTS.md.
 */

import { useEffect, useId, useRef } from 'react'
import type {
  ButtonHTMLAttributes,
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
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

/**
 * `pav` із V1 — кружечок-аватар з літерою.
 *
 * Колір профілю приходить рантаймом, тож підставляється через CSS-змінні, а не
 * arbitrary value в класі: токени `--color-profile` / `--color-profile-soft`
 * оголошені в `@theme inline` саме для цього (правило значень у AGENTS.md).
 *
 * Прозорий фон рахує `color-mix` із того самого `--profile-color` (MER-71).
 * Без кольору аватар лишається на акценті — а це інша частка (12%, не 18%),
 * тому фон береться іншим токеном, а не тим самим із запасним значенням.
 */
export function Avatar({ letter, color }: { letter: string; color?: string }) {
  return (
    <span
      style={
        color ? ({ '--profile-color': color } as CSSProperties) : undefined
      }
      className={`inline-flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-semibold text-profile ${
        color ? 'bg-profile-soft' : 'bg-accent-soft'
      }`}
    >
      {letter}
    </span>
  )
}

/** `tag` із V1 разом із модифікаторами `accent` і `warn`. */
export function Tag({
  tone = 'default',
  children,
}: {
  tone?: 'default' | 'accent' | 'warn'
  children: ReactNode
}) {
  const look =
    tone === 'accent'
      ? 'border-accent text-accent'
      : tone === 'warn'
        ? 'border-warning text-warning'
        : 'border-line text-muted'
  return (
    <span
      className={`inline-block rounded-full border px-2 py-px text-xs ${look}`}
    >
      {children}
    </span>
  )
}

/** `chip` із V1 — фільтр списку страв. */
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
      className={`cursor-pointer rounded-full border bg-transparent px-3 py-1.5 text-xs ${
        active ? 'border-accent text-accent' : 'border-line text-muted'
      }`}
    >
      {children}
    </button>
  )
}

/** `empty` із V1 — порожній список. */
export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-5 text-center text-sm text-muted">{children}</div>
}

/** `week-warn` із V1: чесне попередження, а не помилка. */
export function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="mb-0 mt-2 text-sm leading-normal text-warning">{children}</p>
  )
}

/** `week-meta` із V1 — довідковий рядок під кнопками. */
export function Meta({ children }: { children: ReactNode }) {
  return (
    <p className="mb-0 mt-2 text-xs leading-normal text-muted">{children}</p>
  )
}

/** `recipe-sec` із V1 — заголовок секції всередині картки. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 mt-3 text-xs uppercase tracking-wider text-muted">
      {children}
    </p>
  )
}

/** Багаторядкове поле — той самий вигляд, що й `Field`. */
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
    <div className="mb-2.5">
      <label htmlFor={id} className="block text-sm text-muted">
        {label}
      </label>
      <textarea
        id={id}
        {...textarea}
        className="mt-1 block w-full resize-y rounded-lg border border-line bg-app px-2.5 py-2 text-base text-content scheme-dark"
      />
      {hint ? <p className="mb-0 mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  )
}

/** Селект — той самий вигляд, що й `Field`. */
export function SelectField({
  label,
  children,
  ...select
}: { label: string } & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId()
  return (
    <div className="mb-2.5">
      <label htmlFor={id} className="block text-sm text-muted">
        {label}
      </label>
      <select
        id={id}
        {...select}
        className="mt-1 block w-full rounded-lg border border-line bg-app px-2.5 py-2 text-base text-content scheme-dark"
      >
        {children}
      </select>
    </div>
  )
}

/**
 * Модальний аркуш — `overlay` + `sheet` із V1.
 *
 * MER-41 залишив тут три вимоги, і кожна з них — про клавіатуру, а не про
 * красу: Escape закриває, Tab не виходить за межі діалогу, після закриття фокус
 * повертається на кнопку, що його відкрила. Без цього діалог для клавіатури —
 * пастка.
 *
 * Усі три дає нативний `<dialog>` із `showModal()` (MER-71): пастка фокуса,
 * `cancel` на Escape, повернення фокуса на `close()` і фонова сторінка як
 * inert — тобто до неї не дотягтись ні Tab'ом, ні мишею.
 *
 * Сам `<dialog>` тут — це шар оверлея (звідси `fixed inset-0` і скидання
 * стилів UA, аж до `text-content`: UA-таблиця задає діалогу власний колір
 * тексту), а картка лежить усередині: клік по елементу діалогу — це клік повз
 * картку, тобто закриття. Колір оверлея лишається на самому елементі, а не на
 * `::backdrop`, щоб не залежати від того, чи успадковує псевдоелемент змінні
 * теми. `z-index` не потрібен: модальний діалог і так у top layer.
 */
export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const sheet = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    sheet.current?.showModal()
  }, [])

  // Спершу `close()`, потім `onClose()`. Фокус на кнопку-відкривач повертає
  // саме `close()`, і тільки поки елемент у документі: батько знімає аркуш із
  // дерева, а видалення з DOM забирає діалог із top layer мовчки, без фокуса.
  const close = () => {
    sheet.current?.close()
    onClose()
  }

  return (
    <dialog
      ref={sheet}
      aria-label={title}
      onCancel={(event) => {
        // Escape закрив би діалог сам, але тоді `onClose` дізнався б про це
        // після; закриваємо своїм шляхом, щоб він був один.
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      className="fixed inset-0 m-0 h-full max-h-full w-full max-w-full items-end justify-center border-0 bg-overlay p-0 text-content open:flex dialog:items-center"
    >
      <div className="m-2.5 max-h-3/4 w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-surface px-4 py-3.5">
        <div className="mb-1.5 flex items-baseline justify-between gap-2.5">
          <h2 className="m-0 text-base font-bold">{title}</h2>
          <LinkButton onClick={close}>Закрити</LinkButton>
        </div>
        {children}
      </div>
    </dialog>
  )
}
