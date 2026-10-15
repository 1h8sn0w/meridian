type PdfProgress = (page: number, total: number) => void

type Aborted = () => boolean

export async function extractPdfText(
  data: ArrayBuffer,
  onProgress?: PdfProgress,
  isAborted?: Aborted,
): Promise<string | null> {
  const pdfjs = await import('pdfjs-dist')
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default

  const task = pdfjs.getDocument({ data })
  try {
    const doc = await task.promise
    let text = ''
    for (let page = 1; page <= doc.numPages; page++) {
      if (isAborted?.()) return null
      onProgress?.(page, doc.numPages)
      const content = await (await doc.getPage(page)).getTextContent()
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str
        if (item.hasEOL) text += '\n'
      }
      text += '\n'
    }
    return text
  } finally {
    await task.destroy()
  }
}
