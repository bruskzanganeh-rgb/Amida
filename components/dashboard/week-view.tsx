'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  format,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isToday,
  getWeek,
  isBefore,
  startOfDay,
  addWeeks,
  subWeeks,
  isSameWeek,
} from 'date-fns'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { useGigFilter } from '@/lib/hooks/use-gig-filter'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'

type WeekGig = {
  date: string
  status: string
  label: string
  time: string | null
  gigId: string
  gigTypeColor: string | null
}

type WeekViewProps = {
  className?: string
}

export function WeekView({ className }: WeekViewProps) {
  const dateLocale = useDateLocale()
  const t = useTranslations('dashboard')
  const tc = useTranslations('common')
  const { shouldFilter, currentUserId } = useGigFilter()
  const supabase = createClient()

  const [weekGigs, setWeekGigs] = useState<WeekGig[]>([])
  const [weekOffset, setWeekOffset] = useState(0)

  const now = new Date()
  const baseDate = weekOffset === 0 ? now : addWeeks(now, weekOffset)
  const monday = startOfWeek(baseDate, { weekStartsOn: 1 })
  const sunday = endOfWeek(baseDate, { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: monday, end: sunday })
  const weekNum = getWeek(baseDate, { weekStartsOn: 1 })
  const isCurrentWeek = isSameWeek(baseDate, now, { weekStartsOn: 1 })

  const load = useCallback(async () => {
    const startStr = format(monday, 'yyyy-MM-dd')
    const endStr = format(sunday, 'yyyy-MM-dd')

    const { data } = await supabase
      .from('gig_dates')
      .select(
        'date, sessions, gig:gigs(id, status, user_id, project_name, client:clients(name), gig_type:gig_types(name, color))',
      )
      .gte('date', startStr)
      .lte('date', endStr)

    if (data) {
      type GigDateRow = {
        date: string
        sessions: { start: string; end?: string; label?: string }[] | null
        gig: {
          id: string
          status: string
          user_id: string
          project_name: string
          client: { name: string } | null
          gig_type: { name: string; color: string } | null
        } | null
      }
      const filtered = (data as unknown as GigDateRow[])
        .filter((d) => {
          if (!d.gig) return false
          if (d.gig.status === 'cancelled' || d.gig.status === 'declined') return false
          if (shouldFilter && currentUserId && d.gig.user_id !== currentUserId) return false
          return true
        })
        .map((d) => {
          const firstSession = d.sessions?.[0]
          return {
            date: d.date,
            status: d.gig!.status,
            label: d.gig!.project_name || d.gig!.client?.name || '',
            time: firstSession?.start || null,
            gigId: d.gig!.id,
            gigTypeColor: d.gig!.gig_type?.color || null,
          }
        })
      setWeekGigs(filtered)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset, shouldFilter, currentUserId])

  useEffect(() => {
    load()
  }, [load])

  function getGigsForDay(date: Date): WeekGig[] {
    const dateStr = format(date, 'yyyy-MM-dd')
    return weekGigs.filter((g) => g.date === dateStr)
  }

  const todayStart = startOfDay(now)

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header with navigation */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setWeekOffset((o) => o - 1)}
            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="text-sm font-semibold tracking-tight min-w-[62px] text-center">
            {t('week', { num: weekNum })}
          </span>
          <button
            onClick={() => setWeekOffset((o) => o + 1)}
            className="h-6 w-6 flex items-center justify-center rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-[10px] font-medium text-primary hover:text-primary/80 transition-colors ml-1"
            >
              {tc('today')}
            </button>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground font-medium">
          {format(monday, 'd MMM', { locale: dateLocale })} – {format(sunday, 'd MMM', { locale: dateLocale })}
        </span>
      </div>

      {/* Day rows — always show all 7 days, no scroll */}
      <div className="-mx-1">
        {days.map((day, i) => {
          const gigs = getGigsForDay(day)
          const today = isToday(day)
          const isPast = isBefore(day, todayStart)
          const dayName = format(day, 'EEEE', { locale: dateLocale })
          const dayNum = format(day, 'd')
          const hasGigs = gigs.length > 0

          return (
            <div
              key={i}
              className={cn(
                'relative flex items-stretch gap-3 px-1 transition-colors',
                today ? 'py-1.5' : 'py-1',
                isPast && !today && 'opacity-40',
              )}
            >
              {/* Date column */}
              <div className={cn('flex items-center gap-2 shrink-0 w-[90px]', today && 'relative')}>
                <div
                  className={cn(
                    'flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold tabular-nums shrink-0',
                    today ? 'bg-primary text-primary-foreground' : 'text-foreground',
                  )}
                >
                  {dayNum}
                </div>
                <span
                  className={cn(
                    'text-[11px] font-medium capitalize leading-none',
                    today ? 'text-primary font-semibold' : 'text-muted-foreground',
                  )}
                >
                  {dayName.slice(0, 3)}
                </span>
              </div>

              {/* Events */}
              <div className="flex-1 min-w-0 flex flex-col gap-1 justify-center min-h-[32px]">
                {hasGigs ? (
                  gigs.map((gig, j) => (
                    <Link
                      key={j}
                      href="/gigs"
                      className={cn(
                        'group flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-all',
                        'bg-secondary/60 hover:bg-secondary',
                      )}
                    >
                      <div
                        className="w-1 h-4 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            gig.gigTypeColor ||
                            (gig.status === 'accepted'
                              ? '#22c55e'
                              : gig.status === 'pending' || gig.status === 'tentative'
                                ? '#facc15'
                                : '#94a3b8'),
                        }}
                      />
                      <span className="text-xs font-medium text-foreground truncate flex-1 group-hover:text-foreground/90">
                        {gig.label}
                      </span>
                      {gig.time && (
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0 tabular-nums">
                          {gig.time}
                        </span>
                      )}
                    </Link>
                  ))
                ) : (
                  <div className={cn('h-[1px] my-auto', today ? 'bg-primary/15' : 'bg-border/50')} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
