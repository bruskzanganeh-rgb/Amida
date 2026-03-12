'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { TrendingUp, TrendingDown, Minus, BarChart3, ArrowUpRight } from 'lucide-react'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import Link from 'next/link'

type YearData = {
  year: number
  revenue: number
  ytdRevenue: number
  gigCount: number
  ytdGigCount: number
  workDays: number
  ytdWorkDays: number
  newClients: number
}

function getChangePercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0
  return ((current - previous) / previous) * 100
}

function ChangeIndicator({
  current,
  previous,
  showAbsolute = false,
}: {
  current: number
  previous: number
  showAbsolute?: boolean
}) {
  const change = getChangePercent(current, previous)
  const diff = current - previous

  if (Math.abs(change) < 1) {
    return (
      <span className="flex items-center text-muted-foreground text-[10px]">
        <Minus className="w-3 h-3 mr-0.5" />
        0%
      </span>
    )
  }

  if (change > 0) {
    return (
      <span className="flex items-center text-emerald-600 dark:text-emerald-400 text-[10px]">
        <TrendingUp className="w-3 h-3 mr-0.5" />+{change.toFixed(0)}%
        {showAbsolute && (
          <span className="ml-1 text-emerald-500 dark:text-emerald-300">
            ({diff > 0 ? '+' : ''}
            {diff})
          </span>
        )}
      </span>
    )
  }

  return (
    <span className="flex items-center text-red-600 dark:text-red-400 text-[10px]">
      <TrendingDown className="w-3 h-3 mr-0.5" />
      {change.toFixed(0)}%{showAbsolute && <span className="ml-1 text-red-500 dark:text-red-300">({diff})</span>}
    </span>
  )
}

