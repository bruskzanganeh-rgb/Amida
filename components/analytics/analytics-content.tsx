'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useGigFilter } from '@/lib/hooks/use-gig-filter'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart3, TrendingUp, XCircle, Calendar, Music, CalendarClock, Wallet, HelpCircle } from 'lucide-react'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'
import dynamic from 'next/dynamic'

const RevenueChart = dynamic(
  () => import('@/components/dashboard/revenue-chart').then((mod) => ({ default: mod.RevenueChart })),
  { ssr: false, loading: () => <div className="h-[300px] animate-pulse bg-muted rounded" /> },
)

const LazyBarChart = dynamic(() => import('@/components/analytics/top-clients-chart'), {
  ssr: false,
  loading: () => <div className="h-[160px] animate-pulse bg-muted rounded" />,
})

type Gig = {
  id: string
  date: string
  fee: number | null
  fee_base: number | null
  currency: string | null
  total_days: number
  project_name: string | null
  status: string
  position_id: string | null
  client: { id: string; name: string } | null
  gig_type: { name: string }
  position: { id: string; name: string } | null
}

type Invoice = {
  invoice_date: string
  subtotal: number
  exchange_rate: number | null
  client: { id: string; name: string } | null
}

type Client = { id: string; name: string }
type Position = { id: string; name: string }

