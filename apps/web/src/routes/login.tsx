import { Navigate, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/login')({ component: SignedIn })

function SignedIn() {
  return <Navigate to="/" replace />
}
