/**
 * Розпізнавання тексту PDF-плану дієтолога (MER-15 → MER-52).
 *
 * Порт `PdfImport.parsePlanText` із V1 (`index.html`) — чиста функція, без
 * жодного знання про PDF, DOM чи базу. Читання самого файлу лишається у вебі
 * (`lib/pdf-text.ts`): pdf.js несе воркер і WASM, а ядро має лишатися
 * придатним до виклику з Node і з нативу.
 *
 * **Головне правило — провенанс (AGENTS.md).** Беремо лише те, що буквально є
 * в тексті:
 *
 *  - калорійність — тільки з «N ккал»; немає — `null`, і страва без ручного
 *    вводу в пул не потрапить (нуль тут був би вигадкою);
 *  - БЖВ не розпізнаються **ніколи**: «Ж» і «Ч» у плані — це порції Жінка/
 *    Чоловік, а не жири. Полів для них тут немає навмисно, щоб спокуси не було;
 *  - кількості інгредієнтів структуруються лише за однозначного «число +
 *    одиниця», решта лишається дослівним рядком;
 *  - «Готова порція: …» (MER-24) зберігається дослівно, без поділу на числа.
 *
 * Результат — кандидати, а не страви: кожен запис людина бачить поруч із сирим
 * текстом і підтверджує сама.
 */

import type { Ingredient, MealType, Portion } from './types.ts'

/** Український підпис слота → тип моделі. */
const SLOT_TYPES: Readonly<Record<string, MealType>> = {
  сніданок: 'breakfast',
  обід: 'lunch',
  вечеря: 'dinner',
  десерт: 'snack',
}

/**
 * Що робити із записом:
 *
 *  - `meal`   — страва-кандидат, типово позначена до імпорту;
 *  - `repeat` — «Той самий…»: страва попереднього дня, окремим рядком у пул не
 *    йде (у V1 такий запис навіть не можна було позначити);
 *  - `dup`    — назва вже трапилась вище в цьому ж тексті: позначити можна, але
 *    типово не імпортується.
 */
export type PlanEntryKind = 'meal' | 'repeat' | 'dup'

/** Сумнівне місце розбору — показується користувачеві як є. */
export type PlanFlag = { code: string; message: string }

export type PlanEntry = {
  kind: PlanEntryKind
  type: MealType
  name: string
  /** Номер дня з «День N»; null — до першого такого рядка. */
  day: number | null
  /** Номер тижня з «ТИЖДЕНЬ N»; null — до першого такого рядка. */
  week: number | null
  /** `meal.source` — план дієтолога («Тиждень 2»), а не провенанс. */
  source: string
  calories: number | null
  ingredients: Array<Ingredient>
  /** Дослівні нотатки приготування/подачі з плану. */
  steps: Array<string>
  /** 2 для страв «На 2-х»; null — у плані не сказано. */
  servings: number | null
  portions: Array<Portion>
  /** Усі рядки блоку як у PDF — щоб було з чим звіряти. */
  raw: Array<string>
  flags: Array<PlanFlag>
}

export type PlanStats = {
  weeks: number
  days: number
  meals: number
  repeats: number
  dups: number
}

export type PlanParse = { entries: Array<PlanEntry>; stats: PlanStats }

/** Рядки, що ПОЧИНАЮТЬ новий логічний блок (решта може бути перенесенням). */
const STARTERS: ReadonlyArray<RegExp> = [
  /^ТИЖДЕНЬ\s+\d+/i,
  /^День\s+\d+/i,
  /^(Сніданок|Обід|Вечеря|Десерт)\s*(:|$)/i,
  /^На 2-х[^:]*:/i,
  /^Готова порція/i,
]

/**
 * Фізичні рядки PDF мають жорсткі переноси посеред речень. Склеюємо:
 * продовженням вважаємо рядок, що починається з малої літери, цифри, дужки чи
 * розділового знака, а також «Ж -»/«Ч -» (порційні рядки).
 */
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

/**
 * «400 г цвітної капусти» → `{ name, amount, unit }` — лише коли кількість
 * однозначна (число + г/кг/мл/л). Діапазони, «≈», ложки, штуки тощо лишаються
 * дослівним рядком: нічого не переписуємо.
 */
function structureIngredient(item: string): Ingredient {
  const m = /^(\d+(?:[.,]\d+)?)\s*(кг|мл|г|л)\s+(.+)$/.exec(item)
  if (!m) return item
  return {
    name: group(m, 3).trim(),
    amount: Number(group(m, 1).replace(',', '.')),
    unit: group(m, 2),
  }
}

/**
 * Група збігу рядком. `noUncheckedIndexedAccess` вважає будь-який індекс
 * можливо-порожнім, а тут групи або обов'язкові, або порожній рядок і є
 * правильною відповіддю («Обід» без двокрапки).
 */
function group(m: RegExpExecArray, index: number): string {
  return m[index] ?? ''
}

/** Інгредієнти «На 2-х…»: у плані розділені «;» або « + ». */
function splitIngredients(body: string): Array<string> {
  const parts = body.includes(';') ? body.split(';') : body.split(/\s\+\s/)
  return parts.map((s) => s.trim()).filter((s) => s.length > 0)
}

/**
 * MER-41: inline «N ккал» у заголовку слота («Омлет — 500 ккал»), не лише в
 * десертах. Витягуємо калорійність і прибираємо її з назви. «Ж-/Ч-» — окремі
 * рядки-порції, сюди не потрапляють (це заголовок слота).
 */
