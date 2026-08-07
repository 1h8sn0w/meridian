/**
 * Ручна заміна страви в слоті (MER-12, MER-28) — порт діалогу з V1.
 *
 * Правила рахує ядро (`suggestReplacements`), інтерфейс лише показує їх і
 * **блокує невалідних кандидатів**: зберегти невалідний тиждень ручною заміною
 * не можна (MER-28). Причини поруч із кожним — коридор, повтор, мікс, — щоб
 * заблокований рядок не виглядав поламаною кнопкою.
 *
 * Смак (MER-18) впливає лише на порядок і позначку: остаточний вибір за
 * користувачем, тож валідності він не змінює.
 *
 * Запис — один UPDATE рядка `plan_slot`, тобто рівно та одиниця, на якій
 * обіцяно last-write-wins (MER-46).
 */

import { useState } from 'react'
import { usePowerSync } from '@powersync/react'
import {
  MEAL_TYPE_LABELS,
  formatCalories,
  formatMealCalories,
  replaceSlot,
  suggestReplacements,
} from '@meridian/core'
import type { Meal, MealType, TastePrefs } from '@meridian/core'
import { toWeekPlan } from '../lib/data/model'
import type { DayView, WeekView } from '../lib/data/model'
import { replaceSlotMeal } from '../lib/data/mutations'
import { formatDayTitle } from '../lib/format'
import { Button, Empty, Sheet, Tag, Warn } from './ui'

export function SwapDialog({
  view,
  dayIndex,
  slot,
  pool,
  prefs,
  onClose,
}: {
  view: WeekView
  dayIndex: number
  slot: MealType
  pool: ReadonlyArray<Meal>
  prefs: TastePrefs
  onClose: () => void
}) {
  const db = usePowerSync()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // Через `.at()`, а не `days[dayIndex]`: індексний доступ у цьому пакеті
  // типізується як завжди визначений, а день за межами плану — цілком реальний
  // стан (тиждень могли перегенерувати коротшим, доки діалог відкритий).
  // Від'ємний індекс відсікаємо самі: `.at(-1)` віддав би останній день.
  const day: DayView | undefined =
    dayIndex >= 0 ? view.days.at(dayIndex) : undefined
  const plan = toWeekPlan(view)
  const title = 'Замінити страву'

  if (!day) {
    return (
      <Sheet title={title} onClose={onClose}>
        <Warn>У плані немає такого дня — перегенеруйте тиждень.</Warn>
      </Sheet>
    )
  }

  // MER-33: прожитий день — незмінна історія.
  if (day.isPast) {
    return (
      <Sheet title="Минулий день" onClose={onClose}>
        <Warn>
          Це вже прожитий день — історія незмінна. Заміна доступна лише для
          сьогодні й майбутніх днів.
        </Warn>
      </Sheet>
    )
  }

  if (!plan) {
    return (
      <Sheet title={title} onClose={onClose}>
        <Warn>
          У плані є слоти, страву яких видалено з пулу. Поки їх не стало, заміна
          рахувала б коридор дня за неповними даними — перегенеруйте тиждень.
        </Warn>
      </Sheet>
    )
  }

  const result = suggestReplacements(pool, plan, dayIndex, slot, prefs)
  if (!result.ok) {
    return (
      <Sheet title={title} onClose={onClose}>
        <Warn>{result.error}</Warn>
      </Sheet>
    )
  }

  /* MER-26: прогноз дня показуємо з «≈», якщо приблизний хоч один слот, який
   * лишається на місці, — або сам кандидат. */
  const otherApprox = Object.entries(plan.days[dayIndex]?.meals ?? {}).some(
    ([type, meal]) => type !== slot && meal.caloriesApprox,
  )

  const apply = async (meal: Meal) => {
    setBusy(true)
    setFailure(null)
    const next = replaceSlot(plan, dayIndex, slot, meal)
    if (!next.ok) {
      setFailure(next.error)
      setBusy(false)
      return
    }
    const slotId = day.byType[slot]?.id
    if (!slotId) {
      setFailure('Слот дня не знайдено — перегенеруйте тиждень.')
      setBusy(false)
      return
    }
    try {
      await replaceSlotMeal(db, {
        slotId,
        mealId: meal.id,
        weekPlanId: view.id,
        plan: next.plan,
      })
      onClose()
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error))
      setBusy(false)
    }
  }

  return (
    <Sheet
      title={MEAL_TYPE_LABELS[slot] + ' · ' + formatDayTitle(day.date)}
      onClose={onClose}
    >
      <p className="mb-1.5 mt-0 text-sm leading-normal text-muted">
        Зараз: «{result.current.name}»
        {formatMealCalories(result.current)
          ? ' — ' + formatMealCalories(result.current)
          : ''}
        . Ціль {result.target} ± {result.corridor} ккал/день.
      </p>

      {result.candidates.length === 0 ? (
        <Empty>
          Немає інших страв типу «{MEAL_TYPE_LABELS[slot]}» у пулі. Додайте їх
          на екрані «Страви».
        </Empty>
      ) : null}

      {result.candidates.map((candidate) => (
        <button
          key={candidate.meal.id}
          type="button"
          disabled={!candidate.valid || busy}
          onClick={() => void apply(candidate.meal)}
          className="flex w-full cursor-pointer items-center justify-between gap-2.5 border-0 border-b border-line bg-transparent px-0 py-2.5 text-left last:border-b-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="min-w-0 flex-auto">
            <span className="block text-sm">
              {candidate.meal.name}{' '}
              {candidate.favorite ? <Tag tone="accent">♥ улюблене</Tag> : null}
              {candidate.disliked ? (
                <Tag tone="warn">🚫 не подобається</Tag>
              ) : null}
              {candidate.reasons.map((reason) => (
                <Tag key={reason}>{reason}</Tag>
              ))}
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              {formatMealCalories(candidate.meal)}
              {candidate.meal.source ? ' · ' + candidate.meal.source : ''}
            </span>
          </span>
          <span
            className={`whitespace-nowrap text-xs ${
              candidate.withinCorridor ? 'text-success' : 'text-warning'
            }`}
          >
            день →{' '}
            {formatCalories(
              candidate.dayCalories,
              otherApprox || candidate.meal.caloriesApprox,
            )}
            {candidate.withinCorridor ? ' ✓' : ''}
          </span>
        </button>
      ))}

      {result.candidates.length && !result.candidates.some((c) => c.valid) ? (
        <p className="mb-0 mt-2 text-sm leading-normal text-muted">
          Жодна заміна не лишає тиждень валідним — усі кандидати порушують
          коридор, антиповтор або мікс планів.
        </p>
      ) : null}

      {failure ? <Warn>{failure}</Warn> : null}

      <Button block onClick={onClose}>
        Скасувати
      </Button>
    </Sheet>
  )
}
