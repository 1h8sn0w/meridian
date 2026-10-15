import { useCallback } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import type { ReactNode } from 'react'

declare module '@tanstack/react-router' {
  interface HistoryState {
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
