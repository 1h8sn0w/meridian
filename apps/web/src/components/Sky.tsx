import { useEffect } from 'react'
import { phaseAt } from '../lib/day-clock'
import type { MealWindow } from '../lib/day-clock'
import { useMealWindows } from '../lib/meal-windows'
import { minutesOf, useNow } from '../lib/use-now'

export function applySky(
  minutes: number,
  windows: ReadonlyArray<MealWindow>,
): void {
  const root = document.documentElement
  const phase = phaseAt(minutes, windows)
  if (root.dataset.phase !== phase) root.dataset.phase = phase

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
