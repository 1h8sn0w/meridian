import { createFileRoute } from '@tanstack/react-router'
import { FamilyScreen } from '../components/FamilyScreen'

export const Route = createFileRoute('/family')({ component: Family })

function Family() {
  return <FamilyScreen />
}
