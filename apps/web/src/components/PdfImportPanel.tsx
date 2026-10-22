import { useMemo, useRef, useState } from 'react'
import { usePowerSync } from '@powersync/react'
import { MEAL_TYPES, parsePlanText, planEntryKey } from '@meridian/core'
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
import { useMessages } from '../lib/i18n/use-messages'
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
  known: boolean
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
      known,
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
  const messages = useMessages()
  const t = messages.pdf
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
    setStatus(t.reading(file.name))
    try {
      const text = await extractPdfText(
        await file.arrayBuffer(),
        (page, total) => {
          if (!stale()) {
            setStatus(t.page(page, total))
          }
        },
        stale,
      )
      if (stale()) return
      if (!text || !text.replace(/\s+/g, '')) {
        throw new Error(t.noText)
      }
      review(text, file.name)
    } catch (error) {
      if (stale()) return
      setStatus(null)
      setProblem(t.readFailed(errorText(error)))
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
              error: t.recipeFailed(errorText(error)),
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
      (added ? t.added(added) : '') +
        (failed ? t.failed(failed) : added ? t.done : t.nothing),
    )

    if (added) await archive()

    setBusy(false)
  }

  const archive = async () => {
    if (!source || archived || archiveInFlight.current) return
    archiveInFlight.current = true
    try {
      if (!supabase) throw new Error(t.noSupabase)
      await archivePlanSource(supabase, familyId, source.fileName, source.text)
      setArchived(true)
      setProblem(null)
    } catch (error) {
      setProblem(t.archiveFailed(errorText(error)))
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
      <Panel title={messages.meals.importPdf}>
        <Hint>{t.hint}</Hint>

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
            label={t.paste}
            rows={6}
            value={paste}
            placeholder={t.pastePlaceholder}
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
              {t.recognize}
            </Button>
            <Button onClick={close}>{messages.common.cancel}</Button>
          </div>
        </div>
      </Panel>
    )
  }

  const pending = cards.filter((card) => !card.added && card.checked).length

  return (
    <Panel title={t.reviewTitle}>
      <Hint>
        {t.stats(
          stats.meals,
          stats.repeats,
          stats.dups,
          stats.weeks,
          stats.days,
        )}
      </Hint>

      {pool.problems.map((issue) => (
        <Warn key={issue}>{t.poolUnread(issue)}</Warn>
      ))}

      {cards.length === 0 ? <Empty>{t.none}</Empty> : null}

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
            {t.archive}
          </Button>
        ) : null}
        <Button
          variant="primary"
          disabled={busy || pending === 0}
          onClick={() => void confirm()}
        >
          {busy ? t.adding : t.addChosen(pending)}
        </Button>
        <Button disabled={busy} onClick={restart}>
          {t.another}
        </Button>
        <Button disabled={busy} onClick={close}>
          {messages.common.close}
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
  const messages = useMessages()
  const t = messages.pdf
  const mealType = messages.common.mealType
  const { draft, entry } = card
  const flags = entry.flags.filter(
    (flag) => flag !== 'no-kcal' || !draft.calories.trim(),
  )

  if (entry.kind === 'repeat') {
    return (
      <div className="mb-2.5 rounded-2xl border border-line px-3 py-2.5 opacity-70">
        <p className="m-0 text-sm text-muted">
          {mealType[entry.type]}
          {entry.day ? t.day(entry.day) : ''}
          {t.repeat}
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
          {mealType[entry.type]}
          {entry.day ? t.day(entry.day) : ''}
          {card.added ? t.inPool : ''}
        </span>
      </label>

      <Field
        label={t.name}
        disabled={busy}
        value={draft.name}
        onChange={(event) => onPatch({ name: event.target.value })}
      />
      <SelectField
        label={t.type}
        disabled={busy}
        value={draft.type}
        onChange={(event) => onPatch({ type: event.target.value as MealType })}
      >
        {MEAL_TYPES.map((type) => (
          <option key={type} value={type}>
            {mealType[type]}
          </option>
        ))}
      </SelectField>
      <Field
        label={t.calories}
        disabled={busy}
        inputMode="numeric"
        placeholder={t.caloriesPlaceholder}
        value={draft.calories}
        onChange={(event) => onPatch({ calories: event.target.value })}
      />
      <Field
        label={t.servings}
        disabled={busy}
        inputMode="numeric"
        placeholder="—"
        value={draft.servings}
        onChange={(event) => onPatch({ servings: event.target.value })}
      />
      <Field
        label={t.source}
        disabled={busy}
        value={draft.source}
        onChange={(event) => onPatch({ source: event.target.value })}
      />
      <TextField
        label={t.ingredients}
        disabled={busy}
        rows={Math.min(6, Math.max(2, entry.ingredients.length))}
        value={draft.ingredients}
        onChange={(event) => onPatch({ ingredients: event.target.value })}
      />
      <TextField
        label={t.portions}
        disabled={busy}
        rows={Math.min(4, Math.max(2, entry.portions.length))}
        value={draft.portions}
        onChange={(event) => onPatch({ portions: event.target.value })}
      />
      <TextField
        label={t.steps}
        disabled={busy}
        rows={Math.min(4, Math.max(2, entry.steps.length))}
        value={draft.steps}
        onChange={(event) => onPatch({ steps: event.target.value })}
      />

      {card.error ? <Warn>{card.error}</Warn> : null}

      {flags.length || card.known ? (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {flags.map((flag) => (
            <Tag key={flag} tone="warn">
              {t.flag[flag]}
            </Tag>
          ))}
          {card.known ? <Tag tone="warn">{t.known}</Tag> : null}
        </div>
      ) : null}

      <RawText entry={entry} />
    </div>
  )
}

function RawText({ entry }: { entry: PlanEntry }) {
  const t = useMessages().pdf
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-muted">{t.raw}</summary>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-line bg-app px-2.5 py-2 font-mono text-xs text-subtle">
        {entry.raw.join('\n')}
      </pre>
    </details>
  )
}
