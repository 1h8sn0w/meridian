const USER_INPUT = ['pointerdown', 'keydown', 'wheel'] as const

export function catchUpScroll(
  target: number,
  win: Window & typeof globalThis = window,
  timeoutMs = 5000,
): () => void {
  const reached = () => win.scrollY >= target - 1
  const page = win.document.documentElement
  const atBottom = () => win.scrollY >= page.scrollHeight - win.innerHeight - 1
  let left = -Infinity

  const observer = new win.ResizeObserver(() => {
    if (reached() || (win.scrollY < left - 1 && !atBottom())) return stop()
    win.scrollTo({ top: target })
    left = win.scrollY
    if (reached()) stop()
  })
  const timer = win.setTimeout(() => stop(), timeoutMs)
  const stop = () => {
    observer.disconnect()
    win.clearTimeout(timer)
    for (const type of USER_INPUT) win.removeEventListener(type, stop, true)
  }

  for (const type of USER_INPUT)
    win.addEventListener(type, stop, { capture: true, passive: true })
  observer.observe(page)
  return stop
}
