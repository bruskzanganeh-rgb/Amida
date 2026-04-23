'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/badge'
import { Clock, AlertTriangle, CheckCircle } from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { cn } from '@/lib/utils'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { formatCurrency, type SupportedCurrency } from '@/lib/currency/exchange'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'

type Invoice = {
  id: string
  invoice_number: number
  total: number
  total_base: number | null
  currency: string | null
  due_date: string
  status: string
  client: { name: string }
}

export function UpcomingPayments({ className }: { className?: string }) {
  const t = useTranslations('dashboard')
  const tc = useTranslations('common')
  const formatLocale = useFormatLocale()
  const { symbol: baseCurrencySymbol } = useBaseCurrency()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadInvoices() {
      setLoading(true)

      const { data } = await supabase
        .from('invoices')
        .select('id, invoice_number, total, total_base, currency, due_date, status, client:clients(name)')
        .in('status', ['sent', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(8)

      setInvoices((data || []) as unknown as Invoice[])
      setLoading(false)
    }
    loadInvoices()
  }, [supabase])

  function getDaysUntilDue(dueDate: string): number {
    return differenceInDays(new Date(dueDate), new Date())
  }

  function getStatusBadge(daysUntil: number) {
    if (daysUntil < 0) {
      return (
        <Badge variant="destructive" className="text-[10px]">
          <AlertTriangle className="w-3 h-3 mr-1" />
          {Math.abs(daysUntil)} {t('daysLate')}
        </Badge>
      )
    }
    if (daysUntil === 0) {
      return (
        <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px]">
          <Clock className="w-3 h-3 mr-1" />
          {tc('today')}
        </Badge>
      )
    }
    if (daysUntil <= 7) {
      return (
        <Badge variant="secondary" className="text-[10px]">
          <Clock className="w-3 h-3 mr-1" />
          {daysUntil}d
        </Badge>
      )
    }
    return (
      <Badge className="bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]">
        <CheckCircle className="w-3 h-3 mr-1" />
        {daysUntil}d
      </Badge>
    )
  }

  const totalUnpaid = invoices.reduce((sum, inv) => sum + (inv.total_base || inv.total), 0)

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{t('unpaidInvoices')}</CardTitle>
          <span className="text-sm font-semibold">
            {totalUnpaid.toLocaleString(formatLocale)} {baseCurrencySymbol}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pb-4 flex-1 flex flex-col" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
                <Skeleton className="h-4 w-24" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-5 w-12 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground">
            <CheckCircle className="h-6 w-6 mx-auto mb-1 text-emerald-600 dark:text-emerald-400" />
            <p className="text-xs">{t('allPaid')}</p>
          </div>
        ) : (
          <div className="flex-1 relative" style={{ minHeight: 0 }}>
            <div className="max-h-[230px] overflow-y-auto md:max-h-none md:absolute md:inset-0 space-y-1.5 pr-1">
              {invoices.slice(0, 5).map((invoice) => {
                const daysUntil = getDaysUntilDue(invoice.due_date)
                return (
                  <div
                    key={invoice.id}
                    className={`flex items-center justify-between py-2 px-3 rounded-lg text-xs transition-colors ${
                      daysUntil < 0 ? 'bg-red-500/10' : 'bg-secondary/50 hover:bg-secondary'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium truncate block">{invoice.client.name}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold">
                        {formatCurrency(invoice.total, (invoice.currency || 'SEK') as SupportedCurrency)}
                      </span>
                      {getStatusBadge(daysUntil)}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
