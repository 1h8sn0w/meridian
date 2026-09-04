/**
 * Текстовий шар PDF (MER-52) — усе, що нам потрібно від pdf.js.
 *
 * Сторінки не малюються ніде: імпорт читає план, а не показує його. Тому
 * необов'язкова залежність `@napi-rs/canvas` (рендер у Node, 37 МБ нативного
 * бінарника) вимкнена в `pnpm-workspace.yaml`, а сам pdf.js вантажиться
 * **лише динамічно** — з обробника події, а не зверху файлу. Причина та сама,
 * що в `@powersync/web`: у ньому воркер, на сервері його немає, а бандл на
 * ~1.5 МБ не має лежати в стартовому чанку заради дії, яку роблять раз на два
 * тижні.
 */

/** Прогрес читання — сторінка з N; показується як статус діалогу. */
export type PdfProgress = (page: number, total: number) => void

/**
 * `true` — операцію витіснили або скасували, і працювати далі нема сенсу
 * (MER-39: скасований імпорт не має відтворювати діалог своїм результатом).
 */
export type Aborted = () => boolean

/**
 * Текст усіх сторінок PDF — рядки за `hasEOL`, як їх віддає текстовий шар.
 * Саме в такому вигляді (із жорсткими переносами посеред речень) його чекає
 * `parsePlanText` у ядрі.
 *
 * `null` — операцію скасували посеред читання.
 */
export async function extractPdfText(
  data: ArrayBuffer,
  onProgress?: PdfProgress,
  isAborted?: Aborted,
): Promise<string | null> {
  const pdfjs = await import('pdfjs-dist')
  /* Воркер віддається окремим файлом збірки: інакше pdf.js тягне його з
   * мережі за версією з CDN, і офлайн-застосунок мовчки перестав би читати
   * PDF. `?url` дає Vite покласти файл у збірку й повернути шлях до нього. */
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  /* У V1 тут стояв `isEvalSupported: false` — обхід CVE-2024-4367 (виконання
   * довільного JS через шрифт у шкідливому PDF), бо вендорений бандл був
   * 3.11.174. У 6.x цього прапорця немає: шлях зі `Function` із рушія
   * прибрали, тож вимикати вже нема чого. Файл сюди й далі приносить
   * користувач із пошти — тобто оновлювати pdfjs-dist треба, а не відкладати. */
  const task = pdfjs.getDocument({ data })
  try {
    const doc = await task.promise
    let text = ''
    for (let page = 1; page <= doc.numPages; page++) {
      if (isAborted?.()) return null
      onProgress?.(page, doc.numPages)
      const content = await (await doc.getPage(page)).getTextContent()
      for (const item of content.items) {
        if (!('str' in item)) continue // елемент розмітки, а не текст
        text += item.str
        if (item.hasEOL) text += '\n'
      }
      text += '\n'
    }
    return text
  } finally {
    /* Воркер тримає документ у пам'яті, доки його не закриють, — а PDF-план
     * важить мегабайти. Скасований імпорт закриває його так само. */
    await task.destroy()
  }
}
