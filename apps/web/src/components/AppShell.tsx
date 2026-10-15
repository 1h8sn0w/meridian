import { useEffect, useState } from 'react'
import {
  Link,
  useElementScrollRestoration,
  useLocation,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  CalendarDots,
  CookingPot,
  Rows,
  SunHorizon,
  UsersThree,
} from '@phosphor-icons/react'
import { catchUpScroll } from '../lib/scroll-catch-up'
import { ScreenHeader } from './ui'

const TABS = [
  { to: '/', label: 'Сьогодні', icon: SunHorizon },
  { to: '/week', label: 'Тиждень', icon: Rows },
  { to: '/calendar', label: 'Календар', icon: CalendarDots },
  { to: '/meals', label: 'Страви', icon: CookingPot },
  { to: '/family', label: 'Сім’я', icon: UsersThree },
] as const

export function AppShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  useScrollCatchUp()
  const path = useLocation({ select: (location) => location.pathname })

  return (
    <>
      <ScreenHeader title={title} subtitle={subtitle} />

      <main className="stagger mx-auto max-w-screen-sm px-4 pb-app-content pt-4">
        {children}
      </main>

      <nav className="glass fixed inset-x-3 bottom-3 z-20 mx-auto flex h-16 max-w-md rounded-full p-1.5 mb-safe-bottom vt-dock">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            search={tab.to === path ? true : undefined}
            className="relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full text-xs no-underline transition-transform duration-300 ease-spring active:scale-90"
            activeProps={{ className: 'font-semibold text-accent' }}
            inactiveProps={{ className: 'font-medium text-muted' }}
            activeOptions={{ exact: tab.to === '/' }}
          >
            {({ isActive }) => (
              <>
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full bg-accent-soft vt-tab-pill"
                  />
                ) : null}
                <tab.icon
                  aria-hidden
                  size={22}
                  weight={isActive ? 'fill' : 'regular'}
                  className="relative"
                />
                <span className="relative leading-none">{tab.label}</span>
              </>
            )}
          </Link>
        ))}
      </nav>
    </>
  )
}

function useScrollCatchUp() {
  const restored =
    useElementScrollRestoration({ getElement: () => window })?.scrollY ?? 0
  const [target] = useState(restored)

  useEffect(() => (target > 0 ? catchUpScroll(target) : undefined), [target])
}
