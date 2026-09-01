/**
 * Екран «Страви» (MER-49) — пул, з якого генератор збирає тиждень.
 *
 * Пул спільний для сім'ї, як і смаки: сім'я планує один раціон. Профіль може
 * бачити лише частину пулу (MER-21), але керується він тут цілком — інакше
 * страву, прибрану з одного профілю, ніхто не зміг би повернути.
 *
 * Позначки «♥» / «🚫» (MER-18) стоять просто в рядку списку: це не косметика,
 * а правило добору в генераторі, і ставити їх має бути так само легко, як
 * подивитися на страву.
 */

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { usePowerSync } from '@powersync/react'
import {
  MEAL_TYPES,
  MEAL_TYPE_LABELS,
  formatMealCalories,
} from '@meridian/core'
import type { Meal, MealType } from '@meridian/core'
import { prefOf, useMeals, useTastePrefs } from '../lib/data/queries'
import { setMealPref } from '../lib/data/mutations'
import { plural } from '../lib/format'
import { AppShell } from './AppShell'
import { MealForm } from './MealForm'
import { Button, Chip, Empty, Hint, Panel, Warn } from './ui'

type Filter = 'all' | MealType | 'favorite' | 'disliked'

export function MealsScreen({ familyId }: { familyId: string }) {
  const db = usePowerSync()
  const mealsRead = useMeals()
  const prefsRead = useTastePrefs()
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<{ meal: Meal | null } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const meals = mealsRead.data
  const prefs = prefsRead.data

  const shown = meals.filter((meal) => {
    if (filter === 'all') return true
    if (filter === 'favorite') return prefs.favorites.has(meal.id)
    if (filter === 'disliked') return prefs.disliked.has(meal.id)
    return meal.type === filter
  })

  const toggle = async (meal: Meal, value: 'favorite' | 'disliked') => {
    setFailure(null)
    try {
      const current = prefOf(prefs, meal.id)
      await setMealPref(db, familyId, meal.id, current === value ? null : value)
    } catch (cause) {
      setFailure(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const subtitle = meals.length
    ? meals.length +
      ' ' +
      plural(meals.length, 'страва', 'страви', 'страв') +
      ' у пулі'
    : 'Пул страв порожній'

  if (editing) {
    return (
      <AppShell title="Страви" subtitle={subtitle}>
        <MealForm
          meal={editing.meal}
          familyId={familyId}
          onDone={() => setEditing(null)}
        />
      </AppShell>
    )
  }

  const chips: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'all', label: 'Усі', count: meals.length },
    ...MEAL_TYPES.map((type) => ({
      id: type,
      label: MEAL_TYPE_LABELS[type],
      count: meals.filter((meal) => meal.type === type).length,
    })),
    ...(prefs.favorites.size
      ? [
          {
            id: 'favorite' as Filter,
            label: '♥ Улюблені',
            count: prefs.favorites.size,
          },
        ]
      : []),
    ...(prefs.disliked.size
      ? [
          {
            id: 'disliked' as Filter,
            label: '🚫 Небажані',
            count: prefs.disliked.size,
          },
        ]
      : []),
  ]

  return (
    <AppShell title="Страви" subtitle={subtitle}>
      {[...mealsRead.problems, ...prefsRead.problems].map((problem) => (
        <Warn key={problem}>{problem}</Warn>
      ))}

      <Panel>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <Chip
              key={chip.id}
              active={filter === chip.id}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
              {chip.count ? ' · ' + chip.count : ''}
            </Chip>
          ))}
        </div>

        <Button
          block
          variant="primary"
          onClick={() => setEditing({ meal: null })}
        >
          + Додати страву
        </Button>

        {failure ? <Warn>{failure}</Warn> : null}

        <div className="mt-3">
          {shown.length === 0 ? (
            <Empty>
              {filter === 'all'
                ? 'Поки що жодної страви. Додайте першу вручну — з плану дієтолога.'
                : filter === 'favorite'
                  ? 'Немає страв із позначкою «улюблене».'
                  : filter === 'disliked'
                    ? 'Немає страв із позначкою «не подобається».'
                    : 'Немає страв цього типу.'}
            </Empty>
          ) : null}

          {shown.map((meal) => {
            const taste = prefOf(prefs, meal.id)
            return (
              <div
                key={meal.id}
                className="flex items-center justify-between gap-2.5 border-b border-line py-2.5 last:border-b-0"
              >
                {/* Рядок веде на сторінку рецепта (MER-63): кроки, фото й
                    повний склад. Редагування самої страви лишається на «✎». */}
                <Link
                  to="/recipe/$mealId"
                  params={{ mealId: meal.id }}
                  className="min-w-0 flex-auto text-content no-underline"
                >
                  <div className="text-sm">{meal.name}</div>
                  <div className="mt-0.5 text-xs text-muted">
                    {MEAL_TYPE_LABELS[meal.type]}
                    {meal.source ? ' · ' + meal.source : ''}
                  </div>
                </Link>

                <div className="whitespace-nowrap text-sm text-accent">
                  {formatMealCalories(meal)}
                </div>

                <TasteButton
                  label="♥"
                  title="Улюблене"
                  on={taste === 'favorite'}
                  tone="accent"
                  onClick={() => void toggle(meal, 'favorite')}
                />
                <TasteButton
                  label="🚫"
                  title="Не подобається"
                  on={taste === 'disliked'}
                  tone="warn"
                  onClick={() => void toggle(meal, 'disliked')}
                />

                <button
                  type="button"
                  title="Редагувати"
                  aria-label={'Редагувати страву «' + meal.name + '»'}
                  onClick={() => setEditing({ meal })}
                  className="flex-none cursor-pointer rounded-lg border border-line bg-transparent px-2.5 py-1.5 text-sm leading-none text-muted"
                >
                  ✎
                </button>
              </div>
            )
          })}
        </div>
      </Panel>

      <Panel>
        <Hint>
          Улюблені страви частіше потрапляють у план, небажані — виключаються.
          Правила дієтолога (тип слота, коридор калорій, антиповтор і мікс
          планів) головніші за смак і ніколи ним не послаблюються.
        </Hint>
      </Panel>
    </AppShell>
  )
}

function TasteButton({
  label,
  title,
  on,
  tone,
  onClick,
}: {
  label: string
  title: string
  on: boolean
  tone: 'accent' | 'warn'
  onClick: () => void
}) {
  const look = on
    ? tone === 'accent'
      ? 'border-accent bg-accent-soft'
      : 'border-warning'
    : 'border-line opacity-50'
  return (
    <button
      type="button"
      title={title}
      aria-pressed={on}
      aria-label={title}
      onClick={onClick}
      className={`flex-none cursor-pointer rounded-lg border bg-transparent px-2 py-1.5 text-sm leading-none ${look}`}
    >
      {label}
    </button>
  )
}
