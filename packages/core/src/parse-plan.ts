import type { Ingredient, MealType, Portion, PortionLetter } from './types.ts'

const SLOT_TYPES: Readonly<Record<string, MealType>> = {
  сніданок: 'breakfast',
  обід: 'lunch',
  вечеря: 'dinner',
  десерт: 'snack',
}

type PlanEntryKind = 'meal' | 'repeat' | 'dup'

export type PlanFlag = 'dessert-split' | 'dup' | 'no-kcal'

type PortionCalories = Record<PortionLetter, number | null>

export type PlanEntry = {
  kind: PlanEntryKind
  type: MealType
  name: string
  day: number | null
  week: number | null
  source: string
  calories: PortionCalories
  ingredients: Array<Ingredient>
  steps: Array<string>
  servings: number | null
  portions: Array<Portion>
  raw: Array<string>
  flags: Array<PlanFlag>
}

type PlanStats = {
  weeks: number
  days: number
  meals: number
  repeats: number
  dups: number
}

export type PlanParse = { entries: Array<PlanEntry>; stats: PlanStats }

const STARTERS: ReadonlyArray<RegExp> = [
  /^ТИЖДЕНЬ\s+\d+/i,
  /^День\s+\d+/i,
  /^(Сніданок|Обід|Вечеря|Десерт)\s*(:|$)/i,
  /^На 2-х[^:]*:/i,
  /^Готова порція/i,
]

function toLogicalLines(text: string): Array<string> {
  const lines: Array<string> = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, ' ').trim()
    if (!line || /^=+\s*PAGE/i.test(line)) continue
    const isStarter = STARTERS.some((re) => re.test(line))
    const isContinuation =
      !isStarter &&
      lines.length > 0 &&
      (/^[a-zа-яіїєґ0-9(≈~+;,.%–-]/.test(line) || /^[ЖЧ]\s*[-–]/.test(line))
    if (isContinuation) lines[lines.length - 1] += ' ' + line
    else lines.push(line)
  }
  return lines
}

function structureIngredient(item: string): Ingredient {
  const m = /^(\d+(?:[.,]\d+)?)\s*(кг|мл|г|л)\s+(.+)$/.exec(item)
  if (!m) return item
  return {
    name: group(m, 3).trim(),
    amount: Number(group(m, 1).replace(',', '.')),
    unit: group(m, 2),
  }
}

function group(m: RegExpExecArray, index: number): string {
  return m[index] ?? ''
}

const portionKcal = (label: string) =>
  new RegExp(
    `(?:^|[\\s|:;,])(?:${label})\\s*[:–—-]\\s*[~≈]?\\s*(\\d+(?:[.,]\\d+)?)\\s*ккал(?!\\s*/)`,
  )

const PORTION_KCAL: ReadonlyArray<[PortionLetter, RegExp]> = [
  ['Ж', portionKcal('Жінка|Ж')],
  ['Ч', portionKcal('Чоловік|Ч')],
]

function portionCalories(line: string): Partial<PortionCalories> | null {
  if (/^(Всього|Разом)/i.test(line)) return null
  const found: Partial<PortionCalories> = {}
  for (const [letter, re] of PORTION_KCAL) {
    const m = re.exec(line)
    if (m) found[letter] = Number(group(m, 1).replace(',', '.'))
  }
  return Object.keys(found).length ? found : null
}

function splitIngredients(body: string): Array<string> {
  const parts = body.includes(';') ? body.split(';') : body.split(/\s\+\s/)
  return parts.map((s) => s.trim()).filter((s) => s.length > 0)
}

function extractInlineKcal(text: string): {
  name: string
  calories: number | null
} {
  const m = /(\d+(?:[.,]\d+)?)\s*ккал/i.exec(text)
  if (!m) return { name: text.trim(), calories: null }
  const calories = Number(group(m, 1).replace(',', '.'))
  const name = text
    .replace(m[0], ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[\s—–,;:.-]+$/g, '')
    .trim()
  return { name: name || text.trim(), calories }
}

export function planEntryKey(name: string, type: MealType): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim() + '|' + type
}

