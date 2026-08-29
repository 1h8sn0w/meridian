/**
 * Каркас застосунку: шапка екрана + нижній таб-бар (MER-49).
 *
 * Форма та сама, що у V1: липка шапка з назвою екрана й підзаголовком, вміст у
 * колонці `max-w-screen-sm`, чотири вкладки внизу. Мобільний-first — застосунок
 * відкривають із телефона за столом, а не з ноутбука.
 *
 * До MER-49 екрани були трьома станами одного маршруту (MER-45), бо показувати
 * було нічого. Тепер їх видно з адреси: вкладка переживає перезавантаження й
 * кнопку «назад» без окремого `activeTab` у сховищі, як це було у V1.
 */

import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

const TABS = [
  { to: '/', label: 'Сьогодні', icon: '☀️' },
  { to: '/week', label: 'Тиждень', icon: '📅' },
  { to: '/calendar', label: 'Календар', icon: '🗓️' },
  { to: '/meals', label: 'Страви', icon: '🍽️' },
  { to: '/family', label: 'Сім’я', icon: '👥' },
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
      <header className="sticky top-0 z-10 border-b border-line bg-app px-4 pb-3 pt-5">
        <h1 className="m-0 text-xl">{title}</h1>
        {subtitle ? (
          <p className="mb-0 mt-1 text-sm text-muted">{subtitle}</p>
        ) : null}
      </header>

      <main className="mx-auto max-w-screen-sm px-4 pb-app-content pt-4">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex h-tabbar border-t border-line bg-surface pb-safe-bottom">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center gap-1 text-xs no-underline"
            // Колір вкладки задають ЛИШЕ ці два набори, а не базовий клас із
            // `text-muted` поверх якого дописується `text-accent`: у Tailwind
            // обидва утиліти лежать в одному шарі, тож виграв би не той, що
            // стоїть пізніше в атрибуті, а той, що пізніше в таблиці стилів —
            // і активна вкладка підсвічувалась би через раз.
            activeProps={{ className: 'text-accent' }}
            inactiveProps={{ className: 'text-muted' }}
            activeOptions={{ exact: tab.to === '/' }}
          >
            {/* Іконка декоративна — назва поруч, тож у дерево доступності її
                не пускаємо, інакше зчитувач прочитає емодзі двічі. */}
            <span aria-hidden className="text-xl leading-none">
              {tab.icon}
            </span>
            {tab.label}
          </Link>
        ))}
      </nav>
    </>
  )
}
