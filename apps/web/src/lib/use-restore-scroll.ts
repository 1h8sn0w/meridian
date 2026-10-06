/**
 * Догнати прокрутку, яку роутер не встиг відновити (MER-86).
 *
 * Роутер (`scrollRestoration: true` у `main.tsx`) відновлює прокрутку одразу
 * після рендеру маршруту, а дані екрана приїжджають із локальної бази кадром
 * пізніше: сторінка в цей момент ще коротка, і позиція впирається в нуль. Тож
 * коли вміст готовий, беремо ту саму позицію, яку зберіг роутер, і докручуємо —
 * один раз.
 *
 * Свого сховища тут немає: позиції пише й ключує сам роутер. На переході
 * вперед ключ новий, запису під ним немає — і хук нічого не робить; запис є
 * лише тоді, коли повертаємось на вже відвіданий екран.
 */

import { useEffect, useRef } from 'react'
import { useElementScrollRestoration } from '@tanstack/react-router'

export function useRestoreScrollWhenReady(ready: boolean): void {
  const entry = useElementScrollRestoration({ getElement: () => window })
  // Значення першого рендеру: далі роутер переписує запис, щойно людина сама
  // почне гортати, і наздоганяти треба саме збережене до повернення.
  const target = useRef(entry?.scrollY ?? 0)
  const done = useRef(false)

  useEffect(() => {
    if (!ready || done.current) return
    done.current = true
    if (target.current > window.scrollY)
      window.scrollTo({ top: target.current })
  }, [ready])
}
