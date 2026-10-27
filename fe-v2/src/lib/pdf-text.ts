import { PDFWorker, getDocument } from 'pdfjs-dist'
import pdfWorkerSource from 'pdfjs-dist/build/pdf.worker.min.mjs?raw'

const workerBlobUrl = URL.createObjectURL(
  new Blob([pdfWorkerSource], { type: 'text/javascript' }),
)

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const worker = new Worker(workerBlobUrl, { type: 'module' })
  const pdfWorker = PDFWorker.create({ port: worker })
  const task = getDocument({ data: bytes.slice(), worker: pdfWorker })

  try {
    const pdf = await task.promise
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      pages.push(text)
      page.cleanup()
    }
    return pages.filter(Boolean).join('\n\n')
  } finally {
    void task.destroy().catch(() => undefined)
    worker.terminate()
  }
}
