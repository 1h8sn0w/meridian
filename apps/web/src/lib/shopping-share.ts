import { SHOPPING_CATEGORIES } from '@meridian/core'
import type { ShoppingItem } from '@meridian/core'

export function amountText(item: ShoppingItem): string {
  if (item.amount === null) return ''
  return (
    item.amount.toLocaleString('uk-UA') + (item.unit ? ' ' + item.unit : '')
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
}: {
  range: string
  withQty: ReadonlyArray<ShoppingItem>
  noQty: ReadonlyArray<ShoppingItem>
  checks: ReadonlyMap<string, boolean>
}): string {
  const left = (items: ReadonlyArray<ShoppingItem>) =>
    items.filter((item) => checks.get(item.key) !== true)
  const counted = left(withQty)
  const uncounted = left(noQty)
  if (!counted.length && !uncounted.length) return ''

  const blocks = [range ? `Список покупок · ${range}` : 'Список покупок']
  for (const category of SHOPPING_CATEGORIES) {
    const inCategory = counted.filter((item) => item.category === category.id)
    if (!inCategory.length) continue
    blocks.push([category.label, ...inCategory.map(line)].join('\n'))
  }
  if (uncounted.length) {
    blocks.push(['Без точної кількості', ...uncounted.map(line)].join('\n'))
  }
  return blocks.join('\n\n')
}
