import { useState } from 'react'
import { usePowerSync } from '@powersync/react'
import {
  DEFAULT_PORTION,
  MEAL_TYPES,
  PORTION_LETTERS,
  nutritionChanges,
} from '@meridian/core'
import type { Meal, MealType, PortionLetter } from '@meridian/core'
import { useMealUsage } from '../lib/data/queries'
import { deleteMeal, insertMeal, updateMeal } from '../lib/data/mutations'
import { nutritionDraft, validateMeal } from '../lib/forms'
import type { MealDraft, NutritionDraft } from '../lib/forms'
import { ingredientsToText, portionsToText } from '../lib/meal-text'
import { Button, Field, SelectField, TextField, Warn } from './ui'
import { useMessages } from '../lib/i18n/use-messages'

function draftOf(meal: Meal | null): MealDraft {
  return {
    name: meal?.name ?? '',
    type: meal?.type ?? MEAL_TYPES[0],
    nutrition: nutritionDraft(meal),
    ingredients: meal ? ingredientsToText(meal.ingredients) : '',
    portions: meal ? portionsToText(meal.portions) : '',
    source: meal?.source ?? '',
    gerd: meal?.gerd ?? false,
    sourceIssues: meal ? meal.sourceIssues.join('\n') : '',
  }
}

export function MealForm({
  meal,
  familyId,
  onDone,
}: {
  meal: Meal | null
  familyId: string
  onDone: () => void
}) {
  const db = usePowerSync()
  const messages = useMessages()
  const t = messages.mealForm
  const [draft, setDraft] = useState<MealDraft>(() => draftOf(meal))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const usedInPlans = useMealUsage(meal?.id ?? null)

  const patch = (part: Partial<MealDraft>) =>
    setDraft((current) => ({ ...current, ...part }))
  const patchPortion = (letter: PortionLetter, part: Partial<NutritionDraft>) =>
    setDraft((current) => ({
      ...current,
      nutrition: {
        ...current.nutrition,
        [letter]: { ...current.nutrition[letter], ...part },
      },
    }))

  const save = async () => {
    const checked = validateMeal(draft)
    if ('error' in checked) {
      setError(checked.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (meal) {
        await updateMeal(
          db,
          meal.id,
          checked.input,
          nutritionChanges(meal.nutrition, checked.input.nutrition),
        )
      } else {
        await insertMeal(db, familyId, checked.input)
      }
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!meal) return
    if (usedInPlans > 0) {
      setError(t.inPlans(usedInPlans))
      return
    }
    if (!window.confirm(t.deleteConfirm(meal.name))) return
    setBusy(true)
    try {
      await deleteMeal(db, meal.id)
      onDone()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-3.5 glass rounded-3xl px-5 py-4">
      <h2 className="mb-2 mt-0 text-lg font-semibold tracking-tight">
        {meal ? t.edit : t.create}
      </h2>

      <Field
        label={t.name}
        value={draft.name}
        placeholder={t.namePlaceholder}
        onChange={(e) => patch({ name: e.target.value })}
      />

      <SelectField
        label={t.type}
        value={draft.type}
        onChange={(e) => patch({ type: e.target.value as MealType })}
      >
        {MEAL_TYPES.map((type) => (
          <option key={type} value={type}>
            {messages.common.mealType[type]}
          </option>
        ))}
      </SelectField>

      {PORTION_LETTERS.map((letter) => (
        <PortionFields
          key={letter}
          letter={letter}
          value={draft.nutrition[letter]}
          onChange={(part) => patchPortion(letter, part)}
        />
      ))}

      <TextField
        label={t.ingredients}
        hint={t.ingredientsHint}
        rows={4}
        placeholder={t.ingredientsPlaceholder}
        value={draft.ingredients}
        onChange={(e) => patch({ ingredients: e.target.value })}
      />

      <TextField
        label={t.portions}
        hint={t.portionsHint}
        rows={2}
        placeholder={t.portionsPlaceholder}
        value={draft.portions}
        onChange={(e) => patch({ portions: e.target.value })}
      />

      <Field
        label={t.source}
        hint={t.sourceHint}
        value={draft.source}
        placeholder={t.sourcePlaceholder}
        onChange={(e) => patch({ source: e.target.value })}
      />

      <label className="my-3 flex items-center gap-2 text-sm text-content">
        <input
          type="checkbox"
          className="m-0 w-auto accent-accent"
          checked={draft.gerd}
          onChange={(e) => patch({ gerd: e.target.checked })}
        />
        {t.gerd}
      </label>

      <TextField
        label={t.issues}
        hint={t.issuesHint}
        rows={3}
        placeholder={t.issuesPlaceholder}
        value={draft.sourceIssues}
        onChange={(e) => patch({ sourceIssues: e.target.value })}
      />

      {error ? <Warn>{error}</Warn> : null}

      <div className="mt-3.5 flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          {messages.common.save}
        </Button>
        <Button disabled={busy} onClick={onDone}>
          {messages.common.cancel}
        </Button>
        <span className="flex-1" />
        {meal ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="cursor-pointer rounded-full border border-warning bg-transparent px-5 py-3 text-sm font-medium text-warning transition-transform duration-300 ease-spring active:scale-97 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {messages.common.delete}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function PortionFields({
  letter,
  value,
  onChange,
}: {
  letter: PortionLetter
  value: NutritionDraft
  onChange: (part: Partial<NutritionDraft>) => void
}) {
  const messages = useMessages()
  const t = messages.mealForm
  const macro = messages.common.macroFields
  return (
    <fieldset className="m-0 mb-1 border-0 p-0">
      <legend className="mb-1 p-0 text-sm font-semibold text-content">
        {t.portion(letter)}
        {letter === DEFAULT_PORTION ? (
          <span className="font-normal text-muted">{t.defaultPortion}</span>
        ) : null}
      </legend>
      <Field
        label={t.calories}
        hint={t.caloriesHint(letter)}
        type="number"
        min={0}
        step={1}
        placeholder="—"
        value={value.calories}
        onChange={(e) => onChange({ calories: e.target.value })}
      />
      <div className="flex gap-2 [&>*]:flex-1">
        <Field
          label={macro.protein}
          type="number"
          min={0}
          step="0.1"
          placeholder="—"
          value={value.protein}
          onChange={(e) => onChange({ protein: e.target.value })}
        />
        <Field
          label={macro.fat}
          type="number"
          min={0}
          step="0.1"
          placeholder="—"
          value={value.fat}
          onChange={(e) => onChange({ fat: e.target.value })}
        />
        <Field
          label={macro.carbs}
          type="number"
          min={0}
          step="0.1"
          placeholder="—"
          value={value.carbs}
          onChange={(e) => onChange({ carbs: e.target.value })}
        />
      </div>
    </fieldset>
  )
}