function extractInlineKcal(text: string): {
  name: string
  calories: number | null
} {
  const m = /(\d+(?:[.,]\d+)?)\s*ккал/i.exec(text)
  if (!m) return { name: text.trim(), calories: null }
  const calories = Number(group(m, 1).replace(',', '.'))
  const name = text
    .replace(m[0], ' ')
    .replace(/\(\s*\)/g, ' ') // порожні дужки після вирізу
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[\s—–,;:.-]+$/g, '') // хвостовий роздільник
    .trim()
  return { name: name || text.trim(), calories }
}

/** Ключ дедуплікації: назва без регістру й зайвих пробілів + тип слота. */
export function planEntryKey(name: string, type: MealType): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim() + '|' + type
}

/** Розпізнати текст PDF-плану в список страв-кандидатів. */
export function parsePlanText(text: string): PlanParse {
  const lines = toLogicalLines(text)
  const entries: Array<PlanEntry> = []
  let week: number | null = null
  let day: number | null = null
  let entry: PlanEntry | null = null
  /** Назва складника — чекає свого рядка «Готова порція» (MER-24). */
  let component: string | null = null

  /**
   * Закрити поточний блок. Далі кожен виклик або починає новий запис, або
   * скидає `entry` у null — присвоєння лишається у видимому потоці функції, а
   * не ховається в замиканні: інакше компілятор не бачить, що запису може й не
   * бути (шапка документа до першого слота).
   */
  const close = () => {
    if (entry) entries.push(entry)
  }

  const make = (
    type: MealType,
    name: string,
    kind: PlanEntryKind,
    rawFirst: string,
  ): PlanEntry => ({
    kind,
    type,
    name,
    day,
    week,
    source: week ? 'Тиждень ' + week : '',
    calories: null,
    ingredients: [],
    steps: [],
    servings: null,
    portions: [],
    raw: [rawFirst],
    flags: [],
  })

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
      /* Недосяжно: регулярка ловить рівно ті чотири підписи, що є в словнику.
       * Перевірка тут лише щоб тип слота не довелося стверджувати касто́м. */
      if (!type) continue
      const rest = group(m, 2).trim()

      /* Порожній підпис слота або «Той самий / Та сама / те саме» — повтор
       * страви попереднього дня: у пул не додається, показується як довідка. */
      if (!rest || /^т(ой|а|е)\s+сам/i.test(rest)) {
        close()
        component = null
        entry = make(type, rest, 'repeat', line)
        entry.flags.push({
          code: 'repeat',
          message: 'Повтор страви попереднього дня — окрема страва вже є вище.',
        })
        continue
      }

      if (type === 'snack') {
        /* Десертний рядок: «назва - порція…» або «назва. далі…». Відділяємо
         * назву механічно; місце розрізу позначаємо на перевірку. */
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
        if (kcal) entry.calories = Number(group(kcal, 1).replace(',', '.'))
        if (cut < rest.length) {
          entry.flags.push({
            code: 'dessert-split',
            message: 'Назву відділено від опису порції — перевірте.',
          })
        }
        continue
      }

      // MER-41: сніданок/обід/вечеря — теж витягуємо inline-калорійність.
      const parsed = extractInlineKcal(rest)
      close()
      component = null
      entry = make(type, parsed.name, 'meal', line)
      if (parsed.calories !== null) entry.calories = parsed.calories
      continue
    }

    if (!entry) continue // шапка документа («МЕНЮ…») — поза стравами
    const current: PlanEntry = entry
    current.raw.push(line)

    m = /^На 2-х[^:]*:\s*(.*)$/i.exec(line)
    if (m) {
      if (current.kind !== 'meal') continue
      const body = group(m, 1).trim()
      if (!body || /^[-–—]+$/.test(body)) continue // «-» = без нових продуктів
      current.servings = 2 // дослівне «На 2-х» із плану «Для двох»
      for (const item of splitIngredients(body)) {
        current.ingredients.push(structureIngredient(item))
      }
      continue
    }

    /* MER-24: «Готова порція: Ж - …; Ч - …» — дослівно, з прив'язкою до
     * складника (рядок-назва перед «На 2-х…»). Поділ за літерами — при показі. */
    m = /^Готова порція\s*:?\s*(.*)$/i.exec(line)
    if (m) {
      const portion = group(m, 1).trim()
      if (current.kind === 'meal' && portion) {
        current.portions.push({ component, text: portion })
        component = null
      }
      continue
    }

    /* Нотатка приготування/подачі (речення з крапкою) — дослівно в кроки.
     * Рядки без крапки — назви складників: лишаються в сирому тексті і стають
     * прив'язкою для наступного рядка «Готова порція» (MER-24). */
    if (current.kind !== 'meal') continue
    if (/\.\s*$/.test(line)) current.steps.push(line)
    else component = line
  }
  close()

  /* Дублікати назв (десерти повторюються між днями): перша страва лишається,
   * наступні позначаються і типово не імпортуються. */
  const seen = new Set<string>()
  for (const e of entries) {
    if (e.kind !== 'meal' || !e.name) continue
    const key = planEntryKey(e.name, e.type)
    if (seen.has(key)) {
      e.kind = 'dup'
      e.flags.push({
        code: 'dup',
        message: 'Дублікат назви — така страва вже є вище.',
      })
    } else {
      seen.add(key)
    }
  }

  // Калорійності в плані здебільшого немає — чесно позначаємо (без вигадок).
  for (const e of entries) {
    if (e.kind === 'meal' && e.calories === null) {
      e.flags.push({
        code: 'no-kcal',
        message: 'У PDF немає калорійності — впишіть вручну, щоб додати в пул.',
      })
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
