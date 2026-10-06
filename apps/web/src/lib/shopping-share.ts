/**
 * Список покупок текстом (MER-85) — щоб передати його в месенджер тому, хто йде
 * в магазин без застосунку.
 *
 * Текст — це той самий список, що на екрані, а не новий: ті самі розділи в тому
 * самому порядку (його вже дав `aggregate` з ядра), ті самі кількості. Звідси два
 * правила:
 *
 *  - **лише ще не куплене.** Куплене в магазині не потрібне, а позначки спільні
 *    для сім'ї — тож текст показує рівно той лишок, який бачать усі телефони;
 *  - **кількість лише з джерела.** Позиції без неї йдуть окремим блоком, як на
 *    екрані, і цифри там не з'являються (правило провенансу).
 */

import { SHOPPING_CATEGORIES } from '@meridian/core'
import type { ShoppingItem } from '@meridian/core'

/** Кількість для показу: «120 г» / «4 шт» — лише з реальних сум джерела. */
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

/**
 * Зібрати текст. Порожній рядок — купувати нічого: ділитися тоді нема чим, і
 * екран кнопки не показує.
 */
export function shoppingListText({
  range,
  withQty,
  noQty,
  checks,
}: {
  /** «6–12 жовт. 2026» — межі планів; порожній, якщо їх не вдалося прочитати. */
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
