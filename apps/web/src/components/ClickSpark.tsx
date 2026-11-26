import { useEffect, useRef } from 'react'

const RAYS = 8

function burstAt(x: number, y: number) {
  const burst = document.createElement('div')
  burst.className = 'absolute'
  burst.style.left = `${x}px`
  burst.style.top = `${y}px`
  const glow = document.createElement('div')
  glow.className =
    'absolute -left-4 -top-4 h-8 w-8 rounded-full bg-accent-soft motion-safe:animate-spark-glow'
  burst.append(glow)
  for (let ray = 0; ray < RAYS; ray++) {
    const line = document.createElement('div')
    line.className =
      'absolute -top-px left-0 h-0.5 w-2 origin-left rounded-full bg-accent-fill motion-safe:animate-spark'
    line.style.setProperty('--spark-angle', `${(360 / RAYS) * ray}deg`)
    burst.append(line)
  }
  return burst
}

export function ClickSpark() {
  const layer = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const allowed = window.matchMedia(
      '(pointer: fine) and (prefers-reduced-motion: no-preference)',
    )
    const spark = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return
      if (!allowed.matches || !layer.current) return
      const host =
        (event.target instanceof Element &&
          event.target.closest('dialog[open]')) ||
        layer.current
      const burst = burstAt(event.clientX, event.clientY)
      host.append(burst)
      Promise.allSettled(
        burst.getAnimations({ subtree: true }).map((run) => run.finished),
      ).then(() => burst.remove())
    }
    document.addEventListener('pointerdown', spark)
    return () => document.removeEventListener('pointerdown', spark)
  }, [])
  return (
    <div
      ref={layer}
      aria-hidden
      className="vt-spark pointer-events-none fixed inset-0 z-50 overflow-hidden"
    />
  )
}
