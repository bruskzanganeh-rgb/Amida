'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Loader2, Download, FileArchive, FileText, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'
import useSWR from 'swr'

type MonthOption = { year: number; month: number; count: number; withReceipts: number; total: number }

const currentYear = new Date().getFullYear()

export default function ExportTab() {
  const t = useTranslations('expense')
  const tc = useTranslations('common')
  const td = useTranslations('documents')
  const formatLocale = useFormatLocale()
  const { symbol: baseCurrencySymbol } = useBaseCurrency()
  const [exporting, setExporting] = useState<string | null>(null)
  const [fromYear, setFromYear] = useState(currentYear.toString())
  const [fromMonth, setFromMonth] = useState('1')
  const [toYear, setToYear] = useState(currentYear.toString())
  const [toMonth, setToMonth] = useState((new Date().getMonth() + 1).toString())
  const supabase = createClient()

  // Load expense data for summary
  const { data: allExpenses, isLoading: loading } = useSWR('export-expenses-summary', async () => {
    const { data } = await supabase
      .from('expenses')
      .select('date, amount, amount_base, attachment_url')
      .order('date', { ascending: false })
    return data || []
  })

  // Calculate summary for selected range
  const fromDate = `${fromYear}-${fromMonth.padStart(2, '0')}-01`
  const toDate = (() => {
    const y = parseInt(toYear)
    const m = parseInt(toMonth)
    return new Date(y, m, 0).toISOString().split('T')[0]
  })()

  const expensesInRange = (allExpenses || []).filter((e) => e.date >= fromDate && e.date <= toDate)
  const totalAmount = expensesInRange.reduce((sum, e) => sum + (e.amount_base || e.amount), 0)
  const withReceipts = expensesInRange.filter((e) => e.attachment_url).length

  // Available years
  const years = allExpenses
    ? [...new Set(allExpenses.map((e) => new Date(e.date).getFullYear()))].sort((a, b) => b - a)
    : [currentYear]
  if (!years.includes(currentYear)) years.unshift(currentYear)

  const months = Array.from({ length: 12 }, (_, i) => i + 1)

  function monthLabel(m: number) {
    return new Date(2024, m - 1).toLocaleDateString('sv-SE', { month: 'long' })
  }

  async function handleExport(format: 'zip' | 'pdf' | 'pdf-summary') {
    if (expensesInRange.length === 0) {
      toast.error(td('noDataForPeriod'))
      return
    }

    setExporting(format)
    try {
      const actualFormat = format === 'pdf-summary' ? 'pdf' : format
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        format: actualFormat,
        locale: formatLocale,
      })

      // For pdf-summary, we use the CSV format (no attachments) but as PDF
      // Actually we'll just use the normal pdf endpoint — the summary page is always included
      // For "pdf-summary" we skip attachment download by not including them
      if (format === 'pdf-summary') {
        // Use a special param to skip attachments
        params.set('skipAttachments', 'true')
      }

      const response = await fetch(`/api/expenses/export?${params}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Export failed' }))
        throw new Error(errorData.error || t('exportFailed'))
      }

      const blob = await response.blob()
      const ext = format === 'zip' ? 'zip' : 'pdf'
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Utgifter_${fromDate}_${toDate}.${ext}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success(t('downloadedFile', { format: ext.toUpperCase() }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('exportFailed'))
    } finally {
      setExporting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!allExpenses || allExpenses.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>{t('noExpensesToExport')}</p>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="h-5 w-5" />
            {t('exportReceipts')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
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
                  {Math.round(totalAmount).toLocaleString(formatLocale)} {baseCurrencySymbol}
                </span>
              </div>
            </div>
          </div>

          {/* Export buttons */}
          <div className="space-y-2">
            <Label>{t('exportFormat')}</Label>
            <div className="grid grid-cols-1 gap-2">
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

              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => handleExport('zip')}
                disabled={!!exporting || withReceipts === 0}
              >
                {exporting === 'zip' ? (
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                ) : (
                  <FileArchive className="mr-3 h-5 w-5 text-amber-600" />
                )}
                <div className="text-left">
                  <div className="font-medium">{td('zipWithReceipts')}</div>
                  <div className="text-xs text-muted-foreground">{td('zipWithReceiptsDesc')}</div>
                </div>
              </Button>
            </div>

            {expensesInRange.length > 0 && withReceipts === 0 && (
              <p className="text-xs text-amber-600 mt-2">{t('noReceiptsForMonth')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
