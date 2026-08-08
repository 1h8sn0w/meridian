/**
 * Що показати залежно від стану входу (MER-45, MER-49).
 *
 * До MER-49 це був один маршрут із трьома станами, бо після входу показувати
 * було нічого. Тепер станів входу так само чотири, але «увійшли й сім'я є» веде
 * не на екран, а в маршрути застосунку — тому перевірка переїхала в кореневий
 * маршрут і робиться один раз для всіх екранів.
 *
 * Гардів на сервері немає й не буде: сесія живе на пристрої, тож будь-який
 * серверний редирект був би вгадуванням (MER-45).
 */

import { Outlet } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { AuthScreen } from './AuthScreen'
import { FamilySetupScreen } from './FamilySetupScreen'
import { AuthShell, Panel } from './ui'

export function AppGate() {
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
      return <Outlet />
  }
}
