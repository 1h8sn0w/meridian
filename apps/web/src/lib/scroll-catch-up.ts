/**
 * Догнати прокрутку, яку роутер не встиг відновити (MER-86).
 *
 * Роутер (`scrollRestoration: true` у `main.tsx`) відновлює позицію одразу
 * після рендеру маршруту, а дані екрана приїжджають із локальної бази пізніше,
 * і часто не одним шматком. Сторінка в цей момент коротша за збережену позицію,
 * тож прокрутка впирається в її кінець. Тут ми докручуємо щоразу, як документ
 * виростає, доки не дійдемо до цілі.
 *
 * Людину, що вже щось робить сама, не смикаємо, і помічаємо це двома шляхами.
 * Будь-який дотик, клавіша чи колесо — відступаємо: далі сторінку міняє вона
 * (гортає, перемикає фільтр, розгортає страву), і її ріст — не наші дані. А
 * смугу прокрутки й допоміжні технології видно лише з позиції: доки ціль не
 * досягнуто, ми стоїмо в самому низу сторінки, тож гортати можна лише вгору.
 * Позиція вище, ніж ми її лишили, і вже не в самому низу — людина гортає. Якщо
 * ж ми досі внизу, позицію підтиснув сам браузер: вміст став коротшим або
 * змістився (`overflow-anchor`), і доганяти треба далі.
 *
 * І за таймаутом: якщо вміст так і не виріс до цілі (наприклад, план за цей час
 * став коротшим), чекати нема чого.
 */

/** Дії людини, після яких сторінка вже її. `scroll` сюди не годиться: його
 *  викликає й наш власний `scrollTo`. */
const USER_INPUT = ['pointerdown', 'keydown', 'wheel'] as const

/** Повертає функцію зупинки — для прибирання в ефекті. */
export function catchUpScroll(
  target: number,
  win: Window & typeof globalThis = window,
  // ponytail: фіксована межа від монтування екрана; локальна база відповідає
  // за десятки мілісекунд, і 5 с — із запасом навіть для слабкого телефона.
  timeoutMs = 5000,
): () => void {
  // Дробовий `scrollY` на екранах із high-DPI ніколи не дорівнює цілі точно.
  const reached = () => win.scrollY >= target - 1
  const page = win.document.documentElement
  const atBottom = () => win.scrollY >= page.scrollHeight - win.innerHeight - 1
  let left = -Infinity

  // Перший виклик спостерігача — одразу після `observe`, тобто вже після того,
  // як роутер поставив свою позицію.
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
