/**
 * Час пристрою як стан React (MER-49).
 *
 * Одне джерело «зараз» на весь застосунок: годинник дня, вибір активного
 * прийому й позначка «сьогодні» в плані мусять збігатися. У V1 кожен із них
 * читав `new Date()` сам, і саме з такої розсинхронізації ростуть помилки на
 * межі доби.
 *
 * Час є вже на першому кадрі. Раніше хук починав із `null`, бо розмітку віддавав
 * сервер, на якому годинника користувача немає; відколи застосунок статичний,
 * цей стан лишався б лише приводом для кожного екрана описувати «часу ще
 * немає» — стан, у якому вони вже не бувають.
 */

import { useEffect, useState } from 'react'

/** Пів хвилини — як у V1: активний прийом змінюється не частіше. */
const TICK_MS = 30_000

export function useNow(): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  return now
}

/** Хвилини від півночі — вхід для годинника дня. */
export function minutesOf(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}
