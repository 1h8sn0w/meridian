import { createFileRoute } from '@tanstack/react-router'
import { RequireLocalDb } from '../components/RequireLocalDb'
import { TodayScreen } from '../components/TodayScreen'

export const Route = createFileRoute('/')({ component: Today })

function Today() {
  return (
    <RequireLocalDb title="Сьогодні">
      {(familyId) => <TodayScreen familyId={familyId} />}
    </RequireLocalDb>
  )
}
