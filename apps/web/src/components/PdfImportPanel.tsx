import { useMemo, useRef, useState } from 'react'
import { usePowerSync } from '@powersync/react'
import {
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  parsePlanText,
  planEntryKey,
} from '@meridian/core'
import type { MealType, PlanEntry, PlanParse } from '@meridian/core'
import { useAuth } from '../lib/auth'
import { useMeals } from '../lib/data/queries'
import { insertMeal, saveRecipe } from '../lib/data/mutations'
import { archivePlanSource } from '../lib/data/pdf-import'
import { extractPdfText } from '../lib/pdf-text'
import { fieldText, validatePlanEntry } from '../lib/forms'
import type { PlanEntryDraft } from '../lib/forms'
import { ingredientsToText, portionsToText } from '../lib/meal-text'
import { errorText } from '../lib/messages'
import { plural } from '../lib/format'
import {
  Button,
  Empty,
  Field,
  Hint,
  InfoText,
  Panel,
  SelectField,
  Tag,
  TextField,
  Warn,
} from './ui'

type Card = {
  entry: PlanEntry
  draft: PlanEntryDraft
  checked: boolean
  added: boolean
  error: string | null
  flags: Array<string>
}

type Source = { fileName: string | null; text: string }

function draftOf(entry: PlanEntry): PlanEntryDraft {
  return {
    name: entry.name,
    type: entry.type,
    calories: fieldText(entry.calories),
    servings: fieldText(entry.servings),
    source: entry.source,
    ingredients: ingredientsToText(entry.ingredients),
    portions: portionsToText(entry.portions),
    steps: entry.steps.join('\n'),
  }
}

function cardsOf(
  parsed: PlanParse,
  inPool: ReadonlySet<string>,
  poolKnown: boolean,
): Array<Card> {
  return parsed.entries.map((entry) => {
    const known =
      entry.kind !== 'repeat' &&
      inPool.has(planEntryKey(entry.name, entry.type))
    return {
      entry,
      draft: draftOf(entry),
      checked: poolKnown && entry.kind === 'meal' && !known,
      added: false,
      error: null,
      flags: [
        ...entry.flags.map((flag) => flag.message),
        ...(known
          ? ['Така страва вже є в пулі — типово не імпортується.']
          : []),
      ],
    }
  })
}

