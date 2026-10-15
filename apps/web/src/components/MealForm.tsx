import { useState } from 'react'
import { usePowerSync } from '@powersync/react'
import { MEAL_TYPES, MEAL_TYPE_LABELS } from '@meridian/core'
import type { Meal, MealType } from '@meridian/core'
import { useMealUsage } from '../lib/data/queries'
import { deleteMeal, insertMeal, updateMeal } from '../lib/data/mutations'
import { fieldText, validateMeal } from '../lib/forms'
import type { MealDraft } from '../lib/forms'
import { ingredientsToText, portionsToText } from '../lib/meal-text'
import { Button, Field, SelectField, TextField, Warn } from './ui'

function draftOf(meal: Meal | null): MealDraft {
  return {
    name: meal?.name ?? '',
    type: meal?.type ?? MEAL_TYPES[0],
    calories: fieldText(meal?.calories),
    protein: fieldText(meal?.protein),
    fat: fieldText(meal?.fat),
    carbs: fieldText(meal?.carbs),
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
  const [draft, setDraft] = useState<MealDraft>(() => draftOf(meal))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const usedInPlans = useMealUsage(meal?.id ?? null)

  const patch = (part: Partial<MealDraft>) =>
    setDraft((current) => ({ ...current, ...part }))

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
        const changed = (meal.calories ?? null) !== checked.input.calories
        await updateMeal(db, meal.id, checked.input, changed)
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
      setError(
        'Страва стоїть у ' +
          usedInPlans +
          ' слот(ах) плану. Спершу замініть її або перегенеруйте тиждень — ' +
          'інакше в плані лишиться порожній слот.',
      )
      return
    }
    if (!window.confirm('Видалити страву «' + meal.name + '»?')) return
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
        {meal ? 'Редагувати страву' : 'Нова страва'}
      </h2>

      <Field
        label="Назва"
        value={draft.name}
        placeholder="Гречка з куркою та овочами"
        onChange={(e) => patch({ name: e.target.value })}
      />

      <SelectField
        label="Тип слота"
        value={draft.type}
        onChange={(e) => patch({ type: e.target.value as MealType })}
      >
        {MEAL_TYPES.map((type) => (
          <option key={type} value={type}>
            {MEAL_TYPE_LABELS[type]}
          </option>
        ))}
      </SelectField>

      <Field
        label="Калорійність, ккал"
        hint="Порожньо — генератор цю страву не братиме: коридор дня рахується числами."
        type="number"
        min={0}
        step={1}
        placeholder="—"
        value={draft.calories}
        onChange={(e) => patch({ calories: e.target.value })}
      />

      <div className="flex gap-2 [&>*]:flex-1">
        <Field
          label="Білки, г"
          type="number"
          min={0}
          step="0.1"
          placeholder="—"
          value={draft.protein}
          onChange={(e) => patch({ protein: e.target.value })}
        />
        <Field
          label="Жири, г"
          type="number"
          min={0}
          step="0.1"
          placeholder="—"
          value={draft.fat}
          onChange={(e) => patch({ fat: e.target.value })}
        />
        <Field
          label="Вуглеводи, г"
          type="number"
          min={0}
          step="0.1"
          placeholder="—"
          value={draft.carbs}
          onChange={(e) => patch({ carbs: e.target.value })}
        />
      </div>

      <TextField
        label="Інгредієнти"
        hint="По одному в рядку; кількість — після « — »."
        rows={4}
        placeholder={'гречка — 80 г\nкуряче філе — 150 г\nовочі на вибір'}
        value={draft.ingredients}
        onChange={(e) => patch({ ingredients: e.target.value })}
      />

      <TextField
        label="Готова порція Ж/Ч"
        hint="Дослівно з плану; складник — до « — ». Порожньо — секції не буде."
        rows={2}
        placeholder={'Ж - 130 г; Ч - 200 г\nГарнір — Ж - 100 г; Ч - 150 г'}
        value={draft.portions}
        onChange={(e) => patch({ portions: e.target.value })}
      />

      <Field
        label="Джерело (план дієтолога)"
        hint="Напр. «Тиждень 2» — за ним генератор міксує тиждень."
        value={draft.source}
        placeholder="Тиждень 2"
        onChange={(e) => patch({ source: e.target.value })}
      />

      <label className="my-3 flex items-center gap-2 text-sm text-content">
        <input
          type="checkbox"
          className="m-0 w-auto accent-accent"
          checked={draft.gerd}
          onChange={(e) => patch({ gerd: e.target.checked })}
        />
        ГЕРХ — страва з плану з урахуванням ГЕРХ
      </label>

      <TextField
        label="Помилки в джерелі"
        hint="По одній на рядок, без правильного значення. З'ясували й виправили поле — зітріть рядок."
        rows={3}
        placeholder="У день 1 рис 70 г, у день 2 — 100 г"
        value={draft.sourceIssues}
        onChange={(e) => patch({ sourceIssues: e.target.value })}
      />

      {error ? <Warn>{error}</Warn> : null}

      <div className="mt-3.5 flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          Зберегти
        </Button>
        <Button disabled={busy} onClick={onDone}>
          Скасувати
        </Button>
        <span className="flex-1" />
        {meal ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="cursor-pointer rounded-full border border-warning bg-transparent px-5 py-3 text-sm font-medium text-warning transition-transform duration-300 ease-spring active:scale-97 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Видалити
          </button>
        ) : null}
      </div>
    </section>
  )
}
