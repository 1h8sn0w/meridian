import { useEffect } from 'react'

const RAYS = 8

function sparkLayer(x: number, y: number) {
  const layer = document.createElement('div')
  layer.ariaHidden = 'true'
  layer.className = 'pointer-events-none fixed inset-0 z-50 overflow-hidden'
  const burst = document.createElement('div')
  burst.className = 'absolute'
  burst.style.left = `${x}px`
  burst.style.top = `${y}px`
  const glow = document.createElement('div')
  glow.className =
    'absolute -left-4 -top-4 h-8 w-8 rounded-full bg-accent-soft animate-spark-glow'
  burst.append(glow)
  for (let ray = 0; ray < RAYS; ray++) {
    const line = document.createElement('div')
    line.className =
      'absolute -top-px left-0 h-0.5 w-2 origin-left rounded-full bg-accent-fill animate-spark'
    line.style.setProperty('--spark-angle', `${(360 / RAYS) * ray}deg`)
    burst.append(line)
  }
  layer.append(burst)
  return layer
}

export function ClickSpark() {
  useEffect(() => {
    const allowed = window.matchMedia(
      '(pointer: fine) and (prefers-reduced-motion: no-preference)',
    )
    const spark = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return
      if (!allowed.matches) return
      const host =
        (event.target instanceof Element &&
          event.target.closest('dialog[open]')) ||
        document.body
      const layer = sparkLayer(event.clientX, event.clientY)
      host.append(layer)
      void Promise.allSettled(
        layer.getAnimations({ subtree: true }).map((run) => run.finished),
      ).then(() => layer.remove())
    }
    document.addEventListener('pointerdown', spark)
    return () => document.removeEventListener('pointerdown', spark)
  }, [])
  return null
}
