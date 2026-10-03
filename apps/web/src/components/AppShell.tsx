/**
 * Каркас застосунку: шапка екрана + нижній док вкладок (MER-49).
 *
 * Форма та сама, що у V1: липка шапка з назвою екрана й підзаголовком, вміст у
 * колонці `max-w-screen-sm`, вкладки внизу (п'ять — після повернення
 * «Календаря», MER-61). Мобільний-first — застосунок відкривають із телефона за
 * столом, а не з ноутбука.
 *
 * До MER-49 екрани були трьома станами одного маршруту (MER-45), бо показувати
 * було нічого. Тепер їх видно з адреси: вкладка переживає перезавантаження й
 * кнопку «назад» без окремого `activeTab` у сховищі, як це було у V1.
 *
 * Док — скляна пігулка над краєм екрана. Підсвітка активної вкладки має
 * `view-transition-name`, тож при переході між екранами вона перелітає до
 * нової вкладки (styles.css), а сам док лишається нерухомим.
 */

import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import {
  CalendarDots,
  CookingPot,
  Rows,
  SunHorizon,
  UsersThree,
} from '@phosphor-icons/react'
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
            className="relative flex flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full text-xs no-underline transition-transform duration-300 ease-spring active:scale-90"
            // Колір вкладки задають ЛИШЕ ці два набори, а не базовий клас із
            // `text-muted` поверх якого дописується `text-accent`: у Tailwind
            // обидва утиліти лежать в одному шарі, тож виграв би не той, що
            // стоїть пізніше в атрибуті, а той, що пізніше в таблиці стилів —
            // і активна вкладка підсвічувалась би через раз.
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
                {/* Іконка декоративна — назва поруч. */}
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
