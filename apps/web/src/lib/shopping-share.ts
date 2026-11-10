import { SHOPPING_CATEGORIES } from '@meridian/core'
import type { ShoppingItem } from '@meridian/core'
import type { ShoppingExtra } from './data/model.ts'
import { intlLocale, messages } from './i18n/locale.ts'

export function categoryLabel(category: { id: string; label: string }): string {
  return messages().shopping.category[category.id] ?? category.label
}

export function amountText(item: ShoppingItem): string {
  if (item.amount === null) return ''
  return (
    item.amount.toLocaleString(intlLocale()) +
    (item.unit ? ' ' + item.unit : '')
  )
}

function line(item: ShoppingItem): string {
  const qty = amountText(item)
  return `• ${item.name}${qty ? ' — ' + qty : ''}`
}

export function shoppingListText({
  range,
  withQty,
  noQty,
  checks,
  extras = [],
}: {
  range: string
  withQty: ReadonlyArray<ShoppingItem>
  noQty: ReadonlyArray<ShoppingItem>
  checks: ReadonlyMap<string, boolean>
  extras?: ReadonlyArray<ShoppingExtra>
}): string {
  const left = (items: ReadonlyArray<ShoppingItem>) =>
    items.filter((item) => checks.get(item.key) !== true)
  const counted = left(withQty)
  const uncounted = left(noQty)
  const own = extras.filter((extra) => !extra.checked)
  if (!counted.length && !uncounted.length && !own.length) return ''

  const t = messages()
  const blocks = [range ? t.titles.shopping + ' · ' + range : t.titles.shopping]
  for (const category of SHOPPING_CATEGORIES) {
    const inCategory = counted.filter((item) => item.category === category.id)
    if (!inCategory.length) continue
    blocks.push([categoryLabel(category), ...inCategory.map(line)].join('\n'))
  }
  if (uncounted.length) {
    blocks.push([t.shopping.noQty, ...uncounted.map(line)].join('\n'))
  }
  if (own.length) {
    blocks.push(
      [t.shopping.extra, ...own.map((extra) => '• ' + extra.name)].join('\n'),
    )
  }
  return blocks.join('\n\n')
}
