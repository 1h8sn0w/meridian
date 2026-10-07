import { createFileRoute } from '@tanstack/react-router'
import { parseCalendarSearch } from '../lib/calendar-search'
import { RequireLocalDb } from '../components/RequireLocalDb'
import { CalendarScreen } from '../components/CalendarScreen'

export const Route = createFileRoute('/calendar')({
  component: Calendar,
  validateSearch: parseCalendarSearch,
})

function Calendar() {
  return (
    <RequireLocalDb title="Календар">{() => <CalendarScreen />}</RequireLocalDb>
  )
}