export function YearComparison() {
  const t = useTranslations('dashboard')
  const tc = useTranslations('common')
  const formatLocale = useFormatLocale()
  const [currentYear, setCurrentYear] = useState<YearData | null>(null)
  const [previousYear, setPreviousYear] = useState<YearData | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadYearComparison() {
      setLoading(true)

      const now = new Date()
      const currentYearNum = now.getFullYear()
      const previousYearNum = currentYearNum - 1
      const currentMonth = now.getMonth() + 1
      const currentDay = now.getDate()
      const ytdEndDatePrev = `${previousYearNum}-${currentMonth.toString().padStart(2, '0')}-${currentDay.toString().padStart(2, '0')}`

      // Fetch invoices
      const { data: invoices } = await supabase
        .from('invoices')
        .select('invoice_date, subtotal, exchange_rate')
        .in('status', ['sent', 'paid'])
        .gte('invoice_date', `${previousYearNum}-01-01`)
        .lte('invoice_date', `${currentYearNum}-12-31`)

      // Fetch gigs with status completed/invoiced/paid
      const { data: gigs } = await supabase
        .from('gigs')
        .select('id, start_date, total_days, client_id')
        .in('status', ['accepted', 'completed', 'invoiced', 'paid'])
        .gte('start_date', `${previousYearNum}-01-01`)
        .lte('start_date', `${currentYearNum}-12-31`)

      // Fetch clients to find new ones this year
      const { data: clients } = await supabase
        .from('clients')
        .select('id, created_at')
        .gte('created_at', `${previousYearNum}-01-01`)
        .lte('created_at', `${currentYearNum}-12-31T23:59:59`)

      if (invoices && gigs) {
        // Current year calculations
        const currentYearInvoices = invoices.filter(
          (inv) => inv.invoice_date && new Date(inv.invoice_date).getFullYear() === currentYearNum,
        )
        const currentYearGigs = gigs.filter(
          (g) => g.start_date && new Date(g.start_date).getFullYear() === currentYearNum,
        )
        const currentYearNewClients = (clients || []).filter(
          (c) => c.created_at && new Date(c.created_at).getFullYear() === currentYearNum,
        )

        // Previous year calculations
        const previousYearInvoices = invoices.filter(
          (inv) => inv.invoice_date && new Date(inv.invoice_date).getFullYear() === previousYearNum,
        )
        const previousYearGigs = gigs.filter(
          (g) => g.start_date && new Date(g.start_date).getFullYear() === previousYearNum,
        )

        // YTD calculations for previous year (same period)
        const previousYearYTDInvoices = previousYearInvoices.filter((inv) => inv.invoice_date <= ytdEndDatePrev)
        const previousYearYTDGigs = previousYearGigs.filter((g) => g.start_date! <= ytdEndDatePrev)

        setCurrentYear({
          year: currentYearNum,
          revenue: currentYearInvoices.reduce((sum, inv) => sum + (inv.subtotal || 0) * (inv.exchange_rate || 1), 0),
          ytdRevenue: currentYearInvoices.reduce((sum, inv) => sum + (inv.subtotal || 0) * (inv.exchange_rate || 1), 0),
          gigCount: currentYearGigs.length,
          ytdGigCount: currentYearGigs.length,
          workDays: currentYearGigs.reduce((sum, g) => sum + (g.total_days || 1), 0),
          ytdWorkDays: currentYearGigs.reduce((sum, g) => sum + (g.total_days || 1), 0),
          newClients: currentYearNewClients.length,
        })

        setPreviousYear({
          year: previousYearNum,
          revenue: previousYearInvoices.reduce((sum, inv) => sum + (inv.subtotal || 0) * (inv.exchange_rate || 1), 0),
          ytdRevenue: previousYearYTDInvoices.reduce(
            (sum, inv) => sum + (inv.subtotal || 0) * (inv.exchange_rate || 1),
            0,
          ),
          gigCount: previousYearGigs.length,
          ytdGigCount: previousYearYTDGigs.length,
          workDays: previousYearGigs.reduce((sum, g) => sum + (g.total_days || 1), 0),
          ytdWorkDays: previousYearYTDGigs.reduce((sum, g) => sum + (g.total_days || 1), 0),
          newClients: 0,
        })
      }

      setLoading(false)
    }
    loadYearComparison()
  }, [supabase])

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2 pt-4">
          <CardTitle className="text-sm font-medium">{t('yearComparison')}</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="space-y-3">
            <div className="py-2 px-3 rounded-lg bg-secondary/50">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-5 w-28" />
            </div>
            <div className="py-2 px-3 rounded-lg bg-secondary/50">
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-5 w-12" />
            </div>
            <div className="py-2 px-3 rounded-lg bg-secondary/50">
              <Skeleton className="h-3 w-24 mb-2" />
              <Skeleton className="h-5 w-12" />
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
            {t('yearComparison')}
          </CardTitle>
          <Link
            href="/analytics"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            {tc('more')}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {currentYear?.year} vs {previousYear?.year} (YTD)
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
            <div>
              <span className="text-xs text-muted-foreground">{t('ytdRevenue')}</span>
              <p className="text-sm font-bold">
                {(currentYear?.ytdRevenue || 0).toLocaleString(formatLocale)} {tc('kr')}
              </p>
            </div>
            <ChangeIndicator current={currentYear?.ytdRevenue || 0} previous={previousYear?.ytdRevenue || 0} />
          </div>

          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
            <div>
              <span className="text-xs text-muted-foreground">{t('gigCount')}</span>
              <p className="text-sm font-bold">{currentYear?.ytdGigCount || 0}</p>
            </div>
            <ChangeIndicator
              current={currentYear?.ytdGigCount || 0}
              previous={previousYear?.ytdGigCount || 0}
              showAbsolute
            />
          </div>

          <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-secondary/50">
            <div>
              <span className="text-xs text-muted-foreground">{t('workDays')}</span>
              <p className="text-sm font-bold">{currentYear?.ytdWorkDays || 0}</p>
            </div>
            <ChangeIndicator
              current={currentYear?.ytdWorkDays || 0}
              previous={previousYear?.ytdWorkDays || 0}
              showAbsolute
            />
          </div>

          {(currentYear?.newClients || 0) > 0 && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-center">
                <span className="font-semibold text-blue-600 dark:text-blue-400">{currentYear?.newClients}</span>
                <span className="text-muted-foreground"> {t('newClientsThisYear')}</span>
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
