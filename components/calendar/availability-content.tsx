'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Grid3X3,
  CalendarDays,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { ScrollIndicator } from '@/components/ui/scroll-indicator'
import {
  format,
  startOfWeek,
  endOfWeek,
  addWeeks,
  eachDayOfInterval,
  isSameDay,
  getWeek,
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  startOfYear,
  endOfYear,
  getMonth,
} from 'date-fns'
import { formatCurrency, type SupportedCurrency } from '@/lib/currency/exchange'

function fmtFee(amount: number, currency?: string | null): string {
  return formatCurrency(amount, (currency || 'SEK') as SupportedCurrency)
}

type GigDate = {
  date: string
  gig: {
    id: string
    status: string
    client: { name: string } | null
    project_name: string | null
    fee: number | null
    currency: string | null
  }
}

type WeekStatus = 'free' | 'partial' | 'busy'

type WeekInfo = {
  weekNumber: number
  startDate: Date
  endDate: Date
  status: WeekStatus
  gigDays: number
  gigs: GigDate[]
  month: number // 0-11
}

type ViewMode = 'month' | 'year'

export default function AvailabilityPage() {
  const t = useTranslations('calendar')
  const tc = useTranslations('common')
  const tStatus = useTranslations('status')
  const dateLocale = useDateLocale()

  const [gigDates, setGigDates] = useState<GigDate[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('year')
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [selectedWeek, setSelectedWeek] = useState<WeekInfo | null>(null)
  const now = new Date()
  const currentWeekNumber = getWeek(now, { weekStartsOn: 1 })
  const isCurrentYear = now.getFullYear() === currentYear
  const detailScrollRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()

  useEffect(() => {
    async function loadGigDates() {
      setLoading(true)

      let start: Date
      let end: Date

      if (viewMode === 'year') {
        start = startOfYear(new Date(currentYear, 0, 1))
        end = endOfYear(new Date(currentYear, 0, 1))
      } else {
        start = startOfMonth(subMonths(currentMonth, 1))
        end = endOfMonth(addMonths(currentMonth, 1))
      }

      const { data: dates } = await supabase
        .from('gig_dates')
        .select(
          `
          date,
          gig:gigs(id, status, project_name, fee, currency, client:clients(name))
        `,
        )
        .gte('date', format(start, 'yyyy-MM-dd'))
        .lte('date', format(end, 'yyyy-MM-dd'))
        .order('date')

      if (dates) {
        const filtered = (dates as unknown as GigDate[]).filter(
          (d) => d.gig && !['cancelled', 'declined'].includes(d.gig.status),
        )
        setGigDates(filtered)
      }

      setLoading(false)
    }
    loadGigDates()
  }, [viewMode, currentMonth, currentYear, supabase])

  // Beräkna alla veckor för ett helt år
  function getWeeksInYear(year: number): WeekInfo[] {
    const weeks: WeekInfo[] = []
    const yearStart = new Date(year, 0, 1)
    let currentWeekStart = startOfWeek(yearStart, { weekStartsOn: 1 })

    // Om första veckan börjar före 1 jan, starta från nästa vecka
    if (currentWeekStart.getFullYear() < year) {
      currentWeekStart = addWeeks(currentWeekStart, 1)
    }

    const yearEnd = new Date(year, 11, 31)

    while (currentWeekStart <= yearEnd) {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 })
      const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd })

      const weekGigs = gigDates.filter((gd) => {
        const gigDate = new Date(gd.date)
        return weekDays.some((d) => isSameDay(d, gigDate))
      })

      const gigDaysCount = new Set(weekGigs.map((g) => g.date)).size

      let status: WeekStatus = 'free'
      if (gigDaysCount >= 4) {
        status = 'busy'
      } else if (gigDaysCount > 0) {
        status = 'partial'
      }

      weeks.push({
        weekNumber: getWeek(currentWeekStart, { weekStartsOn: 1 }),
        startDate: currentWeekStart,
        endDate: weekEnd,
        status,
        gigDays: gigDaysCount,
        gigs: weekGigs,
        month: getMonth(currentWeekStart),
      })

      currentWeekStart = addWeeks(currentWeekStart, 1)
    }

    return weeks
  }

  // Beräkna veckor för nuvarande månad
  function getWeeksInMonth(month: Date): WeekInfo[] {
    const weeks: WeekInfo[] = []
    const monthStart = startOfMonth(month)
    const monthEnd = endOfMonth(month)

    let currentWeekStart = startOfWeek(monthStart, { weekStartsOn: 1 })

    while (currentWeekStart <= monthEnd) {
      const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 })
      const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd })

      const weekGigs = gigDates.filter((gd) => {
        const gigDate = new Date(gd.date)
        return weekDays.some((d) => isSameDay(d, gigDate))
      })

      const gigDaysCount = new Set(weekGigs.map((g) => g.date)).size

      let status: WeekStatus = 'free'
      if (gigDaysCount >= 4) {
        status = 'busy'
      } else if (gigDaysCount > 0) {
        status = 'partial'
      }

      weeks.push({
        weekNumber: getWeek(currentWeekStart, { weekStartsOn: 1 }),
        startDate: currentWeekStart,
        endDate: weekEnd,
        status,
        gigDays: gigDaysCount,
        gigs: weekGigs,
        month: getMonth(currentWeekStart),
      })

      currentWeekStart = addWeeks(currentWeekStart, 1)
    }

    return weeks
  }

  const weeks = viewMode === 'year' ? getWeeksInYear(currentYear) : getWeeksInMonth(currentMonth)

  // Statistik
  const freeWeeks = weeks.filter((w) => w.status === 'free').length
  const partialWeeks = weeks.filter((w) => w.status === 'partial').length
  const busyWeeks = weeks.filter((w) => w.status === 'busy').length

  function getStatusColor(status: WeekStatus): string {
    switch (status) {
      case 'free':
        return 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-900/50'
      case 'partial':
        return 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/50'
      case 'busy':
        return 'bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800 hover:bg-red-200 dark:hover:bg-red-900/50'
    }
  }

  function getStatusLabel(status: WeekStatus): string {
    switch (status) {
      case 'free':
        return t('free')
      case 'partial':
        return t('partial')
      case 'busy':
        return t('booked')
    }
  }

  function getStatusIcon(status: WeekStatus) {
    switch (status) {
      case 'free':
        return <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
      case 'partial':
        return <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      case 'busy':
        return <AlertCircle className="h-4 w-4 text-red-600" />
    }
  }

  return (
    <div className={cn('lg:flex lg:h-[calc(100vh-10rem)]', selectedWeek && 'overflow-hidden')} style={{ gap: '16px' }}>
      {/* Left column — content */}
      <div
        className={cn(
          'flex-1 min-w-0 space-y-4 transition-all duration-300 lg:flex lg:flex-col',
          selectedWeek && 'lg:overflow-y-auto',
        )}
      >
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{t('availableWeeks')}</h1>
            <p className="text-sm text-muted-foreground">{t('availabilityOverview')}</p>
          </div>
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            <Button
              variant={viewMode === 'month' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('month')}
              className="gap-2"
            >
              <CalendarDays className="h-4 w-4" />
              {t('monthView')}
            </Button>
            <Button
              variant={viewMode === 'year' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('year')}
              className="gap-2"
            >
              <Grid3X3 className="h-4 w-4" />
              {t('yearView')}
            </Button>
          </div>
        </div>

        {/* Navigering */}
        <div className="flex items-center justify-center gap-4 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (viewMode === 'year') {
                setCurrentYear(currentYear - 1)
              } else {
                setCurrentMonth(subMonths(currentMonth, 1))
              }
            }}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[200px] text-center">
            {viewMode === 'year' ? currentYear : format(currentMonth, 'MMMM yyyy', { locale: dateLocale })}
          </h2>
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (viewMode === 'year') {
                setCurrentYear(currentYear + 1)
              } else {
                setCurrentMonth(addMonths(currentMonth, 1))
              }
            }}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Statistik */}
        <div className="grid gap-3 md:grid-cols-3 shrink-0">
          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/30 dark:from-emerald-950/30 dark:to-emerald-900/20 border-emerald-200/50 dark:border-emerald-800/50 py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{t('freeWeeks')}</p>
                <p className="text-lg font-bold text-emerald-900 dark:text-emerald-100">{freeWeeks}</p>
              </div>
              <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </Card>
          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/30 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200/50 dark:border-amber-800/50 py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t('partiallyBooked')}</p>
                <p className="text-lg font-bold text-amber-900 dark:text-amber-100">{partialWeeks}</p>
              </div>
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </Card>
          <Card className="bg-gradient-to-br from-red-50 to-red-100/30 dark:from-red-950/30 dark:to-red-900/20 border-red-200/50 dark:border-red-800/50 py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-red-700 dark:text-red-400">{t('fullyBooked')}</p>
                <p className="text-lg font-bold text-red-900 dark:text-red-100">{busyWeeks}</p>
              </div>
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
          </Card>
        </div>

        {/* Årsvy */}
        {viewMode === 'year' && (
          <Card className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Grid3X3 className="h-4 w-4" />
                {t('yearOverview')} {currentYear}
              </CardTitle>
            </CardHeader>
            <CardContent className="lg:flex-1 lg:min-h-0 lg:overflow-auto">
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">{tc('loading')}</p>
              ) : (
                <div className="grid gap-1.5 grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-13">
                  {weeks.map((week) => (
                    <button
                      key={week.weekNumber}
                      onClick={() => setSelectedWeek(selectedWeek?.weekNumber === week.weekNumber ? null : week)}
                      className={`p-2 rounded-lg border transition-all text-left ${getStatusColor(week.status)} ${
                        selectedWeek?.weekNumber === week.weekNumber ? 'border-blue-500 border-2 shadow-sm' : ''
                      } ${
                        isCurrentYear &&
                        week.weekNumber === currentWeekNumber &&
                        selectedWeek?.weekNumber !== week.weekNumber
                          ? 'border-l-[3px] border-l-primary shadow-md'
                          : ''
                      }`}
                    >
                      <div className="text-xs font-semibold">
                        {t('weekShort')}
                        {week.weekNumber}
                      </div>
                      <div className="text-[10px] opacity-70">
                        {format(week.startDate, 'd', { locale: dateLocale })}-
                        {format(week.endDate, 'd MMM', { locale: dateLocale })}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Månadsvy */}
        {viewMode === 'month' && (
          <Card className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4" />
                {t('weekOverview')}
              </CardTitle>
            </CardHeader>
            <CardContent className="lg:flex-1 lg:min-h-0 lg:overflow-auto">
              {loading ? (
                <p className="text-center py-8 text-muted-foreground">{tc('loading')}</p>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {weeks.map((week) => (
                    <button
                      key={week.weekNumber}
                      onClick={() => setSelectedWeek(selectedWeek?.weekNumber === week.weekNumber ? null : week)}
                      className={`p-4 rounded-lg border-2 transition-all text-left ${getStatusColor(week.status)} ${
                        selectedWeek?.weekNumber === week.weekNumber ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold">
                          {t('week')} {week.weekNumber}
                        </span>
                        {getStatusIcon(week.status)}
                      </div>
                      <p className="text-sm opacity-80">
                        {format(week.startDate, 'd MMM', { locale: dateLocale })} -{' '}
                        {format(week.endDate, 'd MMM', { locale: dateLocale })}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {getStatusLabel(week.status)}
                        </Badge>
                        <span className="text-xs opacity-70">{t('daysBooked', { count: week.gigDays })}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Right panel — week details (desktop) */}
      <div
        className={cn(
          'hidden lg:block transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden',
          selectedWeek ? 'opacity-100' : 'opacity-0',
        )}
        style={{ flex: '0 0 auto', width: selectedWeek ? '50%' : 0 }}
      >
        <Card className="h-full flex flex-col overflow-hidden">
          {selectedWeek && (
            <>
              <div className="px-4 pt-3 pb-2.5 border-b shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">
                    {t('week')} {selectedWeek.weekNumber} {t('details')}
                  </h2>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(selectedWeek.status)}>{getStatusLabel(selectedWeek.status)}</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedWeek(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(selectedWeek.startDate, 'EEEE d MMMM', { locale: dateLocale })} —{' '}
                  {format(selectedWeek.endDate, 'EEEE d MMMM yyyy', { locale: dateLocale })}
                </p>
              </div>

              <div className="flex-1 overflow-hidden relative">
                <div ref={detailScrollRef} className="h-full overflow-y-auto px-4 py-3 space-y-2">
                  {selectedWeek.gigs.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-emerald-500 dark:text-emerald-400" />
                      <p>{t('entirelyFreeThisWeek')}</p>
                    </div>
                  ) : (
                    Array.from(new Set(selectedWeek.gigs.map((g) => g.date)))
                      .sort()
                      .map((date) => {
                        const dayGigs = selectedWeek.gigs.filter((g) => g.date === date)
                        return (
                          <div key={date} className="p-3 bg-muted/50 rounded-lg">
                            <p className="font-medium text-sm mb-1">
                              {format(new Date(date), 'EEEE d MMMM', { locale: dateLocale })}
                            </p>
                            {dayGigs.map((gig, idx) => (
                              <div key={idx} className="flex items-center justify-between text-sm">
                                <span>{gig.gig.client?.name || gig.gig.project_name || t('unknownGig')}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs">
                                    {tStatus(gig.gig.status)}
                                  </Badge>
                                  {gig.gig.fee && (
                                    <span className="text-muted-foreground">
                                      {fmtFee(gig.gig.fee, gig.gig.currency)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })
                  )}
                </div>
                <ScrollIndicator targetRef={detailScrollRef} />
              </div>
            </>
          )}
        </Card>
      </div>

      {/* Mobile — week details below (small screens) */}
      {selectedWeek && (
        <div className="lg:hidden mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">
                  {t('week')} {selectedWeek.weekNumber} {t('details')}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge className={getStatusColor(selectedWeek.status)}>{getStatusLabel(selectedWeek.status)}</Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedWeek(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {format(selectedWeek.startDate, 'EEEE d MMMM', { locale: dateLocale })} —{' '}
                {format(selectedWeek.endDate, 'EEEE d MMMM yyyy', { locale: dateLocale })}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {selectedWeek.gigs.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <CheckCircle className="h-6 w-6 mx-auto mb-2 text-emerald-500 dark:text-emerald-400" />
                    <p className="text-sm">{t('entirelyFreeThisWeek')}</p>
                  </div>
                ) : (
                  Array.from(new Set(selectedWeek.gigs.map((g) => g.date)))
                    .sort()
                    .map((date) => {
                      const dayGigs = selectedWeek.gigs.filter((g) => g.date === date)
                      return (
                        <div key={date} className="p-3 bg-muted/50 rounded-lg">
                          <p className="font-medium text-sm mb-1">
                            {format(new Date(date), 'EEEE d MMMM', { locale: dateLocale })}
                          </p>
                          {dayGigs.map((gig, idx) => (
                            <div key={idx} className="flex items-center justify-between text-sm">
                              <span>{gig.gig.client?.name || gig.gig.project_name || t('unknownGig')}</span>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {tStatus(gig.gig.status)}
                                </Badge>
                                {gig.gig.fee && (
                                  <span className="text-muted-foreground">{fmtFee(gig.gig.fee, gig.gig.currency)}</span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
