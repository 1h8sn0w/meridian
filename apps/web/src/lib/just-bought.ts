import { useCallback, useState } from 'react'

const JUST_BOUGHT_MS = 900

const NOTHING_JUST_BOUGHT: ReadonlySet<string> = new Set()

export function useJustBought() {
  const [justBought, setJustBought] =
    useState<ReadonlySet<string>>(NOTHING_JUST_BOUGHT)

  const markBought = useCallback((key: string) => {
    setJustBought((keys) => new Set(keys).add(key))
    window.setTimeout(
      () =>
        setJustBought((keys) => {
          const next = new Set(keys)
          next.delete(key)
          return next
        }),
      JUST_BOUGHT_MS,
    )
  }, [])

  return { justBought, markBought }
}

export function splitBought<TItem>(
  items: ReadonlyArray<TItem>,
  isChecked: (item: TItem) => boolean,
  keyOf: (item: TItem) => string,
  justBought: ReadonlySet<string>,
): { toBuy: Array<TItem>; bought: Array<TItem> } {
  const toBuy: Array<TItem> = []
  const bought: Array<TItem> = []
  for (const item of items) {
    if (isChecked(item) && !justBought.has(keyOf(item))) bought.push(item)
    else toBuy.push(item)
  }
  return { toBuy, bought }
}
