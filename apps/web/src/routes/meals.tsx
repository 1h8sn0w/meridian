import { createFileRoute } from '@tanstack/react-router'
import { MealsScreen } from '../components/MealsScreen'
import { RequireLocalDb } from '../components/RequireLocalDb'

export const Route = createFileRoute('/meals')({ component: Meals })

function Meals() {
  return (
    <RequireLocalDb title="Страви">
      {(familyId) => <MealsScreen familyId={familyId} />}
    </RequireLocalDb>
  )
}