export function AnalyticsContent() {
  const t = useTranslations('analytics')
  const tc = useTranslations('common')
  const tGig = useTranslations('gig')
  const tStatus = useTranslations('status')
  const formatLocale = useFormatLocale()
  const { symbol: currencySymbol, perDayLabel } = useBaseCurrency()

  const [gigs, setGigs] = useState<Gig[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString())
  const [selectedClient, setSelectedClient] = useState<string>('all')
  const [selectedPosition, setSelectedPosition] = useState<string>('all')
  const supabase = createClient()
  const { shouldFilter, currentUserId } = useGigFilter()

  useEffect(() => {
    async function loadData() {
      setLoading(true)

      let gigQuery = supabase
        .from('gigs')
        .select(
          `
          id,
          date,
          fee,
          fee_base,
          currency,
          total_days,
          project_name,
          status,
          position_id,
          client:clients(id, name),
          gig_type:gig_types(name),
          position:positions(id, name)
        `,
        )
        .neq('status', 'draft')
      if (shouldFilter && currentUserId) gigQuery = gigQuery.eq('user_id', currentUserId)

      let invoiceQuery = supabase
        .from('invoices')
        .select('invoice_date, subtotal, exchange_rate, client:clients(id, name)')
        .in('status', ['sent', 'paid'])
      if (shouldFilter && currentUserId) invoiceQuery = invoiceQuery.eq('user_id', currentUserId)

      const [gigsResult, invoicesResult, clientsResult, positionsResult] = await Promise.all([
        gigQuery.order('date', { ascending: false }),
        invoiceQuery.order('invoice_date', { ascending: false }),
        supabase.from('clients').select('id, name').order('name'),
        supabase.from('positions').select('id, name').order('sort_order'),
      ])

      if (gigsResult.data) setGigs(gigsResult.data as unknown as Gig[])
      if (invoicesResult.data) setInvoices(invoicesResult.data as unknown as Invoice[])
      if (clientsResult.data) setClients(clientsResult.data)
      if (positionsResult.data) setPositions(positionsResult.data)
      setLoading(false)
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFilter, currentUserId])

  // Get unique years from gigs and invoices
  const gigYears = gigs.map((g) => new Date(g.date).getFullYear())
  const invoiceYears = invoices.map((inv) => new Date(inv.invoice_date).getFullYear())
  const years = [...new Set([...gigYears, ...invoiceYears])].sort((a, b) => b - a)

  // Filter gigs based on selected year, client and position
  const filteredGigs = gigs.filter((g) => {
    const yearMatch = selectedYear === 'all' || new Date(g.date).getFullYear().toString() === selectedYear
    const clientMatch = selectedClient === 'all' || g.client?.id === selectedClient
    const positionMatch =
      selectedPosition === 'all' ||
      g.position_id === selectedPosition ||
      (selectedPosition === 'none' && !g.position_id)
    return yearMatch && clientMatch && positionMatch
  })

  // Calculate statistics
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const completedGigs = filteredGigs.filter((g) => ['completed', 'invoiced', 'paid'].includes(g.status))
  const declinedGigs = filteredGigs.filter((g) => g.status === 'declined')

  const upcomingGigs = filteredGigs.filter((g) => g.status === 'accepted' && new Date(g.date) >= today)

  const tentativeGigs = filteredGigs.filter((g) => g.status === 'tentative' && new Date(g.date) >= today)

  const feeInBase = (g: Gig) => g.fee_base ?? g.fee ?? 0
  const totalRevenue = completedGigs.reduce((sum, g) => sum + feeInBase(g), 0)
  const totalDays = completedGigs.reduce((sum, g) => sum + g.total_days, 0)
  const declinedAmount = declinedGigs.reduce((sum, g) => sum + feeInBase(g), 0)
  const avgPerDay = totalDays > 0 ? totalRevenue / totalDays : 0

  const upcomingRevenue = upcomingGigs.reduce((sum, g) => sum + feeInBase(g), 0)
  const upcomingDays = upcomingGigs.reduce((sum, g) => sum + g.total_days, 0)
  const nextGig =
    upcomingGigs.length > 0
      ? upcomingGigs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0]
      : null

  const tentativeRevenue = tentativeGigs.reduce((sum, g) => sum + feeInBase(g), 0)
  const tentativeDays = tentativeGigs.reduce((sum, g) => sum + g.total_days, 0)

  // Calculate best paying gigs per day
  const gigsWithDayRate = completedGigs
    .filter((g) => g.fee && g.total_days > 0)
    .map((g) => ({
      ...g,
      feeBase: feeInBase(g),
      dayRate: feeInBase(g) / g.total_days,
    }))
    .sort((a, b) => b.dayRate - a.dayRate)
    .slice(0, 10)

  // Calculate position statistics
  const positionStats = positions
    .map((position) => {
      const positionGigs = completedGigs.filter((g) => g.position_id === position.id)
      const totalFee = positionGigs.reduce((sum, g) => sum + feeInBase(g), 0)
      const totalDaysForPosition = positionGigs.reduce((sum, g) => sum + g.total_days, 0)
      const avgPerDayForPosition = totalDaysForPosition > 0 ? totalFee / totalDaysForPosition : 0
      return {
        id: position.id,
        name: position.name,
        gigCount: positionGigs.length,
        totalDays: totalDaysForPosition,
        totalRevenue: totalFee,
        avgPerDay: avgPerDayForPosition,
      }
    })
    .filter((p) => p.gigCount > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue)

  // Add "no position" stats
  const noPositionGigs = completedGigs.filter((g) => !g.position_id)
  const noPositionStats = {
    id: 'none',
    name: t('noPosition'),
    gigCount: noPositionGigs.length,
    totalDays: noPositionGigs.reduce((sum, g) => sum + g.total_days, 0),
    totalRevenue: noPositionGigs.reduce((sum, g) => sum + feeInBase(g), 0),
    avgPerDay:
      noPositionGigs.reduce((sum, g) => sum + g.total_days, 0) > 0
        ? noPositionGigs.reduce((sum, g) => sum + feeInBase(g), 0) /
          noPositionGigs.reduce((sum, g) => sum + g.total_days, 0)
        : 0,
  }

  const allPositionStats = noPositionGigs.length > 0 ? [...positionStats, noPositionStats] : positionStats

  // Calculate top clients from invoice data (filtered by year and client)
  const filteredInvoices = invoices.filter((inv) => {
    const yearMatch = selectedYear === 'all' || new Date(inv.invoice_date).getFullYear().toString() === selectedYear
    const clientMatch = selectedClient === 'all' || inv.client?.id === selectedClient
    return yearMatch && clientMatch
  })
  const clientRevenue: { [key: string]: { name: string; revenue: number } } = {}
  filteredInvoices.forEach((inv) => {
    if (inv.client) {
      const id = inv.client.id
      if (!clientRevenue[id]) clientRevenue[id] = { name: inv.client.name, revenue: 0 }
      clientRevenue[id].revenue += Math.round((inv.subtotal || 0) * (inv.exchange_rate || 1))
    }
  })
  const topClients = Object.values(clientRevenue)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectYear')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allYears')}</SelectItem>
              {years.map((year) => (
                <SelectItem key={year} value={year.toString()}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={selectedClient} onValueChange={setSelectedClient}>
            <SelectTrigger>
              <SelectValue placeholder={t('selectClient')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('allClients')}</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {positions.length > 0 && (
          <div>
            <Select value={selectedPosition} onValueChange={setSelectedPosition}>
              <SelectTrigger>
                <SelectValue placeholder={t('selectPosition')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allPositions')}</SelectItem>
                <SelectItem value="none">{t('noPosition')}</SelectItem>
                {positions.map((position) => (
                  <SelectItem key={position.id} value={position.id}>
                    {position.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Revenue Chart */}
      <RevenueChart year={selectedYear} clientId={selectedClient} positionId={selectedPosition} />

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">{tc('loading')}</div>
      ) : (
        <>
          {/* Upcoming gigs */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {t('upcomingRevenue')}
                </CardTitle>
                <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {upcomingRevenue.toLocaleString(formatLocale)} {currencySymbol}
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  {t('acceptedGigsCount', { count: upcomingGigs.length })}
                </p>
              </CardContent>
            </Card>

            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-blue-900 dark:text-blue-100">
                  {t('upcomingWorkDays')}
                </CardTitle>
                <CalendarClock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                  {upcomingDays} {tc('days')}
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  {nextGig
                    ? t('nextGig', { date: new Date(nextGig.date).toLocaleDateString(formatLocale) })
                    : t('noUpcomingGigs')}
                </p>
              </CardContent>
            </Card>

            <Card className="border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-orange-900 dark:text-orange-100">
                  {tStatus('tentative')}
                </CardTitle>
                <HelpCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                  {t('tentativeCount', { count: tentativeGigs.length })}
                </div>
                <p className="text-xs text-orange-700 dark:text-orange-400">
                  {tentativeRevenue > 0
                    ? t('potentialRevenue', { amount: tentativeRevenue.toLocaleString(formatLocale) })
                    : t('potentialDays', { count: tentativeDays })}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* History */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('completedRevenue')}</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {totalRevenue.toLocaleString(formatLocale)} {currencySymbol}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('completedGigsCount', { count: completedGigs.length })}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('completedDays')}</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {totalDays} {tc('days')}
                </div>
                <p className="text-xs text-muted-foreground">{t('totalDaysCount')}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{tStatus('declined')}</CardTitle>
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{t('declinedCount', { count: declinedGigs.length })}</div>
                <p className="text-xs text-muted-foreground">
                  {declinedAmount.toLocaleString(formatLocale)} {currencySymbol} {tc('total').toLowerCase()}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{t('avgPerDay')}</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {Math.round(avgPerDay).toLocaleString(formatLocale)} {currencySymbol}
                </div>
                <p className="text-xs text-muted-foreground">{t('avgPerWorkDay')}</p>
              </CardContent>
            </Card>
          </div>

          {/* Best paying gigs per day */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                {t('bestPayingPerDay')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {gigsWithDayRate.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">{t('noCompletedGigsWithFee')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tGig('project')}</TableHead>
                      <TableHead>{tGig('client')}</TableHead>
                      <TableHead>{tGig('type')}</TableHead>
                      <TableHead className="text-right">{tGig('fee')}</TableHead>
                      <TableHead className="text-right">{tc('days')}</TableHead>
                      <TableHead className="text-right">{t('perDay')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gigsWithDayRate.map((gig) => (
                      <TableRow key={gig.id}>
                        <TableCell className="font-medium">
                          {gig.project_name || new Date(gig.date).toLocaleDateString(formatLocale)}
                        </TableCell>
                        <TableCell>
                          {gig.client?.name || (
                            <span className="text-muted-foreground italic">{tGig('notSpecified')}</span>
                          )}
                        </TableCell>
                        <TableCell>{gig.gig_type.name}</TableCell>
                        <TableCell className="text-right">
                          {Math.round(gig.feeBase).toLocaleString(formatLocale)} {currencySymbol}
                        </TableCell>
                        <TableCell className="text-right">{gig.total_days}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600 dark:text-green-400">
                          {Math.round(gig.dayRate).toLocaleString(formatLocale)} {perDayLabel}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Top 5 Clients (filtered) */}
          {topClients.length > 0 && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm font-medium">{t('topClients')}</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <LazyBarChart
                  data={topClients}
                  formatLocale={formatLocale}
                  currencyLabel={currencySymbol}
                  revenueLabel={t('totalRevenue')}
                />
              </CardContent>
            </Card>
          )}

          {/* Position statistics */}
          {allPositionStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Music className="h-5 w-5" />
                  {t('statsByPosition')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tGig('position')}</TableHead>
                      <TableHead className="text-right">{t('gigCount')}</TableHead>
                      <TableHead className="text-right">{tc('days')}</TableHead>
                      <TableHead className="text-right">{t('totalRevenue')}</TableHead>
                      <TableHead className="text-right">{t('avgPerDay')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allPositionStats.map((stat) => (
                      <TableRow key={stat.id}>
                        <TableCell className="font-medium">{stat.name}</TableCell>
                        <TableCell className="text-right">{stat.gigCount}</TableCell>
                        <TableCell className="text-right">{stat.totalDays}</TableCell>
                        <TableCell className="text-right">
                          {stat.totalRevenue.toLocaleString(formatLocale)} {currencySymbol}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-600 dark:text-green-400">
                          {Math.round(stat.avgPerDay).toLocaleString(formatLocale)} {perDayLabel}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