export function parsePlanText(text: string): PlanParse {
  const lines = toLogicalLines(text)
  const entries: Array<PlanEntry> = []
  let week: number | null = null
  let day: number | null = null
  let entry: PlanEntry | null = null
  let component: string | null = null
  let portionKcalSeen = false

  const close = () => {
    if (entry) entries.push(entry)
  }

  const make = (
    type: MealType,
    name: string,
    kind: PlanEntryKind,
    rawFirst: string,
  ): PlanEntry => {
    portionKcalSeen = false
    return {
      kind,
      type,
      name,
      day,
      week,
      source: week ? 'Тиждень ' + week : '',
      calories: { Ж: null, Ч: null },
      ingredients: [],
      steps: [],
      servings: null,
      portions: [],
      raw: [rawFirst],
      flags: [],
    }
  }

  for (const line of lines) {
    let m = /^ТИЖДЕНЬ\s+(\d+)/i.exec(line)
    if (m) {
      close()
      entry = null
      week = Number(group(m, 1))
      continue
    }
    m = /^День\s+(\d+)/i.exec(line)
    if (m) {
      close()
      entry = null
      day = Number(group(m, 1))
      continue
    }

    m = /^(Сніданок|Обід|Вечеря|Десерт)\s*(?::\s*(.*))?$/i.exec(line)
    if (m) {
      const type = SLOT_TYPES[group(m, 1).toLowerCase()]
      if (!type) continue
      const rest = group(m, 2).trim()

      if (!rest || /^т(ой|а|е)\s+сам/i.test(rest)) {
        close()
        component = null
        entry = make(type, rest, 'repeat', line)
        continue
      }

      if (type === 'snack') {
        const dashIdx = rest.indexOf(' - ')
        const dotIdx = rest.indexOf('. ')
        let cut = rest.length
        if (dashIdx >= 0) cut = dashIdx
        if (dotIdx >= 0 && dotIdx < cut) cut = dotIdx
        close()
        component = null
        entry = make(
          type,
          rest.slice(0, cut).replace(/\.+$/, '').trim(),
          'meal',
          line,
        )
        const kcal = /(\d+(?:[.,]\d+)?)\s*ккал/i.exec(rest)
        if (kcal) entry.calories.Ч = Number(group(kcal, 1).replace(',', '.'))
        if (cut < rest.length) {
          entry.flags.push('dessert-split')
        }
        continue
      }

      const parsed = extractInlineKcal(rest)
      close()
      component = null
      entry = make(type, parsed.name, 'meal', line)
      entry.calories.Ч = parsed.calories
      continue
    }

    if (!entry) continue
    const current: PlanEntry = entry
    current.raw.push(line)

    m = /^На 2-х[^:]*:\s*(.*)$/i.exec(line)
    if (m) {
      if (current.kind !== 'meal') continue
      const body = group(m, 1).trim()
      if (!body || /^[-–—]+$/.test(body)) continue
      current.servings = 2
      for (const item of splitIngredients(body)) {
        current.ingredients.push(structureIngredient(item))
      }
      continue
    }

    m = /^Готова порція\s*:?\s*(.*)$/i.exec(line)
    if (m) {
      const portion = group(m, 1).trim()
      if (current.kind === 'meal' && portion) {
        current.portions.push({ component, text: portion })
        component = null
      }
      continue
    }

    if (current.kind !== 'meal') continue
    const byPortion = portionKcalSeen ? null : portionCalories(line)
    if (byPortion) {
      portionKcalSeen = true
      current.calories = { ...current.calories, ...byPortion }
      continue
    }
    if (/\.\s*$/.test(line)) current.steps.push(line)
    else component = line
  }
  close()

  const seen = new Set<string>()
  for (const e of entries) {
    if (e.kind !== 'meal' || !e.name) continue
    const key = planEntryKey(e.name, e.type)
    if (seen.has(key)) {
      e.kind = 'dup'
      e.flags.push('dup')
    } else {
      seen.add(key)
    }
  }

  for (const e of entries) {
    if (e.kind === 'meal' && e.calories.Ж === null && e.calories.Ч === null) {
      e.flags.push('no-kcal')
    }
  }

  const numbers = (pick: (e: PlanEntry) => number | null) =>
    new Set(entries.map(pick).filter((v): v is number => v !== null)).size

  return {
    entries,
    stats: {
      weeks: numbers((e) => e.week),
      days: numbers((e) => e.day),
      meals: entries.filter((e) => e.kind === 'meal').length,
      repeats: entries.filter((e) => e.kind === 'repeat').length,
      dups: entries.filter((e) => e.kind === 'dup').length,
    },
  }
}
