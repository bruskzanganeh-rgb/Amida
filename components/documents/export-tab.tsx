'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Download, FileArchive, FileText, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'
import { getCompanyDocuments, getDocumentSignedUrl } from '@/lib/supabase/document-storage'
import useSWR from 'swr'

const currentYear = new Date().getFullYear()

type ExportType = 'expenses' | 'invoices' | 'documents'

export default function ExportTab() {
  const t = useTranslations('expense')
  const td = useTranslations('documents')
  const formatLocale = useFormatLocale()
  const { symbol: baseCurrencySymbol } = useBaseCurrency()
  const [exporting, setExporting] = useState<string | null>(null)
  const [fromYear, setFromYear] = useState(currentYear.toString())
  const [fromMonth, setFromMonth] = useState('1')
  const [toYear, setToYear] = useState(currentYear.toString())
  const [toMonth, setToMonth] = useState((new Date().getMonth() + 1).toString())
  const [selectedTypes, setSelectedTypes] = useState<Set<ExportType>>(new Set(['expenses', 'invoices', 'documents']))
  const supabase = createClient()

  // Load expense data
  const { data: allExpenses, isLoading: loadingExpenses } = useSWR('export-expenses-summary', async () => {
    const { data } = await supabase
      .from('expenses')
      .select('date, amount, amount_base, attachment_url')
      .order('date', { ascending: false })
    return data || []
  })

  // Load invoice data
  const { data: allInvoices, isLoading: loadingInvoices } = useSWR('export-invoices-summary', async () => {
    const { data } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, total, status, currency')
      .order('invoice_date', { ascending: false })
    return data || []
  })

  // Load company documents
  const { data: allDocuments, isLoading: loadingDocuments } = useSWR('export-documents-summary', async () => {
    try {
      return await getCompanyDocuments()
    } catch {
      return []
    }
  })

  const loading = loadingExpenses || loadingInvoices || loadingDocuments

  // Calculate date range
  const fromDate = `${fromYear}-${fromMonth.padStart(2, '0')}-01`
  const toDate = (() => {
    const y = parseInt(toYear)
    const m = parseInt(toMonth)
    return new Date(y, m, 0).toISOString().split('T')[0]
  })()

  // Filter data by date range
  const expensesInRange = (allExpenses || []).filter((e) => e.date >= fromDate && e.date <= toDate)
  const invoicesInRange = (allInvoices || []).filter((i) => i.invoice_date >= fromDate && i.invoice_date <= toDate)
  const documentsInRange = (allDocuments || []).filter((d) => {
    const date = d.document_date || d.uploaded_at?.split('T')[0]
    return date && date >= fromDate && date <= toDate
  })

  const totalExpenseAmount = expensesInRange.reduce((sum, e) => sum + (e.amount_base || e.amount), 0)
  const withReceipts = expensesInRange.filter((e) => e.attachment_url).length
  const totalInvoiceAmount = invoicesInRange.reduce((sum, i) => sum + (i.total || 0), 0)

  // Available years from all data sources
  const allYears = new Set<number>()
  allYears.add(currentYear)
  ;(allExpenses || []).forEach((e) => allYears.add(new Date(e.date).getFullYear()))
  ;(allInvoices || []).forEach((i) => allYears.add(new Date(i.invoice_date).getFullYear()))
  ;(allDocuments || []).forEach((d) => {
    const date = d.document_date || d.uploaded_at?.split('T')[0]
    if (date) allYears.add(new Date(date).getFullYear())
  })
  const years = [...allYears].sort((a, b) => b - a)

  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  function monthLabel(m: number) {
    return new Date(2024, m - 1).toLocaleDateString('sv-SE', { month: 'long' })
  }

  function toggleType(type: ExportType) {
    setSelectedTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const hasSelectedData =
    (selectedTypes.has('expenses') && expensesInRange.length > 0) ||
    (selectedTypes.has('invoices') && invoicesInRange.length > 0) ||
    (selectedTypes.has('documents') && documentsInRange.length > 0)

  const hasAnyAttachments =
    (selectedTypes.has('expenses') && withReceipts > 0) ||
    (selectedTypes.has('invoices') && invoicesInRange.length > 0) ||
    (selectedTypes.has('documents') && documentsInRange.length > 0)

  async function handleExport(format: 'zip' | 'pdf' | 'pdf-summary') {
    if (selectedTypes.size === 0) {
      toast.error(td('selectAtLeastOne'))
      return
    }
    if (!hasSelectedData) {
      toast.error(td('noDataForPeriod'))
      return
    }

    setExporting(format)
    try {
      // For expenses, use the existing export API
      if (selectedTypes.has('expenses') && expensesInRange.length > 0) {
        const actualFormat = format === 'pdf-summary' ? 'pdf' : format
        const params = new URLSearchParams({
          from: fromDate,
          to: toDate,
          format: actualFormat,
          locale: formatLocale,
        })
        if (format === 'pdf-summary') {
          params.set('skipAttachments', 'true')
        }

        // If only expenses selected, use the direct expense export
        if (!selectedTypes.has('invoices') && !selectedTypes.has('documents')) {
          const response = await fetch(`/api/expenses/export?${params}`)
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Export failed' }))
            throw new Error(errorData.error || t('exportFailed'))
          }
          const blob = await response.blob()
          const ext = format === 'zip' ? 'zip' : 'pdf'
          downloadBlob(blob, `Utgifter_${fromDate}_${toDate}.${ext}`)
          toast.success(t('downloadedFile', { format: ext.toUpperCase() }))
          return
        }
      }

      // Combined export — always ZIP when multiple types
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()

      // Add expenses
      if (selectedTypes.has('expenses') && expensesInRange.length > 0) {
        const params = new URLSearchParams({
          from: fromDate,
          to: toDate,
          format: 'zip',
          locale: formatLocale,
        })
        const response = await fetch(`/api/expenses/export?${params}`)
        if (response.ok) {
          const expenseZipBlob = await response.arrayBuffer()
          const expenseZip = await JSZip.loadAsync(expenseZipBlob)
          const folder = zip.folder(td('expensesFolder'))!
          for (const [name, file] of Object.entries(expenseZip.files)) {
            if (!file.dir) {
              const content = await file.async('arraybuffer')
              folder.file(name, content)
            }
          }
        }
      }

      // Add invoices as PDFs
      if (selectedTypes.has('invoices') && invoicesInRange.length > 0) {
        const folder = zip.folder(td('invoicesFolder'))!
        for (const invoice of invoicesInRange) {
          try {
            const response = await fetch(`/api/invoices/${invoice.id}/pdf`)
            if (response.ok) {
              const pdfBlob = await response.arrayBuffer()
              const fileName = `Faktura_${invoice.invoice_number}_${invoice.invoice_date}.pdf`
              folder.file(fileName, pdfBlob)
            }
          } catch {
            console.error(`Failed to fetch invoice PDF: ${invoice.invoice_number}`)
          }
        }
      }

      // Add company documents
      if (selectedTypes.has('documents') && documentsInRange.length > 0) {
        const folder = zip.folder(td('documentsFolder'))!
        for (const doc of documentsInRange) {
          try {
            const signedUrl = await getDocumentSignedUrl(doc.file_path)
            if (signedUrl) {
              const response = await fetch(signedUrl)
              if (response.ok) {
                const fileBlob = await response.arrayBuffer()
                folder.file(doc.file_name, fileBlob)
              }
            }
          } catch {
            console.error(`Failed to fetch document: ${doc.file_name}`)
          }
        }
      }

      const zipBuffer = await zip.generateAsync({ type: 'blob' })
      downloadBlob(zipBuffer, `Dokument_${fromDate}_${toDate}.zip`)
      toast.success(t('downloadedFile', { format: 'ZIP' }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('exportFailed'))
    } finally {
      setExporting(null)
    }
  }

  function downloadBlob(blob: Blob | ArrayBuffer, filename: string) {
    const b = blob instanceof Blob ? blob : new Blob([blob])
    const url = window.URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasAnyData = (allExpenses?.length || 0) + (allInvoices?.length || 0) + (allDocuments?.length || 0) > 0

  if (!hasAnyData) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>{td('noDataToExport')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="h-5 w-5" />
            {td('exportDocuments')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Document type selection */}
          <div className="space-y-3">
            <Label>{td('includeInExport')}</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={selectedTypes.has('expenses')} onCheckedChange={() => toggleType('expenses')} />
                <span className="text-sm">{td('expensesAndReceipts')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={selectedTypes.has('invoices')} onCheckedChange={() => toggleType('invoices')} />
                <span className="text-sm">{td('invoicesPdf')}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={selectedTypes.has('documents')} onCheckedChange={() => toggleType('documents')} />
                <span className="text-sm">{td('companyDocuments')}</span>
              </label>
            </div>
          </div>

          {/* Date range */}
          <div className="space-y-3">
            <Label>{td('periodFrom')}</Label>
            <div className="flex items-center gap-2">
              <Select value={fromYear} onValueChange={setFromYear}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={fromMonth} onValueChange={setFromMonth}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m.toString()}>
                      {monthLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Label>{td('periodTo')}</Label>
            <div className="flex items-center gap-2">
              <Select value={toYear} onValueChange={setToYear}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={toMonth} onValueChange={setToMonth}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m.toString()}>
                      {monthLabel(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <h4 className="font-medium">{td('selectedPeriod')}</h4>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {selectedTypes.has('expenses') && (
                <>
                  <div>
                    <span className="text-muted-foreground">{t('expenseCount')}:</span>
                    <span className="ml-2 font-medium">{expensesInRange.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{t('withReceipt')}:</span>
                    <span className="ml-2 font-medium">{withReceipts}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">{t('totalSum')}:</span>
                    <span className="ml-2 font-medium">
                      {Math.round(totalExpenseAmount).toLocaleString(formatLocale)} {baseCurrencySymbol}
                    </span>
                  </div>
                </>
              )}
              {selectedTypes.has('invoices') && (
                <>
                  <div>
                    <span className="text-muted-foreground">{td('invoiceCount')}:</span>
                    <span className="ml-2 font-medium">{invoicesInRange.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{td('invoiceTotal')}:</span>
                    <span className="ml-2 font-medium">
                      {Math.round(totalInvoiceAmount).toLocaleString(formatLocale)} {baseCurrencySymbol}
                    </span>
                  </div>
                </>
              )}
              {selectedTypes.has('documents') && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">{td('documentCount')}:</span>
                  <span className="ml-2 font-medium">{documentsInRange.length}</span>
                </div>
              )}
            </div>
          </div>

          {/* Export buttons */}
          <div className="space-y-2">
            <Label>{t('exportFormat')}</Label>
            <div className="grid grid-cols-1 gap-2">
              {/* Only show PDF options when single type (expenses) selected */}
              {selectedTypes.size === 1 && selectedTypes.has('expenses') && (
                <>
                  <Button
                    variant="outline"
                    className="justify-start h-auto py-3"
                    onClick={() => handleExport('pdf-summary')}
                    disabled={!!exporting || expensesInRange.length === 0}
                  >
                    {exporting === 'pdf-summary' ? (
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                    ) : (
                      <FileText className="mr-3 h-5 w-5 text-blue-600" />
                    )}
                    <div className="text-left">
                      <div className="font-medium">{td('pdfSummaryOnly')}</div>
                      <div className="text-xs text-muted-foreground">{td('pdfSummaryDesc')}</div>
                    </div>
                  </Button>

                  <Button
                    variant="outline"
                    className="justify-start h-auto py-3"
                    onClick={() => handleExport('pdf')}
                    disabled={!!exporting || withReceipts === 0}
                  >
                    {exporting === 'pdf' ? (
                      <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                    ) : (
                      <FileText className="mr-3 h-5 w-5 text-red-600" />
                    )}
                    <div className="text-left">
                      <div className="font-medium">{td('pdfWithReceipts')}</div>
                      <div className="text-xs text-muted-foreground">{td('pdfWithReceiptsDesc')}</div>
                    </div>
                  </Button>
                </>
              )}

              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => handleExport('zip')}
                disabled={!!exporting || !hasSelectedData || selectedTypes.size === 0}
              >
                {exporting === 'zip' ? (
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                ) : (
                  <FileArchive className="mr-3 h-5 w-5 text-amber-600" />
                )}
                <div className="text-left">
                  <div className="font-medium">{td('zipExport')}</div>
                  <div className="text-xs text-muted-foreground">{td('zipExportDesc')}</div>
                </div>
              </Button>
            </div>

            {selectedTypes.has('expenses') && expensesInRange.length > 0 && withReceipts === 0 && (
              <p className="text-xs text-amber-600 mt-2">{t('noReceiptsForMonth')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
