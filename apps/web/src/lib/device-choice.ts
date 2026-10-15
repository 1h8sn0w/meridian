import { useCallback, useState } from 'react'

export function useStoredChoice(
  key: string,
): [string | null, (next: string | null) => void] {
  const [stored, setStored] = useState<string | null>(() =>
    window.localStorage.getItem(key),
  )

  const write = useCallback(
    (next: string | null) => {
      if (next === null) window.localStorage.removeItem(key)
      else window.localStorage.setItem(key, next)
      setStored(next)
    },
    [key],
  )

  return [stored, write]
}
