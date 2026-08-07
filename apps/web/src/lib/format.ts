/**
 * Підписи інтерфейсу українською (MER-49).
 *
 * Тут лише форматування для показу. Усе, що вирішує, ЧИ показувати значення
 * («є воно в джерелі» / «≈» / секція БЖВ), живе в `@meridian/core` —
 * дублювати правило провенансу в UI не можна, бо копії розходяться.
 */

/** Українська множина: 1 страва, 2–4 страви, 5+ страв (pluralUk із V1). */
export function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

/** Ключ дати «YYYY-MM-DD» → локальна північ цієї дати (keyToDate із V1). */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** «Понеділок, 4 серп» — заголовок картки дня. */
export function formatDayTitle(key: string): string {
  const text = dateFromKey(key).toLocaleDateString('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** «понеділок, 4 серпня» — підзаголовок екрана «Сьогодні». */
export function formatToday(now: Date): string {
  return now.toLocaleDateString('uk-UA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/**
 * «4 серпня о 18:42» — коли згенеровано план.
 *
 * Порожній рядок, якщо позначку не вдалося прочитати. `timestamptz` приїжджає з
 * реплікації текстом, і його форма («2026-08-04 18:42:00Z» замість ISO) залежить
 * від того, хто рядок записав — пристрій чи сервер. Пробіл між датою й часом
 * нормалізуємо; усе інше, чого `Date` не розібрав, показувати нічим — і
 * вигадувати дату не можна.
 */
export function formatMoment(value: string): string {
  const iso = value.includes('T') ? value : value.replace(' ', 'T')
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const day = date.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
  })
  const time = date.toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return day + ' о ' + time
}

/**
 * Грами макроса — «12,5 г».
 *
 * Калорій тут немає навмисно: їх форматує `formatCalories` з ядра, бо разом із
 * числом воно вирішує ще й «чи показувати» та «чи ставити ≈» (MER-26). Друга
 * копія цієї логіки в UI рано чи пізно розійшлася б із першою.
 */
export function grams(value: number): string {
  return value.toLocaleString('uk-UA') + ' г'
}
