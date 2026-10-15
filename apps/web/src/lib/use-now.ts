import { useEffect, useState } from 'react'

const TICK_MS = 30_000

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  return now
}

export function minutesOf(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}
