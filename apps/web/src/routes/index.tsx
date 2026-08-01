import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { AuthScreen } from '../components/AuthScreen'
import { FamilySetupScreen } from '../components/FamilySetupScreen'
import { FamilyScreen } from '../components/FamilyScreen'
import { AuthShell, Panel } from '../components/ui'

export const Route = createFileRoute('/')({ component: Home })

/**
 * Стан входу вирішує, що показати (MER-45).
 *
 * Це один маршрут, а не три з гардами, навмисно: сесія живе на пристрої, тож
 * сервер під час SSR не знає, кого рендерить, і будь-який серверний редирект
 * був би вгадуванням. Головні екрани на нових даних — MER-49; тоді ж і буде
 * сенс у справжній структурі маршрутів.
 */
function Home() {
  const { status } = useAuth()

  switch (status) {
    case 'not-configured':
      return (
        <AuthShell title="Meridian" subtitle="Застосунок не налаштовано">
          <Panel title="Немає адреси Supabase">
            <p className="m-0 text-sm leading-normal text-muted">
              Сервер не отримав{' '}
              <code className="text-content">PUBLIC_SUPABASE_URL</code> і{' '}
              <code className="text-content">PUBLIC_SUPABASE_ANON_KEY</code>. Де
              їх узяти — в <code className="text-content">infra/README.md</code>
              ; для <code className="text-content">pnpm dev</code> — в{' '}
              <code className="text-content">apps/web/.env.example</code>.
            </p>
          </Panel>
        </AuthShell>
      )
    case 'loading':
      // Той самий каркас, що й далі, — щоб шапка не блимала при гідратації.
      return <AuthShell title="Meridian" subtitle="Хвилинку…" />
    case 'signed-out':
      return <AuthScreen />
    case 'no-family':
      return <FamilySetupScreen />
    case 'ready':
      return <FamilyScreen />
  }
}
