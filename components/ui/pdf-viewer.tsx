'use client'

import { useState, useCallback, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

type PdfViewerProps = {
  data: Uint8Array
}

export function PdfViewer({ data }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [containerWidth, setContainerWidth] = useState(0)
  const [error, setError] = useState(false)

  // Copy the data on each render to avoid "buffer already detached" errors
  // when pdf.js transfers the ArrayBuffer to its worker
  const file = useMemo(() => ({ data: new Uint8Array(data) }), [data])

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

  if (error) {
    const blob = new Blob([data], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    return (
      <div className="h-[80vh] flex flex-col items-center justify-center bg-gray-100 rounded-lg gap-4">
        <p className="text-sm text-muted-foreground">Could not render PDF preview.</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 underline">
          Open PDF in new tab
        </a>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="h-[80vh] overflow-auto bg-gray-100 rounded-lg">
      <Document
        file={file}
        onLoadSuccess={({ numPages: n }) => setNumPages(n)}
        onLoadError={() => setError(true)}
        loading={null}
      >
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