export function PdfImportPanel({
  familyId,
  onDone,
}: {
  familyId: string
  onDone: () => void
}) {
  const db = usePowerSync()
  const { supabase } = useAuth()
  const pool = useMeals()

  const [source, setSource] = useState<Source | null>(null)
  const [cards, setCards] = useState<Array<Card> | null>(null)
  const [stats, setStats] = useState<PlanParse['stats'] | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const [archived, setArchived] = useState(false)
  const [busy, setBusy] = useState(false)
  const latestRun = useRef(0)
  const archiveInFlight = useRef(false)

  const close = () => {
    latestRun.current++
    onDone()
  }

  const inPool = useMemo(
    () => new Set(pool.data.map((meal) => planEntryKey(meal.name, meal.type))),
    [pool.data],
  )

  const review = (text: string, fileName: string | null) => {
    const parsed = parsePlanText(text)
    setSource({ fileName, text })
    setCards(cardsOf(parsed, inPool, pool.problems.length === 0))
    setStats(parsed.stats)
    setStatus(null)
    setProblem(null)
  }

  const readPdf = async (file: File) => {
    const token = ++latestRun.current
    const stale = () => token !== latestRun.current
    setProblem(null)
    setStatus('Читаю «' + file.name + '»…')
    try {
      const text = await extractPdfText(
        await file.arrayBuffer(),
        (page, total) => {
          if (!stale()) {
            setStatus('Витягаю текст: сторінка ' + page + ' з ' + total + '…')
          }
        },
        stale,
      )
      if (stale()) return
      if (!text || !text.replace(/\s+/g, '')) {
        throw new Error('У файлі не знайдено тексту (можливо, це скан).')
      }
      review(text, file.name)
    } catch (error) {
      if (stale()) return
      setStatus(null)
      setProblem('Не вдалося прочитати PDF: ' + errorText(error))
    }
  }

  const patch = (index: number, part: Partial<PlanEntryDraft>) =>
    setCards(
      (current) =>
        current?.map((card, i) =>
          i === index ? { ...card, draft: { ...card.draft, ...part } } : card,
        ) ?? null,
    )

  const check = (index: number, checked: boolean) =>
    setCards(
      (current) =>
        current?.map((card, i) =>
          i === index ? { ...card, checked } : card,
        ) ?? null,
    )

  const confirm = async () => {
    if (!cards || !source) return
    setBusy(true)
    setProblem(null)

    const outcomes = new Map<number, Partial<Card>>()
    let added = 0
    let failed = 0

    for (const [index, card] of cards.entries()) {
      if (card.added || !card.checked) continue
      const checked = validatePlanEntry(card.draft)
      if ('error' in checked) {
        outcomes.set(index, { error: checked.error })
        failed++
        continue
      }

      try {
        const mealId = await insertMeal(db, familyId, checked.input.meal)
        outcomes.set(index, { added: true, checked: false, error: null })
        added++

        const recipe = checked.input.recipe
        if (recipe) {
          try {
            await saveRecipe(db, familyId, mealId, recipe)
          } catch (error) {
            outcomes.set(index, {
              added: true,
              checked: false,
              error:
                'Страву додано, але кроки й порційність не збереглися: ' +
                errorText(error),
            })
          }
        }
      } catch (error) {
        outcomes.set(index, { error: errorText(error) })
        failed++
      }
    }

    setCards(
      (current) =>
        current?.map((card, i) => {
          const outcome = outcomes.get(i)
          return outcome ? { ...card, ...outcome } : card
        }) ?? null,
    )
    setStatus(
      (added
        ? 'Додано до пулу: ' +
          added +
          ' ' +
          plural(added, 'страва', 'страви', 'страв') +
          '. '
        : '') +
        (failed
          ? 'Не додано: ' + failed + ' — див. позначки в картках.'
          : added
            ? 'Готово.'
            : 'Нічого не вибрано.'),
    )

    if (added) await archive()

    setBusy(false)
  }

  const archive = async () => {
    if (!source || archived || archiveInFlight.current) return
    archiveInFlight.current = true
    try {
      if (!supabase) throw new Error('Сервер Supabase не налаштований.')
      await archivePlanSource(supabase, familyId, source.fileName, source.text)
      setArchived(true)
      setProblem(null)
    } catch (error) {
      setProblem(
        'Страви додано, але текст плану не збережено в архів імпортів — для ' +
          'цього потрібна мережа. ' +
          errorText(error),
      )
    } finally {
      archiveInFlight.current = false
    }
  }

  const restart = () => {
    latestRun.current++
    setArchived(false)
    setSource(null)
    setCards(null)
    setStats(null)
    setStatus(null)
    setProblem(null)
    setPaste('')
  }

  if (!cards || !stats) {
    return (
      <Panel title="Імпорт із PDF-плану дієтолога">
        <Hint>
          Розпізнаємо лише те, що буквально є у файлі: назви, тип прийому,
          інгредієнти, номер тижня, калорійність — де вказана. Чого в PDF немає,
          те лишиться порожнім. Перед додаванням у пул усе перевіряєте й
          підтверджуєте ви.
        </Hint>

        <input
          type="file"
          accept=".pdf,application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void readPdf(file)
          }}
          className="block w-full cursor-pointer rounded-2xl border border-line bg-app px-3 py-2.5 text-sm text-content file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-accent"
        />

        {status ? <InfoText>{status}</InfoText> : null}
        {problem ? <Warn>{problem}</Warn> : null}

        <div className="mt-3">
          <TextField
            label="Або вставте текст, скопійований із PDF"
            rows={6}
            value={paste}
            placeholder={'День 1\nСніданок: …'}
            onChange={(event) => setPaste(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              disabled={!paste.replace(/\s+/g, '')}
              onClick={() => {
                latestRun.current++
                review(paste, null)
              }}
            >
              Розпізнати текст
            </Button>
            <Button onClick={close}>Скасувати</Button>
          </div>
        </div>
      </Panel>
    )
  }

  const pending = cards.filter((card) => !card.added && card.checked).length

  return (
    <Panel title="Перевірка перед додаванням">
      <Hint>
        Розпізнано страв: {stats.meals}
        {stats.repeats ? ' · повторів між днями: ' + stats.repeats : ''}
        {stats.dups ? ' · дублікатів назв: ' + stats.dups : ''}
        {stats.weeks ? ' · тижнів: ' + stats.weeks : ''}
        {stats.days ? ' · днів: ' + stats.days : ''}. Повтори («Той самий…») до
        пулу не додаються — окрема страва вже є вище. Сумнівні місця мають
        позначки, сирий текст плану — під кожною карткою.
      </Hint>

      {pool.problems.map((issue) => (
        <Warn key={issue}>
          Не вдалося прочитати пул страв, тож нічого не позначено наперед —
          перевірте кожну картку самі. {issue}
        </Warn>
      ))}

      {cards.length === 0 ? (
        <Empty>
          У тексті не розпізнано жодної страви. Перевірте, що це план із рядками
          «Сніданок: …», «Обід: …».
        </Empty>
      ) : null}

      {cards.map((card, index) => (
        <ReviewCard
          key={index}
          card={card}
          busy={busy}
          onCheck={(checked) => check(index, checked)}
          onPatch={(part) => patch(index, part)}
        />
      ))}

      {status ? <InfoText>{status}</InfoText> : null}
      {problem ? <Warn>{problem}</Warn> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        {!archived && cards.some((card) => card.added) ? (
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void archive().finally(() => setBusy(false))
            }}
          >
            Зберегти текст плану в архів
          </Button>
        ) : null}
        <Button
          variant="primary"
          disabled={busy || pending === 0}
          onClick={() => void confirm()}
        >
          {busy ? 'Додаємо…' : 'Додати вибрані до пулу (' + pending + ')'}
        </Button>
        <Button disabled={busy} onClick={restart}>
          Інший файл
        </Button>
        <Button disabled={busy} onClick={close}>
          Закрити
        </Button>
      </div>
    </Panel>
  )
}

