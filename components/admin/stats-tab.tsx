'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTranslations } from 'next-intl'
import { formatDistanceToNow, format, subMonths, startOfMonth, endOfMonth } from 'date-fns'
import { sv, enUS } from 'date-fns/locale'
import { useLocale } from 'next-intl'

type SponsorImpressionRow = {
  id: string
  name: string
  app: number
  pdf: number
  click: number
  total: number
  latest: string
}

type Stats = {
  totalUsers: number
  proUsers: number
  freeUsers: number
  mrr: number
  arr: number
  monthlySubscribers: number
  yearlySubscribers: number
  adminSetPro: number
  totalImpressions: number
  sponsorImpressionBreakdown?: SponsorImpressionRow[]
}

export function StatsTab({ stats: initialStats }: { stats: Stats | null }) {
  const t = useTranslations('admin')
  const locale = useLocale()
  const [stats, setStats] = useState(initialStats)
  const [period, setPeriod] = useState('all')

  // Generate year options (current year back to 2024)
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: currentYear - 2023 }, (_, i) => {
    const year = currentYear - i
    const from = new Date(year, 0, 1).toISOString()
    const to = new Date(year, 11, 31, 23, 59, 59).toISOString()
    return { value: `${from}|${to}`, label: `${year}` }
  })

  // Generate month options (last 6 months)
  const monthOptions = Array.from({ length: 6 }, (_, i) => {
    const date = subMonths(new Date(), i)
    const from = startOfMonth(date).toISOString()
    const to = endOfMonth(date).toISOString()
    const label = format(date, 'MMMM yyyy', { locale: locale === 'sv' ? sv : enUS })
    return { value: `${from}|${to}`, label }
  })

  const fetchStats = useCallback(async (from?: string, to?: string) => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    const res = await fetch(`/api/admin/stats?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      setStats(data)
    }
  }, [])

  useEffect(() => {
    setStats(initialStats)
  }, [initialStats])

  function handlePeriodChange(value: string) {
    setPeriod(value)
    if (value === 'all') {
      fetchStats()
    } else {
      const [from, to] = value.split('|')
      fetchStats(from, to)
    }
  }

  return (
    <div className="space-y-4">
      {/* Row 1: User counts + MRR */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('totalUsers')}</p>
            <p className="text-2xl font-bold">{stats?.totalUsers ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('proUsers')}</p>
            <p className="text-2xl font-bold">
              {stats?.proUsers ?? '-'}
              {(stats?.adminSetPro ?? 0) > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  (+{stats!.adminSetPro} {t('adminSetPro')})
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('freeUsers')}</p>
            <p className="text-2xl font-bold">{stats?.freeUsers ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('mrr')}</p>
            <p className="text-2xl font-bold">{stats?.mrr ?? 0} SEK</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: ARR + Subscriber breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('arr')}</p>
            <p className="text-2xl font-bold">{stats?.arr ?? 0} SEK</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('monthlySubscribers')}</p>
            <p className="text-2xl font-bold">{stats?.monthlySubscribers ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t('perMonth')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('yearlySubscribers')}</p>
            <p className="text-2xl font-bold">{stats?.yearlySubscribers ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t('perYear')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Sponsor impressions */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-baseline gap-3">
              <p className="text-xs text-muted-foreground">{t('sponsorImpressions')}</p>
              <p className="text-2xl font-bold">{stats?.totalImpressions ?? 0}</p>
            </div>
            <Select value={period} onValueChange={handlePeriodChange}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allTime')}</SelectItem>
                {yearOptions.map((y) => (
                  <SelectItem key={y.value} value={y.value}>
                    {y.label}
                  </SelectItem>
                ))}
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {stats?.sponsorImpressionBreakdown && stats.sponsorImpressionBreakdown.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead className="text-right">{t('appImpressions')}</TableHead>
                  <TableHead className="text-right">{t('pdfImpressions')}</TableHead>
                  <TableHead className="text-right">{t('clicks')}</TableHead>
                  <TableHead className="text-right">{t('total')}</TableHead>
                  <TableHead className="text-right">{t('latest')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.sponsorImpressionBreakdown.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">{s.app}</TableCell>
                    <TableCell className="text-right">{s.pdf}</TableCell>
                    <TableCell className="text-right">{s.click}</TableCell>
                    <TableCell className="text-right font-medium">{s.total}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {s.latest
                        ? formatDistanceToNow(new Date(s.latest), {
                            addSuffix: true,
                            locale: locale === 'sv' ? sv : enUS,
                          })
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noData')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
