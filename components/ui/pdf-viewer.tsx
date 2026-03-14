'use client'

import { useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type PdfViewerProps = {
  data: ArrayBuffer
}

export function PdfViewer({ data }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={containerRef} className="h-[80vh] overflow-auto bg-gray-100 rounded-lg">
      <Document file={{ data }} onLoadSuccess={({ numPages: n }) => setNumPages(n)} loading={null}>
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i}
            pageNumber={i + 1}
            width={containerWidth || undefined}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="mb-2 last:mb-0"
          />
        ))}
      </Document>
    </div>
  )
}
