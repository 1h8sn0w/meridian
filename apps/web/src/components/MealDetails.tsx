/**
 * Деталі страви на картці «Сьогодні» (MER-11, MER-24) — БЖВ, інгредієнти,
 * готова порція.
 *
 * Кожна секція існує рівно доти, доки для неї є дані. Рішення «показувати чи
 * ні» ухвалює ядро (`hasMacros`, `formatMacro`), а не цей файл: правило
 * провенансу має бути одне на застосунок, інакше копії розходяться й одна з них
 * колись покаже «0 г» замість «невідомо».
 */

import { hasMacros, hasValue } from '@meridian/core'
import type { Meal, PortionLetter } from '@meridian/core'
import { grams } from '../lib/format'
import {
  ingredientLabel,
  portionForLetter,
  portionLine,
} from '../lib/meal-text'
import { WarningCircle } from '@phosphor-icons/react'
import { SectionLabel, Tag } from './ui'

/**
 * Позначки страви з джерела, що стоять поруч із назвою: маркер ГЕРХ (MER-75) і
 * значок «у джерелі є розбіжність» (MER-76) — сам опис живе на сторінці
 * рецепта. Порожньо — нічого не рендериться, тож класти можна безумовно.
 */
export function MealMarks({ meal }: { meal: Meal }) {
  const issues = meal.sourceIssues.length
  if (!meal.gerd && !issues) return null
  return (
    <>
      {meal.gerd ? <Tag>ГЕРХ</Tag> : null}
      {meal.gerd && issues ? ' ' : null}
      {issues ? (
        <Tag tone="warn">
          <WarningCircle
            weight="bold"
            size={12}
            role="img"
            aria-label="У джерелі є розбіжність"
          />
        </Tag>
      ) : null}
    </>
  )
}

/**
 * Розбіжності в джерелі (MER-76) — дослівно, як їх записали. Правильного
 * значення тут немає й бути не може: його знає лише дієтолог.
 */
export function SourceIssues({ meal }: { meal: Meal }) {
  if (!meal.sourceIssues.length) return null
  /* Вигляд `Warn` з `ui.tsx`, але блоком: список усередині його `<p>` був би
   * невалідною розміткою. */
  return (
    <div className="mt-4 flex gap-2 rounded-2xl bg-warning-soft px-3.5 py-2.5 text-sm leading-normal text-warning">
      <WarningCircle aria-hidden size={18} className="mt-px flex-none" />
      <div>
        <span className="font-medium">Помилка в джерелі.</span> У плані
        дієтолога тут розбіжність, значення занесено як є:
        <ul className="mb-0 mt-1 list-disc pl-5">
          {meal.sourceIssues.map((issue, index) => (
            <li key={index}>{issue}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Macro({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex-1 rounded-2xl bg-app px-2 py-2.5 text-center">
      <div className="text-xs text-muted">{label}</div>
      {/* «—» всередині показаної секції — це пропуск, а не нуль (V1). Питання
          «чи значення справді є» вирішує `hasValue` з ядра, а не `!== null`. */}
      <div className="mt-0.5 font-mono text-base font-semibold tabular-nums">
        {hasValue(value) ? grams(value as number) : '—'}
      </div>
    </div>
  )
}

export function MealDetails({
  meal,
  portion,
  hideEmpty = false,
}: {
  meal: Meal
  /** Порційна літера активного профілю або null — тоді всі рядки дослівно. */
  portion: PortionLetter | null
  /**
   * Мовчати про те, чого в даних немає, замість рядка «не вказано» (MER-63).
   *
   * На «Сьогодні» це речення потрібне: там страва одна, і без нього незрозуміло,
   * чому картка коротка. На сторінці рецепта — ні: вона вся про склад страви, і
   * секція без даних там просто не показується.
   */
  hideEmpty?: boolean
}) {
  return (
    <>
      {hasMacros(meal) ? (
        <div className="mt-4 flex gap-2">
          <Macro label="Білки" value={meal.protein} />
          <Macro label="Жири" value={meal.fat} />
          <Macro label="Вуглеводи" value={meal.carbs} />
        </div>
      ) : hideEmpty ? null : (
        <p className="mb-0 mt-2 text-sm text-muted">БЖВ не вказано.</p>
      )}

      {meal.ingredients.length ? (
        <>
          <SectionLabel>Інгредієнти</SectionLabel>
          <ul className="mb-0 mt-1 list-disc pl-5 text-sm leading-relaxed marker:text-accent">
            {meal.ingredients.map((item, index) => (
              <li key={index} className="my-px">
                {ingredientLabel(item)}
              </li>
            ))}
          </ul>
        </>
      ) : hideEmpty ? null : (
        <p className="mb-0 mt-2 text-sm text-muted">Інгредієнти не вказані.</p>
      )}

      {/* MER-24: порція активного профілю або, без заданої літери, усі рядки
          дослівно. Немає порцій у даних — секції немає взагалі. */}
      {meal.portions.length ? (
        <>
          <SectionLabel>
            Готова порція{portion ? ' · ' + portion : ''}
          </SectionLabel>
          <ul className="mb-0 mt-1 list-disc pl-5 text-sm leading-relaxed marker:text-accent">
            {meal.portions.map((entry, index) => {
              const own = portion ? portionForLetter(entry.text, portion) : null
              return (
                <li key={index} className="my-px">
                  {own
                    ? (entry.component ? entry.component + ' — ' : '') + own
                    : portionLine(entry)}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </>
  )
}
