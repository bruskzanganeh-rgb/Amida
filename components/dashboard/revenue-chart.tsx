'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import {
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { useGigFilter } from '@/lib/hooks/use-gig-filter'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'

type MonthlyRevenue = {
  month: string
  monthName: string
  revenue: number
  cumulative: number
}

type CompareRow = {
  monthName: string
  [year: string]: string | number
}

type ViewMode = 'invoice' | 'workday'
type ChartMode = 'timeline' | 'compare'

type InvoiceRow = {
  invoice_date: string
  subtotal: number
  exchange_rate: number | null
  gig_id?: string | null
  gig?: { position_id: string | null } | null
}

type GigRow = {
  fee: number | null
  fee_base: number | null
  total_days: number | null
  gig_dates: { date: string }[] | null
}

const YEAR_COLORS = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1']

type RevenueChartProps = {
  year?: string
  clientId?: string
  positionId?: string
}

export function RevenueChart({ year: yearProp, clientId, positionId }: RevenueChartProps = {}) {
  const t = useTranslations('dashboard')
  const monthNames = t.raw('monthNames') as string[]
  const formatLocale = useFormatLocale()
  const { symbol: baseCurrencySymbol } = useBaseCurrency()
  const [data, setData] = useState<MonthlyRevenue[]>([])
  const [compareData, setCompareData] = useState<CompareRow[]>([])
  const [compareYears, setCompareYears] = useState<string[]>([])
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString())
  const [availableYears, setAvailableYears] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('invoice')
  const [chartMode, setChartMode] = useState<ChartMode>('timeline')
  const supabase = createClient()
  const { shouldFilter, currentUserId } = useGigFilter()

  // Sync with external year prop
  useEffect(() => {
    if (yearProp && yearProp !== selectedYear) {
      setSelectedYear(yearProp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only sync when yearProp changes, not when selectedYear changes (would cause loop)
  }, [yearProp])

  // Reset chartMode when switching away from 'all'
  useEffect(() => {
    if (selectedYear !== 'all') {
      setChartMode('timeline')
    }
  }, [selectedYear])

  useEffect(() => {
    loadAvailableYears()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFilter, currentUserId])

  useEffect(() => {
    if (selectedYear) {
      if (viewMode === 'invoice') {
        loadRevenueData(selectedYear)
      } else {
        loadWorkdayData(selectedYear)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loader fns are stable; all data dependencies are listed
  }, [selectedYear, viewMode, clientId, positionId, shouldFilter, currentUserId])

  async function loadAvailableYears() {
    let invQuery = supabase.from('invoices').select('invoice_date').order('invoice_date', { ascending: true })
    if (shouldFilter && currentUserId) invQuery = invQuery.eq('user_id', currentUserId)
    const { data: invoices } = await invQuery

    const gdQuery = supabase.from('gig_dates').select('date, gig:gigs(user_id)').order('date', { ascending: true })
    const { data: rawGigDates } = await gdQuery
    const typedGigDates = (rawGigDates || []) as unknown as { date: string; gig: { user_id: string } | null }[]
    const gigDates =
      shouldFilter && currentUserId ? typedGigDates.filter((gd) => gd.gig?.user_id === currentUserId) : typedGigDates

    const invoiceYears = invoices?.map((inv) => new Date(inv.invoice_date).getFullYear().toString()) || []

    const gigYears = gigDates?.map((gd) => new Date(gd.date).getFullYear().toString()) || []

    const currentYearStr = new Date().getFullYear().toString()
    const years = [...new Set([...invoiceYears, ...gigYears, currentYearStr])].sort()

    setAvailableYears(years)
    if (selectedYear !== 'all' && years.length > 0 && !years.includes(selectedYear)) {
      setSelectedYear(years[years.length - 1])
    }
  }

  function buildCompareData(yearMonthData: { [yearMonth: string]: number }) {
    // yearMonthData keys are "YYYY-MM", values are amounts
    const yearSet = new Set<string>()
    const monthData: { [month: number]: { [year: string]: number } } = {}

    for (let i = 0; i < 12; i++) monthData[i] = {}

    Object.entries(yearMonthData).forEach(([key, value]) => {
      const [y, m] = key.split('-').map(Number)
      yearSet.add(y.toString())
      monthData[m - 1][y.toString()] = (monthData[m - 1][y.toString()] || 0) + value
    })

    const years = [...yearSet].sort()
    setCompareYears(years)

    const rows: CompareRow[] = []
    for (let i = 0; i < 12; i++) {
      const row: CompareRow = { monthName: monthNames[i] }
      years.forEach((y) => {
        row[y] = Math.round(monthData[i][y] || 0)
      })
      rows.push(row)
    }

    setCompareData(rows)
  }

  async function loadRevenueData(yearStr: string) {
    setLoading(true)

    const isAll = yearStr === 'all'
    const needsPositionFilter = positionId && positionId !== 'all'
    let query = supabase
      .from('invoices')
      .select(
        needsPositionFilter
          ? 'invoice_date, subtotal, exchange_rate, gig_id, gig:gigs(position_id)'
          : 'invoice_date, subtotal, exchange_rate',
      )
      .in('status', ['sent', 'paid'])

    if (!isAll) {
      const year = parseInt(yearStr)
      query = query.gte('invoice_date', `${year}-01-01`).lte('invoice_date', `${year}-12-31`)
    }
    if (clientId && clientId !== 'all') {
      query = query.eq('client_id', clientId)
    }
    if (shouldFilter && currentUserId) query = query.eq('user_id', currentUserId)

    const { data: rawInvoices } = (await query) as unknown as { data: InvoiceRow[] | null }

    // Filter by position client-side (invoices don't have position_id directly)
    let invoices = rawInvoices
    if (needsPositionFilter) {
      invoices = (rawInvoices || []).filter((inv) => {
        if (positionId === 'none') {
          // No position = invoices without gig OR gig without position
          return !inv.gig_id || !inv.gig?.position_id
        }
        return inv.gig?.position_id === positionId
      })
    }

    if (isAll) {
      // Build year-month map for both timeline and compare
      const timelineData: { [key: string]: number } = {}
      invoices?.forEach((inv) => {
        const d = new Date(inv.invoice_date)
        const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`
        timelineData[key] = (timelineData[key] || 0) + Math.round((inv.subtotal || 0) * (inv.exchange_rate || 1))
      })

      // Build compare data
      buildCompareData(timelineData)

      // Fill gaps for timeline
      const keys = Object.keys(timelineData).sort()
      if (keys.length > 0) {
        const [minY, minM] = keys[0].split('-').map(Number)
        const [maxY, maxM] = keys[keys.length - 1].split('-').map(Number)
        for (let y = minY; y <= maxY; y++) {
          const startM = y === minY ? minM : 1
          const endM = y === maxY ? maxM : 12
          for (let m = startM; m <= endM; m++) {
            const key = `${y}-${m.toString().padStart(2, '0')}`
            if (!(key in timelineData)) timelineData[key] = 0
          }
        }
      }

      let cumulative = 0
      const chartData: MonthlyRevenue[] = Object.keys(timelineData)
        .sort()
        .map((key) => {
          const [y, m] = key.split('-').map(Number)
          const revenue = timelineData[key]
          cumulative += revenue
          return {
            month: key,
            monthName: `${monthNames[m - 1]} ${y.toString().slice(-2)}`,
            revenue,
            cumulative,
          }
        })

      setData(chartData)
    } else {
      // Single year: 12 months
      const monthlyData: { [key: number]: number } = {}
      for (let i = 0; i < 12; i++) monthlyData[i] = 0

      invoices?.forEach((inv) => {
        const month = new Date(inv.invoice_date).getMonth()
        monthlyData[month] += Math.round((inv.subtotal || 0) * (inv.exchange_rate || 1))
      })

      let cumulative = 0
      const chartData: MonthlyRevenue[] = Object.entries(monthlyData).map(([month, revenue]) => {
        cumulative += revenue
        return {
          month: (parseInt(month) + 1).toString().padStart(2, '0'),
          monthName: monthNames[parseInt(month)],
          revenue,
          cumulative,
        }
      })

      setData(chartData)
      setCompareData([])
      setCompareYears([])
    }

    setLoading(false)
  }

  async function loadWorkdayData(yearStr: string) {
    setLoading(true)

    const isAll = yearStr === 'all'
    const year = isAll ? 0 : parseInt(yearStr)

    let gigQuery = supabase
      .from('gigs')
      .select('fee, fee_base, total_days, gig_dates(date)')
      .in('status', ['completed', 'invoiced', 'paid'])

    if (clientId && clientId !== 'all') {
      gigQuery = gigQuery.eq('client_id', clientId)
    }
    if (positionId && positionId !== 'all') {
      if (positionId === 'none') {
        gigQuery = gigQuery.is('position_id', null)
      } else {
        gigQuery = gigQuery.eq('position_id', positionId)
      }
    }
    if (shouldFilter && currentUserId) gigQuery = gigQuery.eq('user_id', currentUserId)

    const { data: gigs } = (await gigQuery) as unknown as { data: GigRow[] | null }

    if (isAll) {
      // Build year-month map
      const timelineData: { [key: string]: number } = {}

      gigs?.forEach((gig) => {
        const fee = gig.fee_base || gig.fee
        if (!fee || !gig.total_days || gig.total_days === 0) return
        const dayRate = fee / gig.total_days

        gig.gig_dates?.forEach((gd) => {
          const d = new Date(gd.date)
          const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`
          timelineData[key] = (timelineData[key] || 0) + dayRate
        })
      })

      // Build compare data
      buildCompareData(timelineData)

      // Fill gaps for timeline
      const keys = Object.keys(timelineData).sort()
      if (keys.length > 0) {
        const [minY, minM] = keys[0].split('-').map(Number)
        const [maxY, maxM] = keys[keys.length - 1].split('-').map(Number)
        for (let y = minY; y <= maxY; y++) {
          const startM = y === minY ? minM : 1
          const endM = y === maxY ? maxM : 12
          for (let m = startM; m <= endM; m++) {
            const key = `${y}-${m.toString().padStart(2, '0')}`
            if (!(key in timelineData)) timelineData[key] = 0
          }
        }
      }

      let cumulative = 0
      const chartData: MonthlyRevenue[] = Object.keys(timelineData)
        .sort()
        .map((key) => {
          const [y, m] = key.split('-').map(Number)
          const revenue = Math.round(timelineData[key])
          cumulative += revenue
          return {
            month: key,
            monthName: `${monthNames[m - 1]} ${y.toString().slice(-2)}`,
            revenue,
            cumulative,
          }
        })

      setData(chartData)
    } else {
      // Single year: 12 months
      const monthlyData: { [key: number]: number } = {}
      for (let i = 0; i < 12; i++) monthlyData[i] = 0

      gigs?.forEach((gig) => {
        const fee = gig.fee_base || gig.fee
        if (!fee || !gig.total_days || gig.total_days === 0) return
        const dayRate = fee / gig.total_days

        gig.gig_dates?.forEach((gd) => {
          const date = new Date(gd.date)
          if (date.getFullYear() === year) {
            const month = date.getMonth()
            monthlyData[month] += dayRate
          }
        })
      })

      let cumulative = 0
      const chartData: MonthlyRevenue[] = Object.entries(monthlyData).map(([month, revenue]) => {
        cumulative += revenue
        return {
          month: (parseInt(month) + 1).toString().padStart(2, '0'),
          monthName: monthNames[parseInt(month)],
          revenue: Math.round(revenue),
          cumulative: Math.round(cumulative),
        }
      })

      setData(chartData)
      setCompareData([])
      setCompareYears([])
    }

    setLoading(false)
  }

  const totalYearRevenue = data.reduce((sum, d) => sum + d.revenue, 0)
  const isAllYears = selectedYear === 'all'
  const isTimeline = isAllYears && chartMode === 'timeline' && data.length > 12
  const showCompare = isAllYears && chartMode === 'compare' && compareData.length > 0
  const chartHeight = isTimeline ? 180 : 140

  return (
    <Card className="col-span-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2 pt-3">
        <div className="flex items-center gap-3">
          <CardTitle className="text-sm font-medium">
            {viewMode === 'invoice' ? t('invoiced') : t('worked')}
            {selectedYear !== 'all' ? ` ${selectedYear}` : ''}
          </CardTitle>
          <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
            {totalYearRevenue.toLocaleString(formatLocale)} {baseCurrencySymbol}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isAllYears && (
            <div className="flex rounded-lg border overflow-hidden">
              <button
                onClick={() => setChartMode('timeline')}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  chartMode === 'timeline'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('timeline')}
              </button>
              <button
                onClick={() => setChartMode('compare')}
                className={`px-3 py-1.5 text-xs transition-colors ${
                  chartMode === 'compare'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('compare')}
              </button>
            </div>
          )}
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setViewMode('invoice')}
              className={`px-3 py-1.5 text-xs transition-colors ${
                viewMode === 'invoice'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('invoiced')}
            </button>
            <button
              onClick={() => setViewMode('workday')}
              className={`px-3 py-1.5 text-xs transition-colors ${
                viewMode === 'workday'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {t('worked')}
            </button>
          </div>
          {!yearProp && (
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="h-7 text-xs" style={{ width: 115 }}>
                <SelectValue placeholder={t('year')} />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {loading ? (
          <div className="h-[160px] flex items-end gap-2 px-8 pb-4">
            {[40, 65, 85, 50, 70, 45, 55, 75, 60, 90, 72, 95].map((height, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <Skeleton className="w-full rounded-t" style={{ height: `${height}px` }} />
                <Skeleton className="h-2 w-6" />
              </div>
            ))}
          </div>
        ) : showCompare ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={compareData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="monthName"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                width={35}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString(formatLocale)} ${baseCurrencySymbol}`,
                  name,
                ]}
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--foreground)',
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} iconSize={10} />
              {compareYears.map((year, i) => (
                <Bar
                  key={year}
                  dataKey={year}
                  fill={YEAR_COLORS[i % YEAR_COLORS.length]}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={20}
                  animationDuration={800}
                  animationEasing="ease-out"
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="monthName"
                tick={{ fontSize: isTimeline ? 9 : 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                interval={isTimeline ? 2 : 0}
                angle={isTimeline ? -45 : 0}
                textAnchor={isTimeline ? 'end' : 'middle'}
                height={isTimeline ? 40 : 20}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                width={35}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                width={35}
              />
              <Tooltip
                formatter={(value: number, name: string) => [
                  `${value.toLocaleString(formatLocale)} ${baseCurrencySymbol}`,
                  name === 'revenue' ? (viewMode === 'invoice' ? t('invoiced') : t('worked')) : t('total'),
                ]}
                labelFormatter={(label) => (selectedYear !== 'all' ? `${label} ${selectedYear}` : label)}
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  color: 'var(--foreground)',
                }}
              />
              <Bar
                yAxisId="left"
                dataKey="revenue"
                fill="#3b82f6"
                radius={[3, 3, 0, 0]}
                maxBarSize={30}
                animationDuration={800}
                animationEasing="ease-out"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="cumulative"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
                animationDuration={1200}
                animationEasing="ease-out"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
