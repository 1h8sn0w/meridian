/**
 * Вибір, який належить ПРИСТРОЮ, а не сім'ї (рішення MER-55).
 *
 * Активний профіль і охоплення списку покупок — це те саме питання двічі:
 * фільтр показу живе в `localStorage`, бо двоє за одним столом дивляться свої
 * порції одночасно, і перемикання на одному телефоні не має смикати екран
 * іншого. Синхронізувати такий вибір було б не корисно, а шкідливо.
 *
 * Тут лише сховище. Що вважати чинним значенням і на що падати, коли збережене
 * вказує в нікуди, вирішує кожен виклик сам — правила самозцілення в них різні.
 */

import { useCallback, useEffect, useState } from 'react'

/**
 * Збережений вибір пристрою.
 *
 * Читається В ЕФЕКТІ, а не під час рендера: на сервері `localStorage` немає, і
 * вгадувати вибір користувача до гідратації не можна — розмітка смикнулась би.
 * Тому до першого ефекту значення завжди `null`, і це нормальний стан, а не
 * «нічого не вибрано».
 *
 * `null` у сеттері стирає ключ: сентинел на кшталт «усі профілі» не має
 * лишатися в сховищі рядком, який колись доведеться відрізняти від id.
 */
export function useStoredChoice(
  key: string,
): [string | null, (next: string | null) => void] {
  const [stored, setStored] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window !== 'undefined')
      setStored(window.localStorage.getItem(key))
  }, [key])

  const write = useCallback(
    (next: string | null) => {
      if (typeof window !== 'undefined') {
        if (next === null) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, next)
      }
      setStored(next)
    },
    [key],
  )

  return [stored, write]
}
