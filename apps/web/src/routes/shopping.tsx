import { createFileRoute } from '@tanstack/react-router'
import { RequireLocalDb } from '../components/RequireLocalDb'
import { ShoppingScreen } from '../components/ShoppingScreen'

export const Route = createFileRoute('/shopping')({ component: Shopping })

function Shopping() {
  return (
    <RequireLocalDb title="Список покупок">
      {(familyId) => <ShoppingScreen familyId={familyId} />}
    </RequireLocalDb>
  )
}
