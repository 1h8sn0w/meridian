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
import type { MealType } from '@meridian/core'
import { slotAt } from '../lib/day-clock'
import { minutesOf, useNow } from '../lib/use-now'

export type SkyPhase = 'dawn' | 'noon' | 'golden' | 'dusk' | 'night'

const PHASE_OF: Record<MealType, SkyPhase> = {
  breakfast: 'dawn',
  lunch: 'noon',
  snack: 'golden',
  dinner: 'dusk',
}

export function phaseAt(minutes: number): SkyPhase {
  const type = slotAt(minutes).type
  return type ? PHASE_OF[type] : 'night'
}

/**
 * Поставити фазу на документ. Викликається і до першого рендеру (`main.tsx`),
 * щоб застосунок не відкривався полуднем о сьомій ранку.
 */
export function applySky(minutes: number): void {
  const root = document.documentElement
  const phase = phaseAt(minutes)
  if (root.dataset.phase !== phase) root.dataset.phase = phase

  // Системна смуга в standalone-режимі — колір верху неба, інакше над ним шов.
  // `--phase-top` без переходу, тож читається одразу цільове значення.
  const top = getComputedStyle(root).getPropertyValue('--phase-top').trim()
  const meta = document.querySelector('meta[name="theme-color"]')
  if (top && meta) meta.setAttribute('content', top)
}

/** Такт неба. Окремий компонент без розмітки — щоб не перемальовувати екрани. */
export function Sky() {
  const minutes = minutesOf(useNow())
  useEffect(() => applySky(minutes), [minutes])
  return null
}
