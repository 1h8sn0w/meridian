export const LATEST_PLAN_ORDER =
  ' ORDER BY start_date DESC,' +
  " replace(substr(generated_at, 1, 19), ' ', 'T') DESC, id DESC LIMIT 1"

export const NO_DATE = '9999-12-31'

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ')
}

export function inList(ids: ReadonlyArray<string>): Array<string> {
  return ids.length ? [...ids] : ['']
}
