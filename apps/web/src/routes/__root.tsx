import { createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import { AppGate } from '../components/AppGate'

// Стан входу перевіряється один раз для всіх маршрутів (MER-49): екрани
// застосунку рендеряться лише тоді, коли є сесія й сім'я. Розмітка сторінки —
// у `index.html`, провайдери — у `main.tsx`.
export const Route = createRootRoute({ component: Root })

function Root() {
  return (
    <>
      <AppGate />
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
    </>
  )
}
