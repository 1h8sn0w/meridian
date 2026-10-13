import { derive } from './sync-ids.ts'
import type { Meal } from './types.ts'

type ShoppingCategory = { id: string; label: string }

export const SHOPPING_CATEGORIES: ReadonlyArray<ShoppingCategory> = [
  { id: 'veg', label: 'Овочі та зелень' },
  { id: 'fruit', label: 'Фрукти та ягоди' },
  { id: 'meat', label: "М'ясо та риба" },
  { id: 'dairy', label: 'Молочне та яйця' },
  { id: 'grain', label: 'Крупи та бобові' },
  { id: 'bread', label: 'Хліб' },
  { id: 'pantry', label: 'Бакалія та спеції' },
  { id: 'sweet', label: 'Солодощі' },
  { id: 'other', label: 'Інше' },
]

const CATEGORY_BY_NAME: ReadonlyMap<string, string> = new Map(
  (
    [
      [
        'veg',
        [
          'шпинат',
          'огірок',
          'кріп',
          'листя салату',
          'цвітна капуста',
          'картопля',
          'морква',
          'цибуля',
          'кабачок',
          'цукіні',
          'брокколі',
          'гарбуз',
          'перець',
          'зелень',
          'кріп і петрушка',
          'печений кабачок',
          'овочі на вибір (окрім томатів)',
          'огірок або листя салату',
          'морква або буряк',
        ],
      ],
      ['fruit', ['банан', 'авокадо', 'ягоди', 'ягоди (чорниця, малина)']],
      [
        'meat',
        [
          'куряче філе',
          'філе індички',
          'куряча печінка',
          'фарш індички',
          'яловичина',
          'курячі стегна без шкіри',
          'перепілки',
          'слабосолений лосось',
          'філе лосося',
          'креветки',
          "м'ясо мідій",
          'тунець у власному соку',
        ],
      ],
      [
        'dairy',
        [
          'яйця',
          'яйце',
          'яйця варені',
          'творожний сир 5%',
          'кисломолочний сир 5%',
          'кисломолочний сир 5–9%',
          'натуральний йогурт',
          'натуральний йогурт 2,5%',
          'вершки 10%',
          'сметана 15%',
          'вершкове масло',
          'вода або молоко 2,5%',
        ],
      ],
      [
        'grain',
        [
          'гречка',
          'кіноа',
          'ячна крупа',
          'нешліфований рис',
          'варений рис',
          'вівсяні пластівці',
          'пшоно',
          'перлова крупа',
          'червона сочевиця',
          'нут',
        ],
      ],
      ['bread', ['цільнозерновий хліб', 'рисові хлібці']],
      [
        'pantry',
        [
          'оливкова олія',
          'олія',
          'цукор',
          'ваніль',
          'куркума',
          'кмин',
          'лавровий лист',
          'сухі трави (розмарин, орегано)',
          'сухі трави (розмарин, чебрець)',
          'волоські горіхи',
          'арахісова паста',
          'вівсяне борошно',
          'рисове борошно',
        ],
      ],
      [
        'sweet',
        [
          'сирок «волошкове поле»',
          'банановий хліб (скибочка)',
          'пломбір зі згущеним молоком',
          'печиво матча',
        ],
      ],
      ['other', ['овочевий бульйон']],
    ] as ReadonlyArray<readonly [string, ReadonlyArray<string>]>
  ).flatMap(([category, names]) =>
    names.map((name) => [name, category] as const),
  ),
)

const CATEGORY_ORDER = new Map(
  SHOPPING_CATEGORIES.map((category, index) => [category.id, index]),
)

export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function categoryOf(name: string): string {
  return CATEGORY_BY_NAME.get(nameKey(name)) ?? 'other'
}

export type ShoppingItem = {
  key: string
  name: string
  category: string
  amount: number | null
  unit: string | null
}

type ShoppingItems = {
  withQty: Array<ShoppingItem>
  noQty: Array<ShoppingItem>
}

function bySection(a: ShoppingItem, b: ShoppingItem): number {
  const order =
    (CATEGORY_ORDER.get(a.category) ?? 0) -
    (CATEGORY_ORDER.get(b.category) ?? 0)
  return order !== 0 ? order : a.name.localeCompare(b.name, 'uk')
}

export function aggregate(meals: ReadonlyArray<Meal>): ShoppingItems {
  const withQty = new Map<string, ShoppingItem>()
  const noQty = new Map<string, ShoppingItem>()

  for (const meal of meals) {
    for (const entry of meal.ingredients) {
      const isText = typeof entry === 'string'
      const name = (isText ? entry : entry.name).trim()
      if (!name) continue

      const amount = isText ? undefined : entry.amount
      if (amount === undefined) {
        const key = 'n:' + nameKey(name)
        if (!noQty.has(key)) {
          noQty.set(key, {
            key,
            name,
            category: categoryOf(name),
            amount: null,
            unit: null,
          })
        }
        continue
      }

      const unit = (isText ? '' : (entry.unit ?? '')).trim()
      const key = 'q:' + nameKey(name) + '|' + unit.toLowerCase()
      const found = withQty.get(key)
      if (found) found.amount = (found.amount ?? 0) + amount
      else {
        withQty.set(key, {
          key,
          name,
          category: categoryOf(name),
          amount,
          unit: unit || null,
        })
      }
    }
  }

  return {
    withQty: [...withQty.values()].sort(bySection),
    noQty: [...noQty.values()].sort(bySection),
  }
}

type PlannedSlot = { slotId: string; mealId: string }

export function planFingerprint(slots: ReadonlyArray<PlannedSlot>): string {
  if (!slots.length) return ''
  return derive([
    'shopping_fingerprint',
    ...slots.map((slot) => slot.slotId + '~' + slot.mealId).sort(),
  ])
}
