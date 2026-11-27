export const STACK_NARROW = 2
export const STACK_WIDE = 3
export const SEARCH_FROM = 7

type Named = { id: string; name: string }

export function activeFirst<TProfile extends Named>(
  profiles: ReadonlyArray<TProfile>,
  activeId: string,
): Array<TProfile> {
  return [
    ...profiles.filter((p) => p.id === activeId),
    ...profiles.filter((p) => p.id !== activeId),
  ]
}

export function hiddenCount(total: number, shown: number): number {
  return Math.max(0, total - shown)
}

export function findProfiles<TProfile extends Named>(
  profiles: ReadonlyArray<TProfile>,
  query: string,
): Array<TProfile> {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) return [...profiles]
  return profiles.filter((p) => p.name.toLocaleLowerCase().includes(needle))
}
