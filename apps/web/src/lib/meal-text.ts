import type { Ingredient, Portion, PortionLetter } from '@meridian/core'
import { intlLocale } from './i18n/locale.ts'

function ingredientLine(
  entry: Ingredient,
  amountText: (amount: number) => string,
): string {
  if (typeof entry === 'string') return entry
  const bits: Array<string> = []
  if (entry.amount !== undefined) bits.push(amountText(entry.amount))
  if (entry.unit) bits.push(entry.unit)
  return bits.length ? entry.name + ' — ' + bits.join(' ') : entry.name
}

export function ingredientLabel(entry: Ingredient): string {
  return ingredientLine(entry, (amount) => amount.toLocaleString(intlLocale()))
}

const AMOUNT_RE = /^(\d{1,3}(?:[ \u00A0]\d{3})+|\d+)((?:[.,]\d+)?)\s*(.*)$/

function ingredientFromLine(line: string): Ingredient | null {
  const value = line.trim()
  if (!value) return null
  const at = value.lastIndexOf(' — ')
  if (at < 1) return value
  const name = value.slice(0, at).trim()
  const qty = value.slice(at + 3).trim()
  if (!name || !qty) return value
  const match = AMOUNT_RE.exec(qty)
  if (!match) return { name, unit: qty }
  const out: Ingredient = {
    name,
    amount: Number(match[1].replace(/\D/g, '') + match[2].replace(',', '.')),
  }
  const unit = match[3].trim()
  if (unit) out.unit = unit
  return out
}

export function ingredientsToText(list: ReadonlyArray<Ingredient>): string {
  return list.map((entry) => ingredientLine(entry, String)).join('\n')
}

export function ingredientsFromText(text: string): Array<Ingredient> {
  return text
    .split('\n')
    .map(ingredientFromLine)
    .filter((x): x is Ingredient => x !== null)
}

const CHUNK_RE = /^([ЖЧ])\s*[-–—]/

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

export function portionLine(entry: Portion): string {
  return entry.component ? entry.component + ' — ' + entry.text : entry.text
}

function portionFromLine(line: string): Portion | null {
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
