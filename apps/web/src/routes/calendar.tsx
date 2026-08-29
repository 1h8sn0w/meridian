import { createFileRoute } from '@tanstack/react-router'
import { RequireLocalDb } from '../components/RequireLocalDb'
import { CalendarScreen } from '../components/CalendarScreen'

export const Route = createFileRoute('/calendar')({ component: Calendar })

function Calendar() {
  return (
    <RequireLocalDb title="Календар">{() => <CalendarScreen />}</RequireLocalDb>
  )
}
