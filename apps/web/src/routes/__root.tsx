import { useEffect } from 'react'
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import appCss from '../styles.css?url'
import { getPublicEnv } from '../lib/public-env'
import { AuthProvider } from '../lib/auth'
import { SyncProvider } from '../lib/powersync/provider'
import { AppGate } from '../components/AppGate'

export const Route = createRootRoute({
  // Публічний конфіг береться рантаймом сервера й приїжджає в браузер разом із
  // розміткою — щоб один образ їхав на будь-який self-host без перезбірки
  // (MER-45, обґрунтування — в src/lib/public-env.ts).
  loader: () => getPublicEnv(),
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        // Свідомо БЕЗ `viewport-fit=cover`. Він розтягує viewport під вирізи —
        // і тоді безпечні поля треба відбивати руками з усіх боків, зокрема
        // згори, де липка шапка лягла б під системну смугу. Токени
        // --spacing-safe-bottom / --spacing-tabbar (styles.css) від цього не
        // страждають: без `cover` `env(safe-area-inset-*)` дорівнює нулю саме
        // тому, що ці поля вже відрізав браузер.
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Meridian',
      },
      // PWA (MER-51). Колір той самий, що --color-app: у standalone ним
      // фарбується системна смуга, і будь-яка інша цифра дала б шов.
      {
        name: 'theme-color',
        content: '#0f1115',
      },
      // iOS маніфест не читає — режим і заголовок для нього задаються метами.
      {
        name: 'mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-capable',
        content: 'yes',
      },
      {
        name: 'apple-mobile-web-app-title',
        content: 'Меридіан',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
      {
        rel: 'manifest',
        href: '/manifest.webmanifest',
      },
      {
        rel: 'icon',
        type: 'image/png',
        sizes: '192x192',
        href: '/icons/icon-192.png',
      },
      {
        rel: 'apple-touch-icon',
        href: '/icons/apple-touch-icon.png',
      },
    ],
  }),
  shellComponent: RootDocument,
  // Стан входу перевіряється один раз для всіх маршрутів (MER-49): екрани
  // застосунку рендеряться лише тоді, коли є сесія й сім'я.
  component: AppGate,
})

/**
 * Реєстрація service worker (MER-51).
 *
 * У розробці воркера немає навмисно: він кешує оболонку, а `pnpm dev` тим і
 * цінний, що віддає щоразу свіжий модуль. Зареєстрований у dev воркер пережив
 * би й перемикання гілок — і потім довго пояснював би собою «чому зміна не
 * видно».
 *
 * Помилку реєстрації ковтати не можна, але й гасити через неї застосунок теж:
 * без воркера він цілком робочий, просто без офлайн-оболонки.
 */
function useServiceWorker() {
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Не вдалося зареєструвати service worker:', error)
    })
  }, [])
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const env = Route.useLoaderData()

  useServiceWorker()

  return (
    <html lang="uk">
      <head>
        <HeadContent />
      </head>
      <body className="bg-app font-sans text-content">
        {/* Синхронізація — усередині входу: вона живе з токена, і без нього
            їй нічого робити (MER-46). */}
        <AuthProvider env={env}>
          <SyncProvider env={env}>{children}</SyncProvider>
        </AuthProvider>
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}
