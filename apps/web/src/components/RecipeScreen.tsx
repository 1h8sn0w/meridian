/**
 * Сторінка рецепта (MER-63) — V2-реалізація наміру MER-22.
 *
 * Окремий екран, а не секція картки: тут кроки приготування, фото й повний
 * склад — те, заради чого страву відкривають, коли вже стоять біля плити.
 *
 * Три правила, з яких росте весь файл:
 *
 *  - **Секції без даних немає взагалі.** Ні порожнього заголовка, ні «0 хв»:
 *    порожнє поле означає «у джерелі цього немає» (правило провенансу).
 *  - **Фото береться з рядка `recipe` за `meal_id`**, тобто завжди живе. Саме
 *    копія фото всередині знімка плану давала граблі MER-40 і MER-35 — тут
 *    копії немає в принципі, бо `plan_slot` посилається на страву за id.
 *  - **Усе читається з локального SQLite**, тож сторінка працює офлайн, а
 *    зміна з іншого пристрою приїжджає на неї сама (MER-46).
 */

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { usePowerSync } from '@powersync/react'
import { MEAL_TYPE_LABELS, formatMealCalories } from '@meridian/core'
import type { Meal, Recipe } from '@meridian/core'
import { useActiveProfile } from '../lib/active-profile'
import { useMeals, useProfiles, useRecipe } from '../lib/data/queries'
import { saveRecipe } from '../lib/data/mutations'
import type { RecipeInput } from '../lib/data/mutations'
import { plural } from '../lib/format'
import { AppShell } from './AppShell'
import { MealDetails } from './MealDetails'
import { Button, Field, Hint, Panel, SectionLabel, TextField, Warn } from './ui'

export function RecipeScreen({
  mealId,
  familyId,
}: {
  mealId: string
  familyId: string
}) {
  const mealsRead = useMeals()
  const profilesRead = useProfiles()
  const recipeRead = useRecipe(mealId)
  const { profile } = useActiveProfile(profilesRead.data)
  const [editing, setEditing] = useState(false)

  const meal = mealsRead.data.find((item) => item.id === mealId) ?? null
  const recipe = recipeRead.data
  const problems = [
    ...mealsRead.problems,
    ...profilesRead.problems,
    ...recipeRead.problems,
  ]

  if (!meal) {
    return (
      <AppShell title="Рецепт">
        <Back />
        {problems.map((problem) => (
          <Warn key={problem}>{problem}</Warn>
        ))}
        <Panel>
          <Hint>
            {mealsRead.isLoading
              ? 'Читаємо пул страв…'
              : 'Страви більше немає в пулі — її видалили тут або на іншому пристрої.'}
          </Hint>
        </Panel>
      </AppShell>
    )
  }

  return (
    <AppShell
      title={meal.name}
      subtitle={
        MEAL_TYPE_LABELS[meal.type] + (meal.source ? ' · ' + meal.source : '')
      }
    >
      <Back />
      {problems.map((problem) => (
        <Warn key={problem}>{problem}</Warn>
      ))}

      <Panel>
        <Photo meal={meal} photo={recipe?.photo ?? null} />
        <Chips meal={meal} recipe={recipe} />
        {/* Той самий склад, що на картці «Сьогодні» — правило «показувати чи
            ні» має бути одне на застосунок. `hideEmpty`: сторінка вся про склад
            страви, тож рядок «не вказано» тут зайвий (MER-63). */}
        <MealDetails meal={meal} portion={profile?.portion ?? null} hideEmpty />
        <Steps
          steps={recipe?.steps ?? []}
          servings={recipe?.servings ?? null}
        />
      </Panel>

      <Panel>
        {editing ? (
          <RecipeForm
            mealId={mealId}
            familyId={familyId}
            recipe={recipe}
            onDone={() => setEditing(false)}
          />
        ) : (
          <>
            <Button block onClick={() => setEditing(true)}>
              {recipe ? 'Змінити рецепт' : '+ Додати рецепт'}
            </Button>
            <Hint>
              Кроки, час і фото — ваші, а не з плану дієтолога: у PDF їх немає.
              Склад і калорійність редагуються на екрані «Страви».
            </Hint>
          </>
        )}
      </Panel>
    </AppShell>
  )
}

function Back() {
  return (
    <Link to="/meals" className="text-sm text-accent no-underline">
      ‹ До страв
    </Link>
  )
}

/* ==========================================================================
 * Фото
 * ======================================================================== */

function Photo({ meal, photo }: { meal: Meal; photo: string | null }) {
  if (!photo) return null
  return (
    <img
      src={photo}
      alt={'Фото: ' + meal.name}
      className="mb-2 block max-h-72 w-full rounded-xl object-cover"
    />
  )
}

/**
 * Фото зменшується до 800 px і зберігається JPEG-ом — як у V1.
 *
 * Це не косметика: `photo` — data-URL у синхронізованій таблиці, тож знімок із
 * камери на 4 МБ поїхав би через мережу цілком і на кожен пристрій. 800/0.8 —
 * калібрувальна ручка під телефон, а не константа з якогось стандарту.
 */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () =>
        reject(new Error('Не вдалося прочитати зображення.'))
      element.src = url
    })
    const scale = Math.min(1, 800 / Math.max(image.width, image.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Браузер не дав полотна для стиснення фото.')
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/jpeg', 0.8)
  } finally {
    URL.revokeObjectURL(url)
  }
}

/* ==========================================================================
 * Метадані: калорійність із страви, час і порції — з рецепта
 * ======================================================================== */

