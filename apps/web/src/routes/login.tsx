import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({ component: ToToday })

function ToToday() {
  return <Navigate to="/" replace />
}
