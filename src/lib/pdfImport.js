// PDF text extraction: pulls text line-by-line, preserving the original
// line breaks and (roughly) the horizontal spacing of the source PDF.

import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

function appendItem(lineText, prevEndX, item) {
  const x = item.transform[4]
  let text = lineText
  if (prevEndX != null && item.str) {
    const gap = x - prevEndX
    const avgCharWidth = item.str.length ? Math.abs(item.width || 0) / item.str.length : 3
    const threshold = Math.max(avgCharWidth * 0.5, 1.2)
    if (gap > threshold && !/\s$/.test(text) && !/^\s/.test(item.str)) {
      text += ' '
    }
  }
  text += item.str
  return { text, endX: x + (item.width || 0) }
}

export async function extractPdfLines(file) {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const lines = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    let current = ''
    let prevEndX = null

    for (const item of content.items) {
      if (item.str === '' && !item.hasEOL) continue
      const res = appendItem(current, prevEndX, item)
      current = res.text
      prevEndX = res.endX
      if (item.hasEOL) {
        lines.push(current.replace(/\s+$/, ''))
        current = ''
        prevEndX = null
      }
    }
    if (current.length) {
      lines.push(current.replace(/\s+$/, ''))
    }
  }

  return lines
}
