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
import { Check, Heart, Prohibit } from '@phosphor-icons/react'
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
      <p className="mb-3 mt-0 text-sm leading-relaxed text-muted">
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
          className="mb-1.5 flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-transparent bg-app px-3.5 py-3 text-left text-content transition duration-300 ease-spring hover:border-accent active:scale-98 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-transparent"
        >
          <span className="min-w-0 flex-auto">
            <span className="block text-sm font-medium leading-snug">
              {candidate.meal.name}{' '}
              {candidate.favorite ? (
                <Tag tone="accent">
                  <Heart aria-hidden size={12} weight="fill" />
                  улюблене
                </Tag>
              ) : null}
              {candidate.disliked ? (
                <Tag tone="warn">
                  <Prohibit aria-hidden size={12} weight="bold" />
                  не подобається
                </Tag>
              ) : null}
              {candidate.reasons.map((reason) => (
                <Tag key={reason}>{reason}</Tag>
              ))}
            </span>
            <span className="mt-1 block font-mono text-xs tabular-nums text-muted">
              {formatMealCalories(candidate.meal)}
              {candidate.meal.source ? ' · ' + candidate.meal.source : ''}
            </span>
          </span>
          <span
            className={`whitespace-nowrap rounded-full px-2.5 py-1 font-mono text-xs tabular-nums ${
              candidate.withinCorridor
                ? 'bg-success-soft text-success'
                : 'bg-warning-soft text-warning'
            }`}
          >
            день →{' '}
            {formatCalories(
              candidate.dayCalories,
              otherApprox || candidate.meal.caloriesApprox,
            )}
            {candidate.withinCorridor ? (
              <Check
                aria-hidden
                size={12}
                weight="bold"
                className="ml-1 inline align-middle"
              />
            ) : null}
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

      <div className="mt-3">
        <Button block onClick={onClose}>
          Скасувати
        </Button>
      </div>
    </Sheet>
  )
}
