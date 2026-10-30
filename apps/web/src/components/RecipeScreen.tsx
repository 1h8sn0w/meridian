import { useEffect, useRef, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { usePowerSync } from '@powersync/react'
import { formatMealCalories, portionOf } from '@meridian/core'
import type { Meal, PortionLetter, Recipe } from '@meridian/core'
import { useActiveProfile } from '../lib/active-profile'
import { useMeals, useProfiles, useRecipe } from '../lib/data/queries'
import { saveRecipe } from '../lib/data/mutations'
import { fieldText, validateRecipe } from '../lib/forms'
import type { RecipeDraft } from '../lib/forms'
import { messages as currentMessages } from '../lib/i18n/locale'
import { useMessages } from '../lib/i18n/use-messages'
import { recipeText } from '../lib/recipe-share'
import { shareOrCopy } from '../lib/share'
import { canKeepScreenAwake, keepScreenAwake } from '../lib/wake-lock'
import { AppShell } from './AppShell'
import { MealDetails, MealMarks, SourceIssues } from './MealDetails'
import {
  CaretLeft,
  PencilSimple,
  Plus,
  ShareNetwork,
  Sun,
} from '@phosphor-icons/react'
import {
  Button,
  Chip,
  Field,
  Hint,
  InfoText,
  Panel,
  Problems,
  SectionLabel,
  TextField,
  Warn,
} from './ui'

export function RecipeScreen({
  mealId,
  familyId,
}: {
  mealId: string
  familyId: string
}) {
  const messages = useMessages()
  const t = messages.recipe
  const profilesRead = useProfiles()
  const { profile } = useActiveProfile(profilesRead.data)
  const mealsRead = useMeals(profile?.portion)
  const recipeRead = useRecipe(mealId)
  const [editing, setEditing] = useState(false)

  const meal = mealsRead.data.find((item) => item.id === mealId) ?? null
  const recipe = recipeRead.data
  const problems = [
    mealsRead.problems,
    profilesRead.problems,
    recipeRead.problems,
  ]

  if (!meal) {
    return (
      <AppShell title={messages.titles.recipe}>
        <Back />
        <Problems of={problems} />
        <Panel>
          <Hint>{mealsRead.isLoading ? t.readingMeals : t.gone}</Hint>
        </Panel>
      </AppShell>
    )
  }

  return (
    <AppShell
      title={meal.name}
      subtitle={
        messages.common.mealType[meal.type] +
        (meal.source ? ' · ' + meal.source : '')
      }
    >
      <Back />
      <Problems of={problems} />

      <Panel>
        <Photo meal={meal} photo={recipe?.photo ?? null} />
        <MealMarks meal={meal} block />
        <Chips meal={meal} recipe={recipe} portion={portionOf(profile)} />
        <StayAwake />
        <MealDetails meal={meal} portion={profile?.portion ?? null} hideEmpty />
        <SourceIssues meal={meal} />
        <Steps
          key={recipe?.steps.join('\n')}
          steps={recipe?.steps ?? []}
          servings={recipe?.servings ?? null}
        />
      </Panel>

      <Panel>
        {recipeRead.isLoading ? (
          <Hint>{t.reading}</Hint>
        ) : editing ? (
          <RecipeForm
            mealId={mealId}
            familyId={familyId}
            recipe={recipe}
            onDone={() => setEditing(false)}
          />
        ) : (
          <>
            <ShareRecipe meal={meal} recipe={recipe} />
            <div className="mb-3">
              <Button block onClick={() => setEditing(true)}>
                {recipe ? (
                  <PencilSimple aria-hidden size={18} />
                ) : (
                  <Plus aria-hidden size={18} weight="bold" />
                )}
                {recipe ? t.edit : t.add}
              </Button>
            </div>
            <Hint>{t.hint}</Hint>
          </>
        )}
      </Panel>
    </AppShell>
  )
}

function ShareRecipe({ meal, recipe }: { meal: Meal; recipe: Recipe | null }) {
  const messages = useMessages()
  const t = messages.recipe
  const [outcome, setOutcome] = useState<'copied' | 'failed' | null>(null)
  const text = recipeText(meal, recipe)
  if (!text) return null

  const share = async () => {
    setOutcome(null)
    const result = await shareOrCopy({ title: meal.name, text })
    if (result === 'copied' || result === 'failed') setOutcome(result)
  }

  return (
    <div className="mb-3">
      <Button block onClick={() => void share()}>
        <ShareNetwork aria-hidden size={18} />
        {t.share}
      </Button>
      {outcome === 'copied' ? <InfoText>{t.copied}</InfoText> : null}
      {outcome === 'failed' ? <Warn>{messages.common.shareFailed}</Warn> : null}
    </div>
  )
}

function Back() {
  const t = useMessages().recipe
  const router = useRouter()
  const [from] = useState(() => {
    const { state } = router.latestLocation
    return state.__TSR_index !== 0 ? state.recipeFrom : undefined
  })
  const leaving = useRef(false)
  const look =
    'inline-flex items-center gap-1 text-sm font-medium text-accent no-underline transition-transform duration-300 ease-spring hover:-translate-x-0.5'

  if (from) {
    return (
      <a
        href={from}
        className={look}
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return
          event.preventDefault()
          if (!leaving.current) router.history.back()
          leaving.current = true
        }}
      >
        <CaretLeft aria-hidden size={14} weight="bold" />
        {t.back}
      </a>
    )
  }
  return (
    <Link to="/meals" className={look}>
      <CaretLeft aria-hidden size={14} weight="bold" />
      {t.toMeals}
    </Link>
  )
}

