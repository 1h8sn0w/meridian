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
import { SectionLabel } from './ui'

function Macro({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex-1 rounded-xl border border-line bg-app px-2 py-2 text-center">
      <div className="text-xs text-muted">{label}</div>
      {/* «—» всередині показаної секції — це пропуск, а не нуль (V1). Питання
          «чи значення справді є» вирішує `hasValue` з ядра, а не `!== null`. */}
      <div className="mt-0.5 text-sm font-semibold">
        {hasValue(value) ? grams(value as number) : '—'}
      </div>
    </div>
  )
}

export function MealDetails({
  meal,
  portion,
}: {
  meal: Meal
  /** Порційна літера активного профілю або null — тоді всі рядки дослівно. */
  portion: PortionLetter | null
}) {
  return (
    <>
      {hasMacros(meal) ? (
        <div className="mt-2.5 flex gap-2">
          <Macro label="Білки" value={meal.protein} />
          <Macro label="Жири" value={meal.fat} />
          <Macro label="Вуглеводи" value={meal.carbs} />
        </div>
      ) : (
        <p className="mb-0 mt-2 text-sm text-muted">БЖВ не вказано.</p>
      )}

      {meal.ingredients.length ? (
        <>
          <SectionLabel>Інгредієнти</SectionLabel>
          <ul className="mb-0 mt-1 list-disc pl-5 text-sm leading-relaxed">
            {meal.ingredients.map((item, index) => (
              <li key={index} className="my-px">
                {ingredientLabel(item)}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-0 mt-2 text-sm text-muted">Інгредієнти не вказані.</p>
      )}

      {/* MER-24: порція активного профілю або, без заданої літери, усі рядки
          дослівно. Немає порцій у даних — секції немає взагалі. */}
      {meal.portions.length ? (
        <>
          <SectionLabel>
            Готова порція{portion ? ' · ' + portion : ''}
          </SectionLabel>
          <ul className="mb-0 mt-1 list-disc pl-5 text-sm leading-relaxed">
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
