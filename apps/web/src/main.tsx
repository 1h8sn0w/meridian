/**
 * Вхід застосунку в браузері.
 *
 * Сервера застосунку немає: `index.html` і бандли віддає Caddy як статичні
 * файли, а три значення конфігу вписує в сам `index.html` (див.
 * `lib/public-env.ts`). Тож конфіг лежить на сторінці ще до першого рядка
 * цього модуля — читається синхронно, чекати на нього нема чого.
 */

import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { readPublicEnv } from './lib/public-env'
import { AuthProvider } from './lib/auth'
import { SyncProvider } from './lib/powersync/provider'
import './styles.css'

const router = createRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const env = readPublicEnv()

/* Service worker (MER-51) — лише в продакшн-збірці: він кешує оболонку, а
 * `pnpm dev` тим і цінний, що щоразу віддає свіжий модуль. Помилку реєстрації
 * не ковтаємо, але й застосунок через неї не гасимо: без воркера він робочий,
 * просто без офлайн-оболонки. */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
    console.warn('Не вдалося зареєструвати service worker:', error)
  })
}

createRoot(document.getElementById('root') as HTMLElement).render(
  // Синхронізація — усередині входу: вона живе з токена, і без нього їй нічого
  // робити (MER-46).
  <AuthProvider env={env}>
    <SyncProvider env={env}>
      <RouterProvider router={router} />
    </SyncProvider>
  </AuthProvider>,
)
