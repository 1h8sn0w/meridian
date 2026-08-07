/**
 * Час пристрою як стан React (MER-49).
 *
 * Одне джерело «зараз» на весь застосунок: годинник дня, вибір активного
 * прийому й позначка «сьогодні» в плані мусять збігатися. У V1 кожен із них
 * читав `new Date()` сам, і саме з такої розсинхронізації ростуть помилки на
 * межі доби.
 *
 * `null` до першого ефекту — навмисно: на сервері годинника користувача немає,
 * і відрендерити там будь-який час означало б смикнути розмітку під час
 * гідратації (та сама причина, що й у `DayClock` з MER-45).
 */

import { useEffect, useState } from 'react'

/** Пів хвилини — як у V1: активний прийом змінюється не частіше. */
const TICK_MS = 30_000

export function useNow(): Date | null {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const timer = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  return now
}

/** Хвилини від півночі — вхід для годинника дня. */
export function minutesOf(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}
