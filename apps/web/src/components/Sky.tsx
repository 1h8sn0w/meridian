/**
 * Небо застосунку — фаза доби за годинником прийомів (дизайн «Сонячна дуга»).
 *
 * Фаза — це просто активний прийом, названий кольором: світанок на сніданок,
 * полудень на обід, золото на перекус, захід на вечерю й ніч поза вікнами. Нових
 * меж доби тут немає — їх дає `slotAt` із годинника дня, тож небо й картка
 * страви не можуть розійтися в тому, «яка зараз пора».
 *
 * Самі кольори живуть у `styles.css` (для обох тем); звідси їде лише атрибут
 * `data-phase` на <html> і колір системної смуги PWA.
 */

import { useEffect } from 'react'
import { phaseAt } from '../lib/day-clock'
import type { MealWindow } from '../lib/day-clock'
import { useMealWindows } from '../lib/meal-windows'
import { minutesOf, useNow } from '../lib/use-now'

/**
 * Поставити фазу на документ. Викликається і до першого рендеру (`main.tsx`),
 * щоб застосунок не відкривався полуднем о сьомій ранку.
 */
export function applySky(
  minutes: number,
  windows: ReadonlyArray<MealWindow>,
): void {
  const root = document.documentElement
  const phase = phaseAt(minutes, windows)
  if (root.dataset.phase !== phase) root.dataset.phase = phase

  // Системна смуга в standalone-режимі — колір верху неба, інакше над ним шов.
  // `--phase-top` без переходу, тож читається одразу цільове значення.
  const top = getComputedStyle(root).getPropertyValue('--phase-top').trim()
  const meta = document.querySelector('meta[name="theme-color"]')
  if (top && meta) meta.setAttribute('content', top)
}

export function markClassicScrollbar(): void {
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;overflow:scroll'
  document.body.append(probe)
  document.documentElement.classList.toggle(
    'classic-scrollbar',
    probe.offsetWidth > probe.clientWidth,
  )
  probe.remove()
}

/**
 * Такт неба. Окремий компонент без розмітки — щоб не перемальовувати екрани.
 * Колір смуги залежить і від теми, тож її перемикання в системі теж
 * перефарбовує смугу одразу, а не з наступною хвилиною.
 */
export function Sky() {
  const minutes = minutesOf(useNow())
  const { windows } = useMealWindows()
  useEffect(() => {
    applySky(minutes, windows)
    const scheme = window.matchMedia('(prefers-color-scheme: dark)')
    const repaint = () => applySky(minutes, windows)
    scheme.addEventListener('change', repaint)
    return () => scheme.removeEventListener('change', repaint)
  }, [minutes, windows])
  return null
}
