import { useCallback, useSyncExternalStore } from 'react'

const listeners = new Map<string, Set<() => void>>()

function subscribe(key: string, listener: () => void): () => void {
  const forKey = listeners.get(key) ?? new Set()
  listeners.set(key, forKey)
  forKey.add(listener)
  return () => forKey.delete(listener)
}

export function useStoredChoice(
  key: string,
): [string | null, (next: string | null) => void] {
  const stored = useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(key, listener), [key]),
    () => window.localStorage.getItem(key),
  )

  const write = useCallback(
    (next: string | null) => {
      if (next === null) window.localStorage.removeItem(key)
      else window.localStorage.setItem(key, next)
      for (const listener of listeners.get(key) ?? []) listener()
    },
    [key],
  )

  return [stored, write]
}