function Photo({ meal, photo }: { meal: Meal; photo: string | null }) {
  const t = useMessages().recipe
  if (!photo) return null
  return (
    <img
      src={photo}
      alt={t.photoAlt(meal.name)}
      className="mb-3 block max-h-72 w-full rounded-2xl object-cover motion-safe:animate-fade"
    />
  )
}

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () =>
        reject(new Error(currentMessages().recipe.imageFailed))
      element.src = url
    })
    const scale = Math.min(1, 800 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error(currentMessages().recipe.noCanvas)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    URL.revokeObjectURL(url)
  }
}

function Chips({
  meal,
  recipe,
  portion,
}: {
  meal: Meal
  recipe: Recipe | null
  portion: PortionLetter
}) {
  const messages = useMessages()
  const t = messages.recipe
  const calories = formatMealCalories(meal, messages.common.kcalUnit)
  const chips: Array<{ value: string; label: string }> = [
    ...(calories ? [{ value: calories, label: t.calories(portion) }] : []),
    ...(recipe?.prepTime != null
      ? [{ value: messages.common.minutes(recipe.prepTime), label: t.prep }]
      : []),
    ...(recipe?.servings != null
      ? [
          {
            value: String(recipe.servings),
            label: t.servings(recipe.servings),
          },
        ]
      : []),
  ]
  if (!chips.length) return null
  return (
    <div className="flex gap-2">
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="flex-1 rounded-2xl bg-app px-2 py-2.5 text-center"
        >
          <div className="font-mono text-base font-semibold tabular-nums text-accent">
            {chip.value}
          </div>
          <div className="mt-0.5 text-xs text-muted">{chip.label}</div>
        </div>
      ))}
    </div>
  )
}

function StayAwake() {
  const t = useMessages().recipe
  const [on, setOn] = useState(false)
  const [refused, setRefused] = useState(false)

  useEffect(() => {
    if (!on) return
    return keepScreenAwake(navigator, document, () => {
      setOn(false)
      setRefused(true)
    })
  }, [on])

  if (!canKeepScreenAwake()) return null
  return (
    <div className="mt-3">
      <Chip
        active={on}
        onClick={() => {
          setRefused(false)
          setOn(!on)
        }}
      >
        <Sun aria-hidden size={14} weight={on ? 'fill' : 'regular'} />
        {t.stayAwake}
      </Chip>
      {refused ? <Warn>{t.awakeRefused}</Warn> : null}
    </div>
  )
}

