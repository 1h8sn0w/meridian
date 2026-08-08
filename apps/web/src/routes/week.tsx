import { createFileRoute } from '@tanstack/react-router'
import { RequireLocalDb } from '../components/RequireLocalDb'
import { WeekScreen } from '../components/WeekScreen'

export const Route = createFileRoute('/week')({ component: Week })

function Week() {
  return (
    <RequireLocalDb title="Тиждень">
      {(familyId) => <WeekScreen familyId={familyId} />}
    </RequireLocalDb>
  )
}
