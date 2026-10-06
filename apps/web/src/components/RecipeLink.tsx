/**
 * Посилання на рецепт страви — одне для всіх екранів, звідки його відкривають
 * (MER-63, MER-86). Разом із переходом воно кладе в стан історії адресу екрана,
 * з якого прийшли: за нею «Назад» на рецепті стає справжнім посиланням, а не
 * кнопкою без адреси.
 */

import { useCallback } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

declare module '@tanstack/react-router' {
  interface HistoryState {
    /** Адреса екрана, з якого відкрили рецепт. */
    recipeFrom?: string
  }
}

export function RecipeLink({
  mealId,
  className = 'text-content underline decoration-line decoration-2 underline-offset-4 transition-colors hover:decoration-accent',
  children,
}: {
  mealId: string
  className?: string
  children: ReactNode
}) {
  // Адресу беремо в момент переходу, і функція стабільна: `Link` пам'ятає свої
  // параметри, а на «Тижні» таких посилань десятки. `publicHref` — адреса, як її
  // бачить браузер (з базовим шляхом), бо «Назад» стає з неї звичайним `<a>`.
  const router = useRouter()
  const state = useCallback(
    () => ({ recipeFrom: router.latestLocation.publicHref }),
    [router],
  )
  return (
    <Link
      to="/recipe/$mealId"
      params={{ mealId }}
      state={state}
      className={className}
    >
      {children}
    </Link>
  )
}