function Steps({
  steps,
  servings,
}: {
  steps: ReadonlyArray<string>
  servings: number | null
}) {
  const t = useMessages().recipe
  const [done, setDone] = useState<ReadonlySet<number>>(new Set())
  if (!steps.length) return null
  const toggle = (index: number) =>
    setDone((prev) => {
      const next = new Set(prev)
      if (!next.delete(index)) next.add(index)
      return next
    })
  return (
    <>
      <SectionLabel>
        {t.cooking}
        {servings === null ? '' : t.forServings(servings)}
      </SectionLabel>
      <p className="m-0 text-xs text-muted">{t.tapStep}</p>
      <ol className="mb-0 mt-1 list-decimal pl-5 text-sm leading-relaxed marker:font-mono marker:text-accent">
        {steps.map((step, index) => (
          <li key={index} className="my-px">
            <button
              type="button"
              aria-pressed={done.has(index)}
              onClick={() => toggle(index)}
              className={`block w-full cursor-pointer border-0 bg-transparent px-0 py-1 text-left transition-opacity duration-300 ${
                done.has(index)
                  ? 'text-muted line-through opacity-60'
                  : 'text-content'
              }`}
            >
              {step}
            </button>
          </li>
        ))}
      </ol>
    </>
  )
}

function RecipeForm({
  mealId,
  familyId,
  recipe,
  onDone,
}: {
  mealId: string
  familyId: string
  recipe: Recipe | null
  onDone: () => void
}) {
  const db = usePowerSync()
  const messages = useMessages()
  const t = messages.recipe
  const [draft, setDraft] = useState<RecipeDraft>(() => ({
    steps: recipe ? recipe.steps.join('\n') : '',
    prepTime: fieldText(recipe?.prepTime),
    servings: fieldText(recipe?.servings),
    photo: recipe?.photo ?? null,
  }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const patch = (part: Partial<RecipeDraft>) =>
    setDraft((current) => ({ ...current, ...part }))

  const pick = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    try {
      patch({ photo: await shrink(file) })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const save = async () => {
    const checked = validateRecipe(draft)
    if ('error' in checked) {
      setError(checked.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await saveRecipe(db, familyId, mealId, checked.input)
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    }
  }

  return (
    <>
      <TextField
        label={t.steps}
        hint={t.stepsHint}
        rows={5}
        placeholder={t.stepsPlaceholder}
        value={draft.steps}
        onChange={(e) => patch({ steps: e.target.value })}
      />

      <div className="flex gap-2 [&>*]:flex-1">
        <Field
          label={t.prepTime}
          type="number"
          min={0}
          step={1}
          placeholder="—"
          value={draft.prepTime}
          onChange={(e) => patch({ prepTime: e.target.value })}
        />
        <Field
          label={t.servingsField}
          type="number"
          min={1}
          step={1}
          placeholder="—"
          value={draft.servings}
          onChange={(e) => patch({ servings: e.target.value })}
        />
      </div>

      <label className="block text-sm text-muted">
        {t.photo}
        {draft.photo ? t.photoChosen : t.photoOptional}
        <input
          type="file"
          accept="image/*"
          className="mt-1.5 block w-full cursor-pointer rounded-2xl border border-line bg-app px-3 py-2.5 text-sm text-content file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-accent-soft file:px-4 file:py-1.5 file:text-sm file:font-medium file:text-accent"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </label>
      {draft.photo ? (
        <div className="mt-1.5">
          <Button onClick={() => patch({ photo: null })}>
            {t.removePhoto}
          </Button>
        </div>
      ) : null}

      {error ? <Warn>{error}</Warn> : null}

      <div className="mt-3.5 flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          {messages.common.save}
        </Button>
        <Button disabled={busy} onClick={onDone}>
          {messages.common.cancel}
        </Button>
      </div>
    </>
  )
}
