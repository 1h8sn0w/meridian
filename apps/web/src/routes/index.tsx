import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { AuthScreen } from '../components/AuthScreen'
import { FamilySetupScreen } from '../components/FamilySetupScreen'
import { FamilyScreen } from '../components/FamilyScreen'
import { Card, Notice, Screen } from '../components/ui'

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
        <Screen>
          <Card title="Meridian не налаштовано">
            <Notice tone="error">
              Сервер не знає адреси Supabase. Задайте{' '}
              <code>PUBLIC_SUPABASE_URL</code> і{' '}
              <code>PUBLIC_SUPABASE_ANON_KEY</code> — див.{' '}
              <code>infra/README.md</code>.
            </Notice>
          </Card>
        </Screen>
      )
    case 'loading':
      return (
        <Screen>
          <p className="text-sm text-muted">Хвилинку…</p>
        </Screen>
      )
    case 'signed-out':
      return <AuthScreen />
    case 'no-family':
      return <FamilySetupScreen />
    case 'ready':
      return <FamilyScreen />
  }
}