function ReviewCard({
  card,
  busy,
  onCheck,
  onPatch,
}: {
  card: Card
  busy: boolean
  onCheck: (checked: boolean) => void
  onPatch: (part: Partial<PlanEntryDraft>) => void
}) {
  const { draft, entry } = card

  if (entry.kind === 'repeat') {
    return (
      <div className="mb-2.5 rounded-2xl border border-line px-3 py-2.5 opacity-70">
        <p className="m-0 text-sm text-muted">
          {MEAL_TYPE_LABELS[entry.type]}
          {entry.day ? ' · День ' + entry.day : ''} — повтор
          {entry.name ? ': ' + entry.name : ''}
        </p>
        <RawText entry={entry} />
      </div>
    )
  }

  return (
    <div
      className={`mb-2.5 rounded-2xl border border-line px-3 py-2.5 ${
        card.added ? 'opacity-60' : ''
      }`}
    >
      <label className="mb-2 flex items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          checked={card.checked}
          disabled={card.added || busy}
          onChange={(event) => onCheck(event.target.checked)}
        />
        <span className="text-muted">
          {MEAL_TYPE_LABELS[entry.type]}
          {entry.day ? ' · День ' + entry.day : ''}
          {card.added ? ' · уже в пулі' : ''}
        </span>
      </label>

      <Field
        label="Назва"
        disabled={busy}
        value={draft.name}
        onChange={(event) => onPatch({ name: event.target.value })}
      />
      <SelectField
        label="Тип слота"
        disabled={busy}
        value={draft.type}
        onChange={(event) => onPatch({ type: event.target.value as MealType })}
      >
        {MEAL_TYPES.map((type) => (
          <option key={type} value={type}>
            {MEAL_TYPE_LABELS[type]}
          </option>
        ))}
      </SelectField>
      <Field
        label="Калорійність, ккал"
        disabled={busy}
        inputMode="numeric"
        placeholder="немає в PDF"
        value={draft.calories}
        onChange={(event) => onPatch({ calories: event.target.value })}
      />
      <Field
        label="Порції"
        disabled={busy}
        inputMode="numeric"
        placeholder="—"
        value={draft.servings}
        onChange={(event) => onPatch({ servings: event.target.value })}
      />
      <Field
        label="Джерело (план дієтолога)"
        disabled={busy}
        value={draft.source}
        onChange={(event) => onPatch({ source: event.target.value })}
      />
      <TextField
        label="Інгредієнти (по одному в рядку)"
        disabled={busy}
        rows={Math.min(6, Math.max(2, entry.ingredients.length))}
        value={draft.ingredients}
        onChange={(event) => onPatch({ ingredients: event.target.value })}
      />
      <TextField
        label="Готова порція Ж/Ч (складник — до « — »)"
        disabled={busy}
        rows={Math.min(4, Math.max(2, entry.portions.length))}
        value={draft.portions}
        onChange={(event) => onPatch({ portions: event.target.value })}
      />
      <TextField
        label="Кроки/нотатки з плану (по одному в рядку)"
        disabled={busy}
        rows={Math.min(4, Math.max(2, entry.steps.length))}
        value={draft.steps}
        onChange={(event) => onPatch({ steps: event.target.value })}
      />

      {card.error ? <Warn>{card.error}</Warn> : null}

      {card.flags.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {card.flags.map((flag) => (
            <Tag key={flag} tone="warn">
              {flag}
            </Tag>
          ))}
        </div>
      ) : null}

      <RawText entry={entry} />
    </div>
  )
}

function RawText({ entry }: { entry: PlanEntry }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-muted">
        Сирий текст із плану
      </summary>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-line bg-app px-2.5 py-2 font-mono text-xs text-subtle">
        {entry.raw.join('\n')}
      </pre>
    </details>
  )
}