function Chips({ meal, recipe }: { meal: Meal; recipe: Recipe | null }) {
  const calories = formatMealCalories(meal)
  const chips: Array<{ value: string; label: string }> = [
    ...(calories ? [{ value: calories, label: 'калорійність' }] : []),
    ...(recipe?.prepTime != null
      ? [{ value: recipe.prepTime + ' хв', label: 'готувати' }]
      : []),
    ...(recipe?.servings != null
      ? [
          {
            value: String(recipe.servings),
            label: plural(recipe.servings, 'порція', 'порції', 'порцій'),
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
          className="flex-1 rounded-xl border border-line bg-app px-2 py-2 text-center"
        >
          <div className="text-sm font-semibold text-accent">{chip.value}</div>
          <div className="mt-0.5 text-xs text-muted">{chip.label}</div>
        </div>
      ))}
    </div>
  )
}

/* ==========================================================================
 * Кроки приготування
 * ======================================================================== */

function Steps({
  steps,
  servings,
}: {
  steps: ReadonlyArray<string>
  servings: number | null
}) {
  if (!steps.length) return null
  return (
    <>
      <SectionLabel>
        Приготування
        {servings === null
          ? ''
          : ' · на ' +
            servings +
            ' ' +
            plural(servings, 'порцію', 'порції', 'порцій')}
      </SectionLabel>
      <ol className="mb-0 mt-1 list-decimal pl-5 text-sm leading-relaxed">
        {steps.map((step, index) => (
          <li key={index} className="my-px">
            {step}
          </li>
        ))}
      </ol>
    </>
  )
}

/* ==========================================================================
 * Редагування — єдине місце у V2, де ці поля взагалі можна ввести (MER-22)
 * ======================================================================== */

type Draft = {
  steps: string
  prepTime: string
  servings: string
  photo: string | null
}

/** Порожнє поле — «в джерелі немає», а не нуль (як у `MealForm`). */
function optional(value: string): number | null {
  const text = value.trim()
  if (!text) return null
  const n = Number(text.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Перевіряємо ті самі межі, що стоять CHECK-ами в схемі
 * (`recipe_prep_time_non_negative`, `recipe_servings_positive`).
 *
 * Не «про всяк випадок»: рядок, який не пройшов CHECK, PostgREST відкидає вже
 * під час вивантаження — тобто мовчки й через невизначений час після
 * натискання «Зберегти» (MER-49). Помилку треба показати тут, поки користувач
 * її бачить.
 */
function validate(draft: Draft): { input: RecipeInput } | { error: string } {
  const prepTime = optional(draft.prepTime)
  if (draft.prepTime.trim() && prepTime === null) {
    return {
      error: '«Час приготування» має бути числом або лишитись порожнім.',
    }
  }
  if (prepTime !== null && prepTime < 0) {
    return { error: "«Час приготування» має бути невід'ємним." }
  }
  const servings = optional(draft.servings)
  if (draft.servings.trim() && servings === null) {
    return { error: '«Порції» мають бути числом або лишитись порожніми.' }
  }
  if (servings !== null && servings <= 0) {
    return { error: '«Порції» мають бути додатним числом.' }
  }
  return {
    input: {
      steps: draft.steps
        .split('\n')
        .map((step) => step.trim())
        .filter((step) => step.length > 0),
      prepTime,
      servings,
      photo: draft.photo,
    },
  }
}

function RecipeForm({
  mealId,
  familyId,
  recipe,
  onDone,
}: {
  mealId: string
  familyId: string
  /** null — рецепта ще немає; тоді це його створення. */
  recipe: Recipe | null
  onDone: () => void
}) {
  const db = usePowerSync()
  const [draft, setDraft] = useState<Draft>(() => ({
    steps: recipe ? recipe.steps.join('\n') : '',
    prepTime: recipe?.prepTime == null ? '' : String(recipe.prepTime),
    servings: recipe?.servings == null ? '' : String(recipe.servings),
    photo: recipe?.photo ?? null,
  }))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const patch = (part: Partial<Draft>) =>
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
    const checked = validate(draft)
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
        label="Кроки приготування"
        hint="По одному в рядку. Порожньо — секції не буде."
        rows={5}
        placeholder={'Відварити гречку 15 хв.\nОбсмажити філе до золотистого.'}
        value={draft.steps}
        onChange={(e) => patch({ steps: e.target.value })}
      />

      <div className="flex gap-2 [&>*]:flex-1">
        <Field
          label="Час приготування, хв"
          type="number"
          min={0}
          step={1}
          placeholder="—"
          value={draft.prepTime}
          onChange={(e) => patch({ prepTime: e.target.value })}
        />
        <Field
          label="Порції"
          type="number"
          min={1}
          step={1}
          placeholder="—"
          value={draft.servings}
          onChange={(e) => patch({ servings: e.target.value })}
        />
      </div>

      <label className="block text-sm text-muted">
        Фото{draft.photo ? ' · обрано' : " · необов'язково"}
        <input
          type="file"
          accept="image/*"
          className="mt-1 block w-full text-sm text-muted"
          onChange={(e) => void pick(e.target.files?.[0])}
        />
      </label>
      {draft.photo ? (
        <div className="mt-1.5">
          <Button onClick={() => patch({ photo: null })}>Прибрати фото</Button>
        </div>
      ) : null}

      {error ? <Warn>{error}</Warn> : null}

      <div className="mt-3.5 flex gap-2">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          Зберегти
        </Button>
        <Button disabled={busy} onClick={onDone}>
          Скасувати
        </Button>
      </div>
    </>
  )
}
