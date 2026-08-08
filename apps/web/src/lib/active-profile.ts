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

import { useCallback, useEffect, useState } from 'react'
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

function read(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(KEY)
}

function write(id: string | null): void {
  if (typeof window === 'undefined') return
  if (id) window.localStorage.setItem(KEY, id)
  else window.localStorage.removeItem(KEY)
}

/** `#4f9dff` + 0.12 → `rgba(79, 157, 255, 0.12)` (hexToRgba із V1). */
export function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = Number.parseInt(value.slice(0, 2), 16)
  const g = Number.parseInt(value.slice(2, 4), 16)
  const b = Number.parseInt(value.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Пофарбувати інтерфейс у колір активного профілю. Токени `--accent` і
 * `--accent-soft` оголошені в `@theme inline` (styles.css) саме заради цього:
 * utility-класи `text-accent`/`bg-accent-soft` читають їх у рантаймі.
 */
export function applyAccent(color: string): void {
  if (typeof document === 'undefined') return
  const style = document.documentElement.style
  style.setProperty('--accent', color)
  style.setProperty('--accent-soft', hexToRgba(color, 0.12))
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
  const [id, setId] = useState<string | null>(null)

  useEffect(() => {
    setId(read())
  }, [])

  const known = profiles.find((p) => p.id === id)
  // Порожній список — це нормальний стан (сім'я щойно створена), тож перший
  // елемент береться через довжину: індексний доступ у цьому пакеті типізується
  // як завжди визначений.
  const fallback = profiles.length ? profiles[0] : null
  const profile: AppProfile | null = known ?? fallback
  const color = profile === null ? DEFAULT_PROFILE_COLOR : profile.color

  // Збережений id указує в нікуди (профіль видалили на іншому пристрої) —
  // тихо переходимо на перший, як `ProfileStore.read` у V1.
  useEffect(() => {
    if (profile !== null && profile.id !== id) {
      write(profile.id)
      setId(profile.id)
    }
  }, [id, profile])

  useEffect(() => {
    applyAccent(color)
  }, [color])

  const setActive = useCallback((next: string) => {
    write(next)
    setId(next)
  }, [])

  return { profile, setActive }
}
