import { format } from 'date-fns'
import type { Locale } from 'date-fns'
import { parseLocalDate, localToday } from '@/lib/dates'
import { getDisplayVenue } from './venue-helpers'

export type Gig = {
  id: string
  date: string
  start_date: string | null
  end_date: string | null
  total_days: number
  venue: string | null
  fee: number | null
  travel_expense: number | null
  project_name: string | null
  status: string
  notes: string | null
  response_deadline: string | null
  client_id: string | null
  gig_type_id: string
  position_id: string | null
  currency: string | null
  fee_base: number | null
  user_id: string
  client: { name: string; payment_terms: number } | null
  gig_type: { name: string; vat_rate: number; color: string | null }
  position: { name: string } | null
  gig_dates: {
    date: string
    schedule_text: string | null
    sessions: { start: string; end: string | null; label?: string }[] | null
    venue: string | null
  }[]
}

export type GigExpense = {
  id: string
  date: string
  supplier: string
  amount: number
  currency: string | null
  category: string | null
  attachment_url: string | null
}

export type SortColumn = 'date' | 'client' | 'type' | 'venue' | 'fee' | 'status'
export type SortDir = 'asc' | 'desc'
export type SortConfig = { column: SortColumn; direction: SortDir }

export function sortGigs(gigs: Gig[], config: SortConfig): Gig[] {
  return [...gigs].sort((a, b) => {
    let cmp = 0
    switch (config.column) {
      case 'date':
        cmp = a.date.localeCompare(b.date)
        break
      case 'client':
        cmp = (a.client?.name || '').localeCompare(b.client?.name || '')
        break
      case 'type':
        cmp = a.gig_type.name.localeCompare(b.gig_type.name)
        break
      case 'venue': {
        const av = getDisplayVenue(a).venue || ''
        const bv = getDisplayVenue(b).venue || ''
        cmp = av.localeCompare(bv)
        break
      }
      case 'fee':
        cmp = (a.fee || 0) - (b.fee || 0)
        break
      case 'status':
        cmp = a.status.localeCompare(b.status)
        break
    }
    return config.direction === 'asc' ? cmp : -cmp
  })
}

export function formatGigDates(gig: Gig, locale: Locale): string {
  if (!gig.total_days || gig.total_days === 1) {
    return format(parseLocalDate(gig.date), 'PPP', { locale })
  }

  const start = format(parseLocalDate(gig.start_date!), 'd MMM', { locale })
  const end = format(parseLocalDate(gig.end_date!), 'd MMM yyyy', { locale })
  return `${start} - ${end}`
}

export function getDeadlineStatus(
  deadline: string | null,
  locale: Locale,
): { label: string; color: string; urgent: boolean; key?: string } | null {
  if (!deadline) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadlineDate = new Date(deadline)
  deadlineDate.setHours(0, 0, 0, 0)

  const diffDays = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return {
      label: '',
      color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
      urgent: true,
      key: 'overdue',
    }
  } else if (diffDays === 0) {
    return {
      label: '',
      color: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300',
      urgent: true,
      key: 'todayDeadline',
    }
  } else if (diffDays <= 2) {
    return {
      label: `${diffDays}`,
      color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
      urgent: true,
      key: 'daysCount',
    }
  } else if (diffDays <= 7) {
    return {
      label: format(deadlineDate, 'd MMM', { locale }),
      color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
      urgent: false,
    }
  } else {
    return {
      label: format(deadlineDate, 'd MMM', { locale }),
      color: 'bg-gray-100 dark:bg-gray-800/40 text-gray-600 dark:text-gray-400',
      urgent: false,
    }
  }
}

export function gigHasPassed(gig: Gig): boolean {
  const lastDate = (gig.end_date || gig.date).slice(0, 10)
  const today = localToday()
  return lastDate < today
}
