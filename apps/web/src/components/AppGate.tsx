import { useEffect, useRef } from 'react'
import { Outlet, useLocation } from '@tanstack/react-router'
import { useAuth } from '../lib/auth'
import { AuthScreen } from './AuthScreen'
import { FamilySetupScreen } from './FamilySetupScreen'
import { MealReminders } from './Reminders'
import { ReleaseGate } from './ReleaseGate'
import { StarterSeed } from './StarterSet'
import { AuthShell, Panel } from './ui'
import { RichText } from '../lib/i18n/rich-text'
import { useMessages } from '../lib/i18n/use-messages'

export function AppGate() {
  const { status, dismissReturnNotices } = useAuth()
  const t = useMessages()
  const path = useLocation({ select: (location) => location.pathname })
  const shownPath = useRef(path)

  useEffect(() => {
    if (shownPath.current === path) return
    shownPath.current = path
    dismissReturnNotices()
  }, [path, dismissReturnNotices])

  switch (status) {
    case 'not-configured':
      return (
        <AuthShell title="Meridian" subtitle={t.gate.notConfigured}>
          <Panel title={t.gate.noSupabase}>
            <p className="m-0 text-sm leading-normal text-muted">
              <RichText
                text={t.gate.serverMissing}
                parts={{
                  url: (
                    <code className="text-content">PUBLIC_SUPABASE_URL</code>
                  ),
                  key: (
                    <code className="text-content">
                      PUBLIC_SUPABASE_ANON_KEY
                    </code>
                  ),
                  readme: <code className="text-content">infra/README.md</code>,
                  dev: <code className="text-content">pnpm dev</code>,
                  example: (
                    <code className="text-content">apps/web/.env.example</code>
                  ),
                }}
              />
            </p>
          </Panel>
        </AuthShell>
      )
    case 'loading':
      return <AuthShell title="Meridian" subtitle={t.gate.loading} />
    case 'signed-out':
      return (
        <ReleaseGate>
          <AuthScreen />
        </ReleaseGate>
      )
    case 'no-family':
      return <FamilySetupScreen />
    case 'ready':
      return (
        <>
          <MealReminders />
          <StarterSeed />
          <Outlet />
        </>
      )
  }
}
