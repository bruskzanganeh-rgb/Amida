'use client'

import { useEffect, useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { parseLocalDate } from '@/lib/dates'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, CalendarCheck, CheckCircle, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, startOfWeek, endOfWeek, addWeeks, eachDayOfInterval, isSameDay, getWeek } from 'date-fns'

type GigDate = {
  date: string
  gig: {
    status: string
  }
}

type WeekStatus = 'free' | 'partial' | 'busy'

type WeekInfo = {
  weekNumber: number
  startDate: Date
  endDate: Date
  status: WeekStatus
  gigDays: number
}

export function AvailableWeeks() {
  const t = useTranslations('dashboard')
  const [weeks, setWeeks] = useState<WeekInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const currentWeekRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()
  const currentYear = new Date().getFullYear()
  const currentWeekNumber = getWeek(new Date(), { weekStartsOn: 1 })
  const minYear = 2020
  const maxYear = currentYear + 1

  useEffect(() => {
    async function loadWeeks() {
      setLoading(true)
      const yearStart = new Date(selectedYear, 0, 1)
      const yearEnd = new Date(selectedYear, 11, 31)

      const start = format(yearStart, 'yyyy-MM-dd')
      const end = format(yearEnd, 'yyyy-MM-dd')

      const { data: dates } = await supabase
        .from('gig_dates')
        .select(
          `
          date,
          gig:gigs(status)
        `,
        )
        .gte('date', start)
        .lte('date', end)

      const filtered = ((dates || []) as unknown as GigDate[]).filter(
        (d) => d.gig && !['cancelled', 'declined'].includes(d.gig.status),
      )

      const weekInfos: WeekInfo[] = []
      let currentWeekStart = startOfWeek(yearStart, { weekStartsOn: 1 })

      while (currentWeekStart <= yearEnd) {
        const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 })
        const weekDays = eachDayOfInterval({ start: currentWeekStart, end: weekEnd })

        const weekGigs = filtered.filter((gd) => {
          const gigDate = parseLocalDate(gd.date)
          return weekDays.some((d) => isSameDay(d, gigDate))
        })

        const gigDaysCount = new Set(weekGigs.map((g) => g.date)).size

        let status: WeekStatus = 'free'
        if (gigDaysCount >= 4) {
          status = 'busy'
        } else if (gigDaysCount > 0) {
          status = 'partial'
        }

        weekInfos.push({
          weekNumber: getWeek(currentWeekStart, { weekStartsOn: 1 }),
          startDate: currentWeekStart,
          endDate: weekEnd,
          status,
          gigDays: gigDaysCount,
        })

        currentWeekStart = addWeeks(currentWeekStart, 1)
      }

      setWeeks(weekInfos)
      setLoading(false)
    }
    loadWeeks()
  }, [selectedYear, supabase])

  useEffect(() => {
    if (!loading && currentWeekRef.current && scrollContainerRef.current && selectedYear === currentYear) {
      const container = scrollContainerRef.current
      const element = currentWeekRef.current
      container.scrollTop =
        element.offsetTop - container.offsetTop - container.clientHeight / 2 + element.clientHeight / 2
    }
  }, [loading, selectedYear, currentYear])

  function getStatusStyle(status: WeekStatus) {
    switch (status) {
      case 'free':
        return { bg: 'bg-sky-500/5', text: 'text-sky-600 dark:text-sky-400', icon: Calendar }
      case 'partial':
        return { bg: 'bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400', icon: Clock }
      case 'busy':
        return { bg: 'bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400', icon: CheckCircle }
    }
  }

  const freeCount = weeks.filter((w) => w.status === 'free').length
  const partialCount = weeks.filter((w) => w.status === 'partial').length
  const busyCount = weeks.filter((w) => w.status === 'busy').length
  const totalWeeks = weeks.length

  return (
    <Card className="h-full min-h-0 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CalendarCheck className="h-4 w-4 text-muted-foreground" />
            {t('availableWeeks')}
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setSelectedYear((y) => Math.max(minYear, y - 1))}
              disabled={selectedYear <= minYear}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs font-medium min-w-[40px] text-center">{selectedYear}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setSelectedYear((y) => Math.min(maxYear, y + 1))}
              disabled={selectedYear >= maxYear}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4 flex-1 flex flex-col" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="text-center p-2 rounded-lg bg-secondary/50">
                  <Skeleton className="h-6 w-8 mx-auto mb-1" />
                  <Skeleton className="h-2 w-10 mx-auto" />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-secondary/30">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                  <Skeleton className="h-4 w-10" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 mb-3 shrink-0">
              <div className="text-center p-2 rounded-lg bg-sky-500/5">
                <p className="text-lg font-bold text-sky-600 dark:text-sky-400">{freeCount}</p>
                <p className="text-[10px] text-muted-foreground">{t('free')}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-amber-500/15">
                <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{partialCount}</p>
                <p className="text-[10px] text-muted-foreground">{t('partial')}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-emerald-500/15">
                <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{busyCount}</p>
                <p className="text-[10px] text-muted-foreground">{t('full')}</p>
              </div>
            </div>

            <div className="md:flex-1 relative min-h-0">
              <div
                ref={scrollContainerRef}
                className="max-h-[300px] overflow-y-auto md:max-h-none md:absolute md:inset-0 space-y-1 pr-1"
              >
                {weeks.map((week, index) => {
                  const style = getStatusStyle(week.status)
                  const Icon = style.icon
                  const isCurrentWeek = selectedYear === currentYear && week.weekNumber === currentWeekNumber
                  return (
                    <div
                      key={`${selectedYear}-${index}`}
                      ref={isCurrentWeek ? currentWeekRef : null}
                      className={`flex items-center justify-between py-1.5 px-2 rounded-lg text-xs transition-colors ${style.bg} ${isCurrentWeek ? 'border-l-4 border-blue-500' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`h-3 w-3 ${style.text}`} />
                        <span className="font-medium">V{week.weekNumber}</span>
                      </div>
                      <Badge variant="secondary" className={`text-[10px] ${style.text} bg-transparent border-0`}>
                        {week.status === 'free'
                          ? t('freeWeek')
                          : week.status === 'partial'
                            ? `${week.gigDays}d`
                            : t('fullWeek')}
                      </Badge>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
        <div className="mt-2 pt-2 border-t text-center shrink-0">
          <p className="text-[10px] text-muted-foreground">
            jan–dec {selectedYear} • {totalWeeks} {t('weeksTotalLabel')}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
