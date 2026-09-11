/**
 * Охоплення списку покупок — стан ПРИСТРОЮ, а не сім'ї (рішення MER-55).
 *
 * «Чиї плани зводити в список» — це фільтр показу, як і активний профіль: у
 * магазині двоє можуть дивитися на список по-різному, і перемикання на одному
 * телефоні не має смикати екран іншого. Тому ключ живе в `localStorage`, поруч
 * із `meridian.profile.v2`, і в схемі колонки під нього немає.
 *
 * Самі позначки «куплено» при цьому спільні для сім'ї — і саме тому відбиток
 * планів (`planFingerprint`) охоплення НЕ враховує: два пристрої з різним
 * фільтром мусять бачити позначки одне одного.
 *
 * Стан самозцілюється так само, як активний профіль: збережений id, якого
 * більше немає серед профілів, мовчки повертається на «всі».
 */

import { useCallback } from 'react'
import { useStoredChoice } from './device-choice'
import type { AppProfile } from './data/model'

const KEY = 'meridian.shopping.scope.v2'

/** `ALL_PROFILES` — плани всіх профілів сім'ї; інакше — id одного профілю. */
export type ShoppingScope = string

export const ALL_PROFILES = 'all'

export type ActiveScope = {
  scope: ShoppingScope
  setScope: (next: ShoppingScope) => void
}

/**
 * Вибране охоплення. `localStorage` читається в ефекті, а не під час рендера:
 * на сервері його немає, і вгадувати вибір користувача до гідратації не можна.
 */
export function useShoppingScope(
  profiles: ReadonlyArray<AppProfile>,
): ActiveScope {
  const [stored, setStored] = useStoredChoice(KEY)

  // Профіль видалили на іншому пристрої — тихо повертаємось до «всіх». Список
  // при цьому лишається повним, а не порожнім: краще показати більше, ніж
  // мовчки показати нічого. Зцілення, на відміну від активного профілю, НЕ
  // записується: «всі» — це відсутність ключа, і повертати в сховище нема чого.
  const scope: ShoppingScope =
    stored !== null && profiles.some((profile) => profile.id === stored)
      ? stored
      : ALL_PROFILES

  // `null` стирає ключ: сентинел «усі» не має лежати в сховищі рядком, який
  // колись довелося б відрізняти від справжнього id профілю.
  const setScope = useCallback(
    (next: ShoppingScope) => setStored(next === ALL_PROFILES ? null : next),
    [setStored],
  )

  return { scope, setScope }
}
