import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import { readPublicEnv } from './lib/public-env'
import { AuthProvider } from './lib/auth'
import { SyncProvider } from './lib/powersync/provider'
import { Sky, applySky, markClassicScrollbar } from './components/Sky'
import { DEFAULT_MEAL_WINDOWS } from './lib/day-clock'
import { MealWindowsProvider } from './lib/meal-windows'
import { minutesOf } from './lib/use-now'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles.css'

const router = createRouter({
  routeTree,
  scrollRestoration: true,
  defaultPreload: 'intent',
  defaultViewTransition: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const env = readPublicEnv()

applySky(minutesOf(new Date()), DEFAULT_MEAL_WINDOWS)
markClassicScrollbar()

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
    console.warn('Не вдалося зареєструвати service worker:', error)
  })
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <AuthProvider env={env}>
    <SyncProvider env={env}>
      <MealWindowsProvider>
        <Sky />
        <RouterProvider router={router} />
      </MealWindowsProvider>
    </SyncProvider>
  </AuthProvider>,
)
