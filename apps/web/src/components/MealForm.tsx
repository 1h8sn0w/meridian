/**
 * Форма страви (MER-6, MER-49) — ручний ввід і редагування пулу.
 *
 * Поля рівно ті, що в моделі V1, і жодного більше. Порожнє поле — це порожнє
 * поле: калорійність, БЖВ, інгредієнти й порції записуються тільки тоді, коли
 * користувач їх справді ввів, бо «правдоподібне» значення в раціоні — це
 * питання медичної безпеки, а не акуратності (AGENTS.md → «Провенанс даних»).
 *
 * Чекбокса «приблизні калорії» тут немає навмисно: «≈» — санкціонований виняток
 * рівно для демо-пулу з PDF (MER-26), а не інструмент, яким користувач позначає
 * власні здогади.
 *
 * Кроків приготування, часу й фото теж немає: вони живуть у таблиці `recipe` й
 * належать сторінці рецепта (MER-22, MER-63) — звідти їх і редагують.
 */

import { useState } from 'react'
import { usePowerSync } from '@powersync/react'
import { MEAL_TYPES, MEAL_TYPE_LABELS } from '@meridian/core'
import type { Meal, MealType } from '@meridian/core'
import { useMealUsage } from '../lib/data/queries'
import { deleteMeal, insertMeal, updateMeal } from '../lib/data/mutations'
import type { MealInput } from '../lib/data/mutations'
import {
  ingredientsFromText,
  ingredientsToText,
  portionsFromText,
  portionsToText,
} from '../lib/meal-text'
import { Button, Field, SelectField, TextField, Warn } from './ui'

type Draft = {
  name: string
  type: MealType
  calories: string
  protein: string
  fat: string
  carbs: string
  ingredients: string
  portions: string
  source: string
}

function draftOf(meal: Meal | null): Draft {
  const num = (value: number | null) => (value === null ? '' : String(value))
  return {
    name: meal?.name ?? '',
    type: meal?.type ?? MEAL_TYPES[0],
    calories: num(meal?.calories ?? null),
    protein: num(meal?.protein ?? null),
    fat: num(meal?.fat ?? null),
    carbs: num(meal?.carbs ?? null),
    ingredients: meal ? ingredientsToText(meal.ingredients) : '',
    portions: meal ? portionsToText(meal.portions) : '',
    source: meal?.source ?? '',
  }
}

/** Порожнє поле — «в джерелі немає», а не нуль. */
function optional(value: string): number | null {
  const text = value.trim()
  if (!text) return null
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function validate(draft: Draft): { input: MealInput } | { error: string } {
  const name = draft.name.trim()
  if (!name) return { error: "Назва страви обов'язкова." }
  if (!MEAL_TYPES.includes(draft.type)) {
    return { error: 'Оберіть тип слота.' }
  }
  for (const [label, raw] of [
    ['Калорійність', draft.calories],
    ['Білки', draft.protein],
    ['Жири', draft.fat],
    ['Вуглеводи', draft.carbs],
  ] as const) {
    const value = optional(raw)
    if (raw.trim() && value === null) {
      return { error: '«' + label + '» має бути числом або лишитись порожнім.' }
    }
    if (value !== null && value < 0) {
      return { error: '«' + label + "» має бути невід'ємним." }
    }
  }
  const calories = optional(draft.calories)
  return {
    input: {
      name,
      type: draft.type,
      calories: calories === null ? null : Math.round(calories),
      protein: optional(draft.protein),
      fat: optional(draft.fat),
      carbs: optional(draft.carbs),
      ingredients: ingredientsFromText(draft.ingredients),
      source: draft.source.trim(),
      portions: portionsFromText(draft.portions),
    },
  }
}

export function MealForm({
  meal,
  familyId,
  onDone,
}: {
  /** null — нова страва. */
  meal: Meal | null
  familyId: string
  onDone: () => void
}) {
  const db = usePowerSync()
  const [draft, setDraft] = useState<Draft>(() => draftOf(meal))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const usedInPlans = useMealUsage(meal?.id ?? null)

  const patch = (part: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...part }))

  const save = async () => {
    const checked = validate(draft)
    if ('error' in checked) {
      setError(checked.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (meal) {
        // Позначку «≈» знімаємо, лише коли змінилася сама цифра: тепер це
        // значення користувача, а не оцінка демо-пулу (MER-26).
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
    <section className="mb-3.5 rounded-xl border border-line bg-surface px-4 py-3.5">
      <h2 className="mb-2 mt-0 text-base font-bold">
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
            className="cursor-pointer rounded-xl border border-warning bg-transparent px-3.5 py-2.5 text-sm text-warning disabled:cursor-not-allowed disabled:opacity-50"
          >
            Видалити
          </button>
        ) : null}
      </div>
    </section>
  )
}
