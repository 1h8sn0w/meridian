/**
 * Спільні елементи інтерфейсу (MER-45, MER-49).
 *
 * Дизайн «Сонячна дуга» (styles.css). Форми мають одну шкалу заокруглень, і її
 * легко розхитати «по-своєму», тож правило записане тут:
 * - скляні картки й аркуші — `rounded-3xl` (утиліта `glass`);
 * - поля, плитки й рядки всередині картки — `rounded-2xl`;
 * - усе, що натискається (кнопки, чипи, позначки, іконки-дії), — `rounded-full`.
 * Помилка — `text-warning` (не червоний із палітри страв).
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
import { WarningCircle, X } from '@phosphor-icons/react'
import type { Failure } from '../lib/messages'

/**
 * Липка шапка екрана — одна на обидва каркаси: `AuthShell` тут і `AppShell`
 * у застосунку. Розмітка стояла двічі, і будь-яка правка відступу лишала шов
 * рівно на переході «увійшли».
 *
 * Над небом шапка прозора, скло набирає лише тоді, коли під неї заїхав вміст
 * (`header-glass` у styles.css).
 */
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
      <ScreenHeader title={title} subtitle={subtitle} />
      <main className="stagger mx-auto max-w-screen-sm px-4 pb-10 pt-4">
        {children}
      </main>
    </>
  )
}

/** Скляна картка — основна поверхня екранів. */
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

/** Пояснення під заголовком. */
export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 mb-3 text-sm leading-relaxed text-muted">{children}</p>
  )
}

const FIELD_LOOK =
  'mt-1.5 block w-full rounded-2xl border border-line bg-app px-3.5 py-2.5 text-base text-content transition-colors duration-200 focus:border-accent'

/**
 * Поле форми. Нативний фокус свідомо не прибираємо: Preflight вимкнено, тож
 * обведення браузера — єдине, що показує фокус із клавіатури. Рамка в колір
 * профілю — лише підсилення поверх нього.
 */
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

/**
 * Кнопка. Натискання відчутне: на hover вона трохи підіймається, на натиск —
 * просідає пружиною. Основна — у колір профілю з темним текстом (усі кольори
 * палітри профілів світлі, тож контраст тримається на кожному).
 */
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

/** Текстова дія без рамки — для «Вийти» й перемикання вхід/реєстрація. */
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

/**
 * Помилка. Оригінальний текст сервера показуємо поруч, коли для нього немає
 * перекладу: краще незрозуміле англійське речення, ніж мовчання — саме воно
 * допоможе тому, хто піднімає self-host.
 */
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

/** Спокійне повідомлення. */
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

/**
 * Кружечок-аватар з літерою.
 *
 * Колір профілю приходить рантаймом, тож підставляється через CSS-змінні, а не
 * arbitrary value в класі: токени `--color-profile` / `--color-profile-soft`
 * оголошені в `@theme inline` саме для цього (правило значень у AGENTS.md).
 *
 * Прозорий фон рахує `color-mix` із того самого `--profile-color` (MER-71).
 * Без кольору аватар лишається на акценті.
 */
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

/** Позначка-пігулка. */
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

/** Чип — фільтр списку. */
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

/** Порожній список. */
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm leading-relaxed text-muted">
      {children}
    </div>
  )
}

/** Чесне попередження, а не помилка. */
export function Warn({ children }: { children: ReactNode }) {
  return (
    <p className="mb-0 mt-2 flex gap-2 rounded-2xl bg-warning-soft px-3.5 py-2.5 text-sm leading-normal text-warning">
      <WarningCircle aria-hidden size={18} className="mt-px flex-none" />
      <span>{children}</span>
    </p>
  )
}

/**
 * Те, що не розібралося при читанні бази, — вголос (MER-49).
 *
 * Кожен екран зводив свої `Read.problems` руками й однаково їх розгортав, але
 * дедуплікацію пам'ятав лише один із шести: той самий битий рядок, прочитаний
 * двома запитами, друкувався двічі (а однакові `key` React ще й лає). Тепер
 * правило одне: зліпити, прибрати повтори, показати.
 */
export function Problems({ of }: { of: ReadonlyArray<ReadonlyArray<string>> }) {
  return (
    <>
      {[...new Set(of.flat())].map((problem) => (
        <Warn key={problem}>{problem}</Warn>
      ))}
    </>
  )
}

/** Довідковий рядок під кнопками. */
export function Meta({ children }: { children: ReactNode }) {
  return (
    <p className="mb-0 mt-2 text-xs leading-relaxed text-muted">{children}</p>
  )
}

/** Заголовок секції всередині картки. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1.5 mt-4 text-sm font-semibold text-content">{children}</p>
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
    <div className="mb-3">
      <label htmlFor={id} className="block text-sm font-medium text-muted">
        {label}
      </label>
      <textarea id={id} {...textarea} className={`${FIELD_LOOK} resize-y`} />
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

/** Кругла кнопка-іконка для дій у рядку (замінити, редагувати). */
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

/**
 * Модальний аркуш.
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
 *
 * Аркуш виїжджає знизу, оверлей проявляється — відкриття читається як рух,
 * а не як підміна екрана.
 */
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
      className="fixed inset-0 m-0 h-full max-h-full w-full max-w-full items-end justify-center border-0 bg-overlay p-0 text-content backdrop-blur-sm open:flex motion-safe:animate-fade dialog:items-center"
    >
      <div className="glass m-2.5 max-h-3/4 w-full max-w-xl overflow-y-auto rounded-3xl px-5 py-4 motion-safe:animate-sheet">
        <div className="mb-2 flex items-center justify-between gap-2.5">
          <h2 className="m-0 text-lg font-semibold tracking-tight">{title}</h2>
          <IconButton label="Закрити" onClick={close}>
            <X size={16} weight="bold" />
          </IconButton>
        </div>
        {typeof children === 'function' ? children(close) : children}
      </div>
    </dialog>
  )
}
