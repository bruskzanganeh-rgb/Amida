'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Loader2, Download, FileArchive, FileText, Files, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'

type ExportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type MonthSummary = {
  year: number
  month: number
  count: number
  withReceipts: number
  total: number
}

export function ExportDialog({ open, onOpenChange }: ExportDialogProps) {
  const t = useTranslations('expense')
  const tc = useTranslations('common')
  const formatLocale = useFormatLocale()
  const { symbol: baseCurrencySymbol } = useBaseCurrency()
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [availableMonths, setAvailableMonths] = useState<MonthSummary[]>([])
  const [selectedYear, setSelectedYear] = useState<string>('')
  const [selectedMonth, setSelectedMonth] = useState<string>('')
  const supabase = createClient()

  // Ladda tillgängliga månader med utgifter
  useEffect(() => {
    if (open) {
      loadAvailableMonths()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAvailableMonths is stable; only re-run when dialog opens
  }, [open])

  async function loadAvailableMonths() {
    setLoading(true)
    const { data: expenses } = await supabase
      .from('expenses')
      .select('date, amount, amount_base, attachment_url')
      .order('date', { ascending: false })

    if (expenses) {
      // Gruppera per år/månad
      const monthMap = new Map<string, MonthSummary>()

      for (const expense of expenses) {
        const date = new Date(expense.date)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        const key = `${year}-${month}`

        if (!monthMap.has(key)) {
          monthMap.set(key, {
            year,
            month,
            count: 0,
            withReceipts: 0,
            total: 0,
          })
        }

        const summary = monthMap.get(key)!
        summary.count++
        summary.total += expense.amount_base || expense.amount
        if (expense.attachment_url) {
          summary.withReceipts++
        }
      }

      const months = Array.from(monthMap.values()).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year
        return b.month - a.month
      })

      setAvailableMonths(months)

      // Förval senaste månaden med utgifter
      if (months.length > 0) {
        setSelectedYear(months[0].year.toString())
        setSelectedMonth(months[0].month.toString())
      }
    }
    setLoading(false)
  }

  // Hämta vald månads summering
  const selectedSummary = availableMonths.find(
    (m) => m.year.toString() === selectedYear && m.month.toString() === selectedMonth,
  )

  // Unika år
  const years = [...new Set(availableMonths.map((m) => m.year))].sort((a, b) => b - a)

  // Månader för valt år
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
        // Hämta lista med URLer
        const response = await fetch(
          `/api/expenses/export?year=${selectedYear}&month=${selectedMonth}&format=individual&locale=${formatLocale}`,
        )
        const result = await response.json()

        if (!response.ok) {
          throw new Error(result.error || t('exportFailed'))
        }

        // Öppna varje kvitto i ny flik (endast de med bilagor)
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
        // Ladda ner ZIP eller PDF
        const response = await fetch(
          `/api/expenses/export?year=${selectedYear}&month=${selectedMonth}&format=${format}&locale=${formatLocale}`,
        )

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || t('exportFailed'))
        }

        // Skapa download
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            {t('exportReceipts')}
          </DialogTitle>
          <DialogDescription>{t('downloadReceiptsForMonth')}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : availableMonths.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('noExpensesToExport')}</p>
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Välj år och månad */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('year')}</Label>
                <Select
                  value={selectedYear}
                  onValueChange={(value) => {
                    setSelectedYear(value)
                    // Välj första månaden för det året
                    const firstMonth = availableMonths.find((m) => m.year.toString() === value)
                    if (firstMonth) {
                      setSelectedMonth(firstMonth.month.toString())
                    }
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

            {/* Summering */}
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

            {/* Export-knappar */}
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
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tc('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
