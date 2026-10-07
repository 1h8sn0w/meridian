/**
 * «Перші кроки» (MER-89) — шлях нової сім'ї до першого тижня одною карткою на
 * «Сьогодні»: профіль → страви в пулі → тиждень. Раніше це були розрізнені
 * порожні стани, і про те, що генератору потрібні страви, людина дізнавалась
 * лише на «Тижні», коли кнопка вже не спрацювала.
 *
 * Дія — лише в першого незробленого кроку: порядок тут не рекомендація, а
 * залежність (тиждень збирається під профіль і з пулу). Тиждень за визначенням
 * не зроблено — щойно план є, екран показує поточну страву замість картки.
 */

import { Link } from '@tanstack/react-router'
import { CheckCircle } from '@phosphor-icons/react'
import { plural } from '../lib/format'
import { Button, Panel } from './ui'

export function FirstSteps({
  hasProfile,
  mealCount,
  onCreateProfile,
}: {
  hasProfile: boolean
  mealCount: number
  onCreateProfile: () => void
}) {
  const steps = [
    {
      title: 'Профіль',
      text: hasProfile
        ? 'Створено.'
        : 'Ціль калорійності, коридор і порція з плану дієтолога — під них генератор збирає тиждень.',
      done: hasProfile,
      action: (
        <Button block variant="primary" onClick={onCreateProfile}>
          Створити профіль
        </Button>
      ),
    },
    {
      title: 'Страви',
      text: mealCount
        ? `У пулі ${mealCount} ${plural(mealCount, 'страва', 'страви', 'страв')}.`
        : 'Стартовий набір, імпорт із PDF дієтолога або вручну.',
      done: mealCount > 0,
      action: (
        <Link to="/meals" className="block no-underline">
          <Button block variant="primary">
            Відкрити «Страви»
          </Button>
        </Link>
      ),
    },
    {
      title: 'Тиждень',
      text: 'Генератор збере тиждень із пулу, і тут з’явиться страва поточного прийому.',
      done: false,
      action: (
        <Link to="/week" className="block no-underline">
          <Button block variant="primary">
            Відкрити «Тиждень»
          </Button>
        </Link>
      ),
    },
  ]
  const current = steps.findIndex((step) => !step.done)

  return (
    <Panel title="Перші кроки">
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
                <span className="sr-only">
                  {step.done ? ' — зроблено' : ''}
                </span>
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
