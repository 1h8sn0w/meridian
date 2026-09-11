/**
 * Активний профіль — стан ПРИСТРОЮ, а не сім'ї (MER-49).
 *
 * Рішення MER-55: на сервер їде раціон, а не те, який із профілів зараз
 * відкритий. Синхронізувати вибір було б навіть шкідливо — двоє за одним
 * столом дивляться свої порції одночасно, і перемикання на одному телефоні не
 * має смикати екран іншого. Тому ключ живе в `localStorage` поруч із ключем
 * сесії, як `activeId` у `ProfileStore` V1.
 *
 * Стан самозцілюється так само, як у V1: збережений id, якого більше немає
 * серед профілів, мовчки замінюється першим у списку.
 */

import { useEffect } from 'react'
import { useStoredChoice } from './device-choice'
import type { AppProfile } from './data/model'

const KEY = 'meridian.profile.v2'

/** Палітра профілів із V1 (`PROFILE_COLORS`) — акцент інтерфейсу. */
export const PROFILE_COLORS = [
  '#4f9dff',
  '#e0729c',
  '#46c98b',
  '#ffb454',
  '#7f77dd',
] as const

export const DEFAULT_PROFILE_COLOR = PROFILE_COLORS[0]

/**
 * Пофарбувати інтерфейс у колір активного профілю. Токен `--accent`
 * оголошений в `@theme inline` (styles.css) саме заради цього: utility-класи
 * `text-accent`/`bg-accent-soft` читають його в рантаймі.
 *
 * Прозорий варіант звідси не їде: `--color-accent-soft` — це `color-mix` над
 * тим самим `--accent` (MER-71). Розбирати `#rrggbb` у JS не треба.
 */
export function applyAccent(color: string): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--accent', color)
}

export type ActiveProfile = {
  /** Активний профіль або null, доки в сім'ї немає жодного. */
  profile: AppProfile | null
  setActive: (id: string) => void
}

/**
 * Активний профіль зі списку сім'ї. Читаємо `localStorage` в ефекті, а не під
 * час рендера: на сервері його немає, і вгадувати вибір користувача до
 * гідратації не можна.
 */
export function useActiveProfile(
  profiles: ReadonlyArray<AppProfile>,
): ActiveProfile {
  const [id, setId] = useStoredChoice(KEY)

  const known = profiles.find((p) => p.id === id)
  // Порожній список — це нормальний стан (сім'я щойно створена), тож перший
  // елемент береться через довжину: індексний доступ у цьому пакеті типізується
  // як завжди визначений.
  const fallback = profiles.length ? profiles[0] : null
  const profile: AppProfile | null = known ?? fallback
  const color = profile === null ? DEFAULT_PROFILE_COLOR : profile.color

  // Збережений id указує в нікуди (профіль видалили на іншому пристрої) —
  // тихо переходимо на перший, як `ProfileStore.read` у V1. Тут, на відміну від
  // охоплення покупок, зцілення ще й ЗАПИСУЄТЬСЯ: вибір профілю мусить пережити
  // перезавантаження, і другого падіння на перший бути не має.
  useEffect(() => {
    if (profile !== null && profile.id !== id) setId(profile.id)
  }, [id, profile, setId])

  useEffect(() => {
    applyAccent(color)
  }, [color])

  return { profile, setActive: setId }
}
