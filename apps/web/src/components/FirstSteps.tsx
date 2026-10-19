import { Link } from '@tanstack/react-router'
import type { PoolShortage } from '@meridian/core'
import { CheckCircle } from '@phosphor-icons/react'
import { useMessages } from '../lib/i18n/use-messages'
import { Button, Panel } from './ui'

export function FirstSteps({
  hasProfile,
  mealCount,
  shortage,
  onCreateProfile,
}: {
  hasProfile: boolean
  mealCount: number
  shortage: ReadonlyArray<PoolShortage>
  onCreateProfile: () => void
}) {
  const t = useMessages()
  const need = shortage[0]?.need ?? 0
  const steps = [
    {
      title: t.firstSteps.profile,
      text: hasProfile ? t.firstSteps.profileDone : t.firstSteps.profileText,
      done: hasProfile,
      action: (
        <Button block variant="primary" onClick={onCreateProfile}>
          {t.firstSteps.createProfile}
        </Button>
      ),
    },
    {
      title: t.firstSteps.meals,
      text: !mealCount
        ? t.firstSteps.mealsEmpty
        : shortage.length
          ? t.firstSteps.mealsShort(
              mealCount,
              need,
              shortage
                .map(({ type, have }) => t.common.mealType[type] + ': ' + have)
                .join(', '),
            )
          : t.firstSteps.mealsCount(mealCount),
      done: mealCount > 0 && shortage.length === 0,
      action: (
        <Link to="/meals" className="block no-underline">
          <Button block variant="primary">
            {t.firstSteps.openMeals}
          </Button>
        </Link>
      ),
    },
    {
      title: t.firstSteps.week,
      text: t.firstSteps.weekText,
      done: false,
      action: (
        <Link to="/week" className="block no-underline">
          <Button block variant="primary">
            {t.firstSteps.openWeek}
          </Button>
        </Link>
      ),
    },
  ]
  const current = steps.findIndex((step) => !step.done)

  return (
    <Panel title={t.firstSteps.title}>
      <ol className="m-0 list-none p-0">
        {steps.map((step, i) => (
          <li
            key={step.title}
            aria-current={i === current ? 'step' : undefined}
            className={`flex gap-3 border-b border-line py-3 first:pt-1 last:border-b-0 last:pb-0 ${i > current ? 'opacity-50' : ''}`}
          >
            {step.done ? (
              <CheckCircle
                weight="fill"
                size={28}
                className="flex-none text-success motion-safe:animate-pop"
                aria-hidden
              />
            ) : (
              <span
                aria-hidden
                className={`flex size-7 flex-none items-center justify-center rounded-full border font-mono text-sm font-semibold tabular-nums ${
                  i === current
                    ? 'border-transparent bg-accent-fill text-button-ink shadow-accent'
                    : 'border-line text-muted'
                }`}
              >
                {i + 1}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h3 className="m-0 text-base font-semibold tracking-tight">
                {step.title}
                {step.done ? (
                  <span className="sr-only">{t.firstSteps.done}</span>
                ) : null}
              </h3>
              <p className="mb-0 mt-0.5 text-sm leading-relaxed text-muted">
                {step.text}
              </p>
              {i === current ? <div className="mt-3">{step.action}</div> : null}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  )
}
