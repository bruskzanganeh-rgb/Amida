'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { format } from 'date-fns'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { useGigFilter } from '@/lib/hooks/use-gig-filter'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-400',
  tentative: 'bg-yellow-400',
  accepted: 'bg-green-500',
  completed: 'bg-blue-500',
  invoiced: 'bg-purple-500',
  paid: 'bg-green-800',
}

type DayGig = {
  date: string
  status: string
  label: string
}

type MiniCalendarProps = {
  className?: string
}

export function MiniCalendar({ className }: MiniCalendarProps) {
  const dateLocale = useDateLocale()
  const router = useRouter()
  const { shouldFilter, currentUserId } = useGigFilter()
  const supabase = createClient()

  const now = new Date()
  const [currentDate, setCurrentDate] = useState(new Date(now.getFullYear(), now.getMonth(), 1))
  const [dayGigs, setDayGigs] = useState<DayGig[]>([])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  useEffect(() => {
    async function load() {
      const start = `${year}-${String(month + 1).padStart(2, '0')}-01`
      const lastDay = new Date(year, month + 1, 0).getDate()
      const end = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const { data } = await supabase
        .from('gig_dates')
        .select('date, gig:gigs(status, user_id, project_name, client:clients(name))')
        .gte('date', start)
        .lte('date', end)

      if (data) {
        type GigDateRow = {
          date: string
          gig: { status: string; user_id: string; project_name: string; client: { name: string } | null } | null
        }
        const filtered = (data as unknown as GigDateRow[])
          .filter((d) => {
            if (!d.gig) return false
            if (d.gig.status === 'cancelled' || d.gig.status === 'declined') return false
            if (shouldFilter && currentUserId && d.gig.user_id !== currentUserId) return false
            return true
          })
          .map((d) => ({
            date: d.date,
            status: d.gig!.status,
            label: d.gig!.project_name || d.gig!.client?.name || '',
          }))
        setDayGigs(filtered)
      }
    }
    load()
  }, [year, month, shouldFilter, currentUserId, supabase])

  // Calendar grid
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDay = new Date(year, month, 1).getDay()
  const firstDayMon = firstDay === 0 ? 6 : firstDay - 1

  const calendarDays: (number | null)[] = []
  for (let i = 0; i < firstDayMon; i++) calendarDays.push(null)
  for (let d = 1; d <= daysInMonth; d++) calendarDays.push(d)

  // Day names (Mon-Sun, single letter)
  const dayNames = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 1 + i)
    return format(d, 'EEEEE', { locale: dateLocale })
  })

  function getGigsForDay(day: number): DayGig[] {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return dayGigs.filter((g) => g.date === dateStr)
  }

  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()
  const todayDate = now.getDate()
  const monthLabel = format(currentDate, 'LLLL yyyy', { locale: dateLocale })

  // Split calendar days into weeks for stagger animation
  const weeks: (number | null)[][] = []
  for (let i = 0; i < calendarDays.length; i += 7) {
    weeks.push(calendarDays.slice(i, i + 7))
  }

  return (
    <div className={cn('', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium capitalize">{monthLabel}</span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {dayNames.map((name, i) => (
          <div key={i} className="text-center text-[11px] font-medium text-muted-foreground">
            {name}
          </div>
        ))}
      </div>

      {/* Calendar weeks — stagger entrance */}
      <div className="space-y-1">
        {weeks.map((week, weekIdx) => (
          <motion.div
            key={weekIdx}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: weekIdx * 0.03, duration: 0.3 }}
            className="grid grid-cols-7 gap-1"
          >
            {week.map((day, dayIdx) => {
              if (day === null) {
                return <div key={`e-${weekIdx}-${dayIdx}`} className="aspect-square" />
              }

              const gigs = getGigsForDay(day)
              const isToday = isCurrentMonth && day === todayDate
              const tooltipText = gigs.map((g) => g.label || '—').join(', ')

              return (
                <div
                  key={day}
                  className={cn(
                    'aspect-square rounded-md flex flex-col items-center justify-center cursor-pointer transition-all duration-150',
                    'hover:bg-secondary/80 hover:-translate-y-px',
                    isToday && 'bg-primary/10 ring-1 ring-primary',
                  )}
                  onClick={() => router.push('/calendar')}
                  title={gigs.length > 0 ? tooltipText : undefined}
                >
                  <span
                    className={cn(
                      'text-xs leading-none',
                      isToday ? 'font-bold text-primary' : 'text-foreground',
                      gigs.length === 0 && !isToday && 'text-muted-foreground',
                    )}
                  >
                    {day}
                  </span>
                  {gigs.length > 0 && (
                    <div className="flex items-center gap-0.5 mt-1">
                      {gigs.slice(0, 3).map((gig, j) => (
                        <div
                          key={j}
                          className={cn('w-1.5 h-1.5 rounded-full', statusColors[gig.status] || 'bg-gray-400')}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </motion.div>
        ))}
      </div>
    </div>
  )
}
