/**
 * Догнати прокрутку, яку роутер не встиг відновити (MER-86).
 *
 * Роутер (`scrollRestoration: true` у `main.tsx`) відновлює позицію одразу
 * після рендеру маршруту, а дані екрана приїжджають із локальної бази пізніше,
 * і часто не одним шматком. Сторінка в цей момент коротша за збережену позицію,
 * тож прокрутка впирається в її кінець. Тут ми докручуємо щоразу, як документ
 * виростає, доки не дійдемо до цілі.
 *
 * Зупиняємось і тоді, коли людина сама взялася гортати (колесо, дотик,
 * клавіші): її рух важливіший за збережене місце. І за таймаутом: якщо вміст
 * так і не виріс до цілі (наприклад, план за цей час став коротшим), чекати
 * нема чого.
 */

/** Дії людини, після яких вона вже гортає сама. `scroll` сюди не годиться: його
 *  викликає й наш власний `scrollTo`. */
const USER_SCROLL = ['wheel', 'pointerdown', 'keydown'] as const

/** Повертає функцію зупинки — для прибирання в ефекті. */
export function catchUpScroll(
  target: number,
  win: Window & typeof globalThis = window,
  // ponytail: фіксована межа; локальна база відповідає за десятки мілісекунд,
  // і 3 с — із запасом навіть для слабкого телефона.
  timeoutMs = 3000,
): () => void {
  // Дробовий `scrollY` на екранах із high-DPI ніколи не дорівнює цілі точно.
  const reached = () => win.scrollY >= target - 1
  if (reached()) return () => {}

  const observer = new win.ResizeObserver(() => {
    win.scrollTo({ top: target })
    if (reached()) stop()
  })
  const timer = win.setTimeout(() => stop(), timeoutMs)
  const stop = () => {
    observer.disconnect()
    win.clearTimeout(timer)
    for (const type of USER_SCROLL) win.removeEventListener(type, stop, true)
  }

  for (const type of USER_SCROLL)
    win.addEventListener(type, stop, { capture: true, passive: true })
  // Перший виклик спостерігача — одразу після `observe`, тож і першу спробу
  // зробить він.
  observer.observe(win.document.documentElement)
  return stop
}
