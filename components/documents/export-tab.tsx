'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Loader2, Download, FileArchive, FileText, Files, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'
import useSWR from 'swr'

type MonthSummary = {
  year: number
  month: number
  count: number
  withReceipts: number
  total: number
}

export default function ExportTab() {
  const t = useTranslations('expense')
  const tc = useTranslations('common')
  const formatLocale = useFormatLocale()
  const { symbol: baseCurrencySymbol } = useBaseCurrency()
  const [exporting, setExporting] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const supabase = createClient()

  // Load available months
  const { data: availableMonths = [], isLoading: loading } = useSWR('export-months', async () => {
    const { data: expenses } = await supabase
      .from('expenses')
      .select('date, amount, amount_base, attachment_url')
      .order('date', { ascending: false })

    if (!expenses) return []

    const monthMap = new Map<string, MonthSummary>()
    for (const expense of expenses) {
      const date = new Date(expense.date)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const key = `${year}-${month}`

      if (!monthMap.has(key)) {
        monthMap.set(key, { year, month, count: 0, withReceipts: 0, total: 0 })
      }

      const summary = monthMap.get(key)!
      summary.count++
      summary.total += expense.amount_base || expense.amount
      if (expense.attachment_url) summary.withReceipts++
    }

    const months = Array.from(monthMap.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year
      return b.month - a.month
    })

    // Auto-select first month
    if (months.length > 0 && !selectedYear) {
      setSelectedYear(months[0].year.toString())
      setSelectedMonth(months[0].month.toString())
    }

    return months
  })

  const selectedSummary = availableMonths.find(
    (m) => m.year.toString() === selectedYear && m.month.toString() === selectedMonth,
  )

  const years = [...new Set(availableMonths.map((m) => m.year))].sort((a, b) => b - a)
  const monthsForYear = availableMonths
    .filter((m) => m.year.toString() === selectedYear)
    .sort((a, b) => b.month - a.month)

  async function handleExport(format: 'zip' | 'pdf' | 'individual') {
    if (!selectedYear || !selectedMonth) {
      toast.error(t('selectYearAndMonth'))
      return
    }

    setExporting(format)
    try {
      if (format === 'individual') {
        const response = await fetch(
          `/api/expenses/export?year=${selectedYear}&month=${selectedMonth}&format=individual&locale=${formatLocale}`,
        )
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || t('exportFailed'))

        const expensesWithReceipts = result.expenses.filter((e: { attachment_url: string | null }) => e.attachment_url)
        if (expensesWithReceipts.length === 0) {
          toast.error(t('noReceiptsForMonth'))
          return
        }

        for (const expense of expensesWithReceipts) {
          window.open(expense.attachment_url, '_blank')
        }
        toast.success(t('openedReceipts', { count: expensesWithReceipts.length }))
      } else {
        const response = await fetch(
          `/api/expenses/export?year=${selectedYear}&month=${selectedMonth}&format=${format}&locale=${formatLocale}`,
        )
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || t('exportFailed'))
        }

        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${selectedYear}-${selectedMonth.padStart(2, '0')}-Kvitton.${format}`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        document.body.removeChild(a)
        toast.success(t('downloadedFile', { format: format.toUpperCase() }))
      }
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

  if (availableMonths.length === 0) {
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
          {/* Year & Month */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('year')}</Label>
              <Select
                value={selectedYear}
                onValueChange={(value) => {
                  setSelectedYear(value)
                  const firstMonth = availableMonths.find((m) => m.year.toString() === value)
                  if (firstMonth) setSelectedMonth(firstMonth.month.toString())
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectYear')} />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('month')}</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectMonth')} />
                </SelectTrigger>
                <SelectContent>
                  {monthsForYear.map((m) => (
                    <SelectItem key={m.month} value={m.month.toString()}>
                      {t(`monthNames.${m.month - 1}`)} ({m.count} {tc('items')})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Summary */}
          {selectedSummary && (
            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <h4 className="font-medium">
                {t(`monthNames.${selectedSummary.month - 1}`)} {selectedSummary.year}
              </h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('expenseCount')}:</span>
                  <span className="ml-2 font-medium">{selectedSummary.count}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('withReceipt')}:</span>
                  <span className="ml-2 font-medium">{selectedSummary.withReceipts}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">{t('totalSum')}:</span>
                  <span className="ml-2 font-medium">
                    {Math.round(selectedSummary.total).toLocaleString(formatLocale)} {baseCurrencySymbol}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Export buttons */}
          <div className="space-y-2">
            <Label>{t('exportFormat')}</Label>
            <div className="grid grid-cols-1 gap-2">
              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => handleExport('zip')}
                disabled={!!exporting || !selectedSummary?.withReceipts}
              >
                {exporting === 'zip' ? (
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                ) : (
                  <FileArchive className="mr-3 h-5 w-5 text-amber-600" />
                )}
                <div className="text-left">
                  <div className="font-medium">{t('downloadAsZip')}</div>
                  <div className="text-xs text-muted-foreground">{t('zipDescription')}</div>
                </div>
              </Button>

              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => handleExport('pdf')}
                disabled={!!exporting || !selectedSummary?.withReceipts}
              >
                {exporting === 'pdf' ? (
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                ) : (
                  <FileText className="mr-3 h-5 w-5 text-red-600" />
                )}
                <div className="text-left">
                  <div className="font-medium">{t('downloadAsPdf')}</div>
                  <div className="text-xs text-muted-foreground">{t('pdfDescription')}</div>
                </div>
              </Button>

              <Button
                variant="outline"
                className="justify-start h-auto py-3"
                onClick={() => handleExport('individual')}
                disabled={!!exporting || !selectedSummary?.withReceipts}
              >
                {exporting === 'individual' ? (
                  <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                ) : (
                  <Files className="mr-3 h-5 w-5 text-blue-600" />
                )}
                <div className="text-left">
                  <div className="font-medium">{t('openIndividualFiles')}</div>
                  <div className="text-xs text-muted-foreground">{t('individualDescription')}</div>
                </div>
              </Button>
            </div>

            {selectedSummary && selectedSummary.withReceipts === 0 && (
              <p className="text-xs text-amber-600 mt-2">{t('noReceiptsForMonth')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
