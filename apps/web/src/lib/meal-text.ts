/**
 * Інгредієнти й готові порції: об'єкт ↔ рядок форми (MER-49).
 *
 * Порт `Ingredients` і `Portions` із V1 — тієї їх частини, що потрібна
 * інтерфейсу. У `@meridian/core` цього немає навмисно: там домен, а це формат
 * вводу й показу.
 *
 * Правило одне на обидва напрямки: **нічого не добудовувати**. Немає кількості
 * в рядку — немає полів `amount`/`unit`, а не «0» і «шт». Не розкладається за
 * літерами Ж/Ч — показуємо текст дослівно, а не вгадуємо порцію (MER-24).
 */

import type { Ingredient, Portion, PortionLetter } from '@meridian/core'

/* ==========================================================================
 * Інгредієнти
 * ======================================================================== */

/** Назва й кількість окремо: кількість — null, якщо її в джерелі немає. */
export function ingredientParts(entry: Ingredient): {
  name: string
  qty: string | null
} {
  if (typeof entry === 'string') return { name: entry, qty: null }
  const bits: Array<string> = []
  if (entry.amount !== undefined)
    bits.push(entry.amount.toLocaleString('uk-UA'))
  if (entry.unit) bits.push(entry.unit)
  return { name: entry.name, qty: bits.length ? bits.join(' ') : null }
}

/** Плоский підпис для списків: «назва» або «назва — кількість». */
export function ingredientLabel(entry: Ingredient): string {
  const { name, qty } = ingredientParts(entry)
  return qty ? name + ' — ' + qty : name
}

/**
 * Рядок форми → інгредієнт. «гречка — 80 г» дає структуру, «овочі на вибір» —
 * просто назву. Порожній рядок — null (відкидається).
 */
export function ingredientFromLine(line: string): Ingredient | null {
  const value = line.trim()
  if (!value) return null
  const at = value.lastIndexOf(' — ')
  if (at < 1) return value
  const name = value.slice(0, at).trim()
  const qty = value.slice(at + 3).trim()
  if (!name || !qty) return value
  const match = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(qty)
  if (!match) return { name, unit: qty }
  const out: Ingredient = {
    name,
    amount: Number(match[1].replace(',', '.')),
  }
  const unit = match[2].trim()
  if (unit) out.unit = unit
  return out
}

/** Список ↔ текст поля вводу: по одному запису в рядку. */
export function ingredientsToText(list: ReadonlyArray<Ingredient>): string {
  return list.map(ingredientLabel).join('\n')
}

export function ingredientsFromText(text: string): Array<Ingredient> {
  return text
    .split('\n')
    .map(ingredientFromLine)
    .filter((x): x is Ingredient => x !== null)
}

/* ==========================================================================
 * Готові порції (MER-24)
 * ======================================================================== */

const CHUNK_RE = /^([ЖЧ])\s*[-–—]/

/**
 * «Ж - 130 г; Ч - 200 г» → для «Ч» дає дослівний шматок «Ч - 200 г».
 *
 * `null`, коли текст не розкладається за літерами або потрібної літери в ньому
 * немає: тоді інтерфейс показує весь текст дослівно. Це і є правило провенансу
 * на найдрібнішому рівні — краще зайвий рядок, ніж вигадана порція.
 */
export function portionForLetter(
  text: string,
  letter: PortionLetter,
): string | null {
  const chunks = text
    .split(/;\s*(?=[ЖЧ]\s*[-–—])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (!chunks.length || !chunks.every((c) => CHUNK_RE.test(c))) return null
  return chunks.find((c) => CHUNK_RE.exec(c)?.[1] === letter) ?? null
}

/** Рядок показу: «складник — текст» або просто текст. */
export function portionLine(entry: Portion): string {
  return entry.component ? entry.component + ' — ' + entry.text : entry.text
}

/**
 * Рядок форми → порція. Перше « — » ділить складник і текст, але «Ж — 130 г» —
 * це текст порції, а не складник із назвою «Ж».
 */
export function portionFromLine(line: string): Portion | null {
  const value = line.trim()
  if (!value) return null
  const at = value.indexOf(' — ')
  if (at < 1) return { component: null, text: value }
  const head = value.slice(0, at).trim()
  if (/^[ЖЧ]$/.test(head)) return { component: null, text: value }
  return { component: head, text: value.slice(at + 3).trim() }
}

export function portionsToText(list: ReadonlyArray<Portion>): string {
  return list.map(portionLine).join('\n')
}

export function portionsFromText(text: string): Array<Portion> {
  return text
    .split('\n')
    .map(portionFromLine)
    .filter((x): x is Portion => x !== null)
}
