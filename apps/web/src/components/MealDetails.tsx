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
import { useMessages } from '../lib/i18n/use-messages'

export function MealMarks({
  meal,
  block = false,
}: {
  meal: Meal
  block?: boolean
}) {
  const t = useMessages().details
  const issues = meal.sourceIssues.length
  if (!meal.gerd && !issues) return null
  const marks = (
    <>
      {meal.gerd ? <Tag>{t.gerd}</Tag> : null}
      {meal.gerd && issues ? ' ' : null}
      {issues ? (
        <Tag tone="warn">
          <WarningCircle
            weight="bold"
            size={12}
            role="img"
            aria-label={t.sourceIssue}
          />
        </Tag>
      ) : null}
    </>
  )
  return block ? <p className="mb-3 mt-0">{marks}</p> : marks
}

export function SourceIssues({ meal }: { meal: Meal }) {
  const t = useMessages().details
  if (!meal.sourceIssues.length) return null
  return (
    <div className="mt-4 flex gap-2 rounded-2xl bg-warning-soft px-3.5 py-2.5 text-sm leading-normal text-warning">
      <WarningCircle aria-hidden size={18} className="mt-px flex-none" />
      <div>
        <span className="font-medium">{t.sourceError}</span>
        {t.sourceErrorText}
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
  portion: PortionLetter | null
  hideEmpty?: boolean
}) {
  const t = useMessages().details
  return (
    <>
      {hasMacros(meal) ? (
        <div className="mt-4 flex gap-2">
          <Macro label={t.protein} value={meal.protein} />
          <Macro label={t.fat} value={meal.fat} />
          <Macro label={t.carbs} value={meal.carbs} />
        </div>
      ) : hideEmpty ? null : (
        <p className="mb-0 mt-2 text-sm text-muted">{t.noMacros}</p>
      )}

      {meal.ingredients.length ? (
        <>
          <SectionLabel>{t.ingredients}</SectionLabel>
          <ul className="mb-0 mt-1 list-disc pl-5 text-sm leading-relaxed marker:text-accent">
            {meal.ingredients.map((item, index) => (
              <li key={index} className="my-px">
                {ingredientLabel(item)}
              </li>
            ))}
          </ul>
        </>
      ) : hideEmpty ? null : (
        <p className="mb-0 mt-2 text-sm text-muted">{t.noIngredients}</p>
      )}

      {meal.portions.length ? (
        <>
          <SectionLabel>
            {t.portion}
            {portion ? ' · ' + portion : ''}
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
