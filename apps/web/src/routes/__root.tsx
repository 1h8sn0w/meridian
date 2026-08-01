import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import appCss from '../styles.css?url'
import { getPublicEnv } from '../lib/public-env'
import { AuthProvider } from '../lib/auth'

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
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Meridian',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const env = Route.useLoaderData()

  return (
    <html lang="uk">
      <head>
        <HeadContent />
      </head>
      <body className="bg-app font-sans text-content">
        <AuthProvider env={env}>{children}</AuthProvider>
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
