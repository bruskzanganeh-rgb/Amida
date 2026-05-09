'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Download, Loader2, FileText, Receipt, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'

const currentYear = new Date().getFullYear()
const years = Array.from({ length: 5 }, (_, i) => currentYear - i)
const months = Array.from({ length: 12 }, (_, i) => i + 1)

export default function ExportTab() {
  const t = useTranslations('documents')
  const tc = useTranslations('common')
  const [year, setYear] = useState(currentYear.toString())
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString())
  const [format, setFormat] = useState('zip')
  const [includeExpenses, setIncludeExpenses] = useState(true)
  const [includeInvoices, setIncludeInvoices] = useState(false)
  const [exporting, setExporting] = useState(false)

  async function handleExport() {
    if (!includeExpenses && !includeInvoices) {
      toast.error(t('selectAtLeastOne'))
      return
    }

    setExporting(true)
    try {
      // For now, use existing expense export API
      if (includeExpenses) {
        const params = new URLSearchParams({
          year,
          month,
          format,
        })
        const response = await fetch(`/api/expenses/export?${params}`)

        if (!response.ok) {
          const error = await response.json().catch(() => ({ error: 'Export failed' }))
          throw new Error(error.error)
        }

        const blob = await response.blob()
        const contentDisposition = response.headers.get('Content-Disposition')
        const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || `export-${year}-${month}.${format}`

        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)

        toast.success(t('exportSuccess'))
      }

      if (includeInvoices) {
        // Export invoices as CSV
        const params = new URLSearchParams({
          year,
          month,
          format: 'csv',
          type: 'invoices',
        })
        const response = await fetch(`/api/documents/export?${params}`)

        if (response.ok) {
          const blob = await response.blob()
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `fakturor-${year}-${month}.csv`
          a.click()
          URL.revokeObjectURL(url)
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('exportError'))
    } finally {
      setExporting(false)
    }
  }

  const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('sv-SE', { month: 'long' })

  return (
    <div className="max-w-lg space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('exportTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Period */}
          <div className="space-y-2">
            <Label>{t('period')}</Label>
            <div className="flex gap-2">
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-28">
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
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m} value={m.toString()}>
                      {new Date(2024, m - 1).toLocaleDateString('sv-SE', { month: 'long' })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* What to include */}
          <div className="space-y-3">
            <Label>{t('includeIn')}</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-expenses"
                checked={includeExpenses}
                onCheckedChange={(v) => setIncludeExpenses(!!v)}
              />
              <label htmlFor="include-expenses" className="flex items-center gap-2 text-sm cursor-pointer">
                <Receipt className="h-4 w-4" />
                {t('includeExpenses')}
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-invoices"
                checked={includeInvoices}
                onCheckedChange={(v) => setIncludeInvoices(!!v)}
              />
              <label htmlFor="include-invoices" className="flex items-center gap-2 text-sm cursor-pointer">
                <FileText className="h-4 w-4" />
                {t('includeInvoices')}
              </label>
            </div>
          </div>

          {/* Format */}
          {includeExpenses && (
            <div className="space-y-2">
              <Label>{t('format')}</Label>
              <Select value={format} onValueChange={setFormat}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zip">ZIP ({t('csvAndReceipts')})</SelectItem>
                  <SelectItem value="pdf">PDF ({t('summaryAndReceipts')})</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <Button
            onClick={handleExport}
            disabled={exporting || (!includeExpenses && !includeInvoices)}
            className="w-full"
          >
            {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            {t('exportButton', { month: monthName, year })}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
