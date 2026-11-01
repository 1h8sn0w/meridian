import { MACRO_FIELDS, hasValue } from '@meridian/core'
import type { DayMacros, MacroField, MacroSum, Profile } from '@meridian/core'
import { grams } from '../lib/format'
import { useMessages } from '../lib/i18n/use-messages'

export type MacroGoals = Pick<Profile, 'goalProtein' | 'goalFat' | 'goalCarbs'>

const GOAL_OF: Record<MacroField, keyof MacroGoals> = {
  protein: 'goalProtein',
  fat: 'goalFat',
  carbs: 'goalCarbs',
}

export function DayMacroTotals({
  macros,
  goals,
}: {
  macros: DayMacros
  goals: MacroGoals | null
}) {
  const messages = useMessages()
  const t = messages.dayMacros
  if (MACRO_FIELDS.every((field) => macros[field].known === 0)) return null
  const incomplete = MACRO_FIELDS.some(
    (field) => macros[field].known > 0 && macros[field].unknown > 0,
  )
  return (
    <section aria-label={t.label} className="mt-2">
      <div className="grid grid-cols-3 gap-2">
        {MACRO_FIELDS.map((field) => (
          <MacroCell
            key={field}
            label={messages.details[field]}
            sum={macros[field]}
            goal={goals?.[GOAL_OF[field]] ?? null}
          />
        ))}
      </div>
      {incomplete ? (
        <p className="mb-0 mt-2 text-xs text-muted">{t.incomplete}</p>
      ) : null}
    </section>
  )
}

function MacroCell({
  label,
  sum,
  goal,
}: {
  label: string
  sum: MacroSum
  goal: number | null
}) {
  const t = useMessages().dayMacros
  const known = sum.known > 0
  const hasGoal = hasValue(goal) && (goal as number) > 0
  const share = known && hasGoal ? Math.min(sum.total / (goal as number), 1) : 0
  return (
    <div className="rounded-2xl bg-app px-2.5 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
        {known ? (sum.approx ? '≈' : '') + grams(sum.total) : '—'}
      </div>
      {hasGoal ? (
        <>
          <div className="text-xs text-muted">
            {t.goal(grams(goal as number))}
          </div>
          <div
            aria-hidden
            className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full w-full origin-left bg-accent-fill transition-transform duration-700 ease-out-expo"
              style={{ transform: `scaleX(${share})` }}
            />
          </div>
        </>
      ) : null}
    </div>
  )
}
