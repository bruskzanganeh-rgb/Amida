'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Calendar as CalendarIcon,
  MapPin,
  Pencil,
  Edit,
  Trash2,
  Receipt,
} from 'lucide-react'
import { GigDialog } from '@/components/gigs/gig-dialog'
import { GigAttachments } from '@/components/gigs/gig-attachments'
import { UploadReceiptDialog } from '@/components/expenses/upload-receipt-dialog'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { useTranslations } from 'next-intl'
import { useCompany } from '@/lib/hooks/use-company'
import { useGigFilter } from '@/lib/hooks/use-gig-filter'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { PageTransition } from '@/components/ui/page-transition'
import { PullToRefresh } from '@/components/ui/pull-to-refresh'
import { Skeleton } from '@/components/ui/skeleton'

type Gig = {
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
  client_id: string | null
  gig_type_id: string
  position_id: string | null
  user_id: string
  client: { name: string; payment_terms: number } | null
  gig_type: { name: string; color: string | null; vat_rate: number } | null
  position: { name: string } | null
  gig_dates: { date: string; sessions: { start: string; end: string | null; label?: string }[] | null }[]
}

type GigExpense = {
  id: string
  date: string
  supplier: string
  amount: number
  currency: string | null
  category: string | null
  attachment_url: string | null
}

// Helper function to format date as local YYYY-MM-DD (avoids timezone issues with toISOString)
function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-400',
  accepted: 'bg-green-500',
  declined: 'bg-red-400',
  completed: 'bg-blue-500',
  invoiced: 'bg-purple-500',
  paid: 'bg-green-800',
}

const statusConfigColors: Record<string, string> = {
  tentative: 'bg-orange-100 text-orange-800',
  pending: 'bg-yellow-100 text-yellow-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  completed: 'bg-blue-100 text-blue-800',
  invoiced: 'bg-purple-100 text-purple-800',
  paid: 'bg-green-200 text-green-900',
}

type ViewMode = 'month' | 'year'

export default function CalendarPage() {
  const t = useTranslations('calendar')
  const tc = useTranslations('common')
  const tGig = useTranslations('gig')
  const tStatus = useTranslations('status')
  const tToast = useTranslations('toast')
  const dateLocale = useDateLocale()
  const formatLocale = useFormatLocale()
  const tTeam = useTranslations('team')
  const { company, members, allMembers } = useCompany()
  const gigFilter = useGigFilter()
  const isSharedMode = company?.gig_visibility === 'shared' && members.length > 1

  const [gigs, setGigs] = useState<Gig[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedGig, setSelectedGig] = useState<Gig | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [editingGig, setEditingGig] = useState<Gig | null>(null)
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesText, setNotesText] = useState('')
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)
  const [gigExpenses, setGigExpenses] = useState<GigExpense[]>([])
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [gigToDelete, setGigToDelete] = useState<string | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [preselectedDate, setPreselectedDate] = useState<Date | undefined>(undefined)
  const [memberFilter, setMemberFilter] = useState<string>(gigFilter.shouldFilter ? gigFilter.currentUserId : 'all')
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [panelCanScrollUp, setPanelCanScrollUp] = useState(false)
  const [panelCanScrollDown, setPanelCanScrollDown] = useState(false)
  const panelScrollRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  // Sync memberFilter with global filter toggle
  useEffect(() => {
    if (gigFilter.shouldFilter && gigFilter.currentUserId) {
      setMemberFilter(gigFilter.currentUserId)
    } else if (!gigFilter.shouldFilter && memberFilter === gigFilter.currentUserId) {
      setMemberFilter('all')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gigFilter.shouldFilter, gigFilter.currentUserId])

  const updatePanelScroll = useCallback(() => {
    const el = panelScrollRef.current
    if (!el) return
    setPanelCanScrollUp(el.scrollTop > 10)
    setPanelCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 10)
  }, [])

  const loadGigs = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('gigs')
      .select(
        `
        *,
        client:clients(name, payment_terms),
        gig_type:gig_types(name, color, vat_rate),
        position:positions(name),
        gig_dates(date, sessions)
      `,
      )
      .neq('status', 'draft')
      .order('date', { ascending: true })

    if (error) {
      console.error('Error loading gigs:', error)
    } else {
      setGigs((data || []) as unknown as Gig[])
    }
    setLoading(false)
  }, [supabase])

  const loadGigExpenses = useCallback(
    async (gigId: string) => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, date, supplier, amount, currency, category, attachment_url')
        .eq('gig_id', gigId)
        .order('date', { ascending: false })

      if (error) {
        console.error('Error loading gig expenses:', error)
      } else {
        setGigExpenses(data || [])
      }
    },
    [supabase],
  )

  useEffect(() => {
    loadGigs()
  }, [loadGigs])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [supabase])

  function getMemberLabel(userId: string): string {
    if (userId === currentUserId) return tTeam('me')
    const member = allMembers.find((m) => m.user_id === userId)
    if (member?.email) return member.email.split('@')[0]
    return userId.slice(0, 6)
  }

  useEffect(() => {
    if (selectedGig) {
      loadGigExpenses(selectedGig.id)
      // Check scroll state after panel renders
      setTimeout(updatePanelScroll, 100)
    } else {
      setGigExpenses([])
      setPanelCanScrollUp(false)
      setPanelCanScrollDown(false)
    }
  }, [selectedGig, loadGigExpenses, updatePanelScroll])

  async function saveNotes(id: string, notes: string) {
    const { error } = await supabase
      .from('gigs')
      .update({ notes: notes || null })
      .eq('id', id)

    if (error) {
      console.error('Error saving notes:', error)
      toast.error(tToast('notesError'))
    } else {
      setGigs(gigs.map((g) => (g.id === id ? { ...g, notes: notes || null } : g)))
      if (selectedGig?.id === id) {
        setSelectedGig({ ...selectedGig, notes: notes || null })
      }
      setEditingNotes(false)
    }
  }

  function confirmDeleteGig(id: string) {
    setGigToDelete(id)
    setDeleteConfirmOpen(true)
  }

  async function deleteGig(id: string) {
    const { error } = await supabase.from('gigs').delete().eq('id', id)

    if (error) {
      console.error('Error deleting gig:', error)
      toast.error(tToast('deleteGigError'))
    } else {
      loadGigs()
    }
  }

  // Get days in month
  function getDaysInMonth(year: number, month: number) {
    return new Date(year, month + 1, 0).getDate()
  }

  // Get first day of month (0 = Sunday, 1 = Monday, etc.)
  function getFirstDayOfMonth(year: number, month: number) {
    const day = new Date(year, month, 1).getDay()
    // Convert to Monday-first (0 = Monday, 6 = Sunday)
    return day === 0 ? 6 : day - 1
  }

  // Check if a date has gigs
  function getGigsForDate(date: Date): Gig[] {
    const dateStr = formatDateLocal(date)

    return gigs.filter((gig) => {
      if (memberFilter !== 'all' && gig.user_id !== memberFilter) return false
      // If gig has specific dates in gig_dates, use those
      if (gig.gig_dates && gig.gig_dates.length > 0) {
        return gig.gig_dates.some((gd) => gd.date === dateStr)
      }
      // Fallback for single day gig without gig_dates
      return gig.date.split('T')[0] === dateStr
    })
  }

  // Navigate months/years
  function previous() {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
    } else {
      setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1))
    }
  }

  function next() {
    if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
    } else {
      setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1))
    }
  }

  function goToToday() {
    setCurrentDate(new Date())
  }

  // Get gigs for a specific month (for year view)
  function getGigsForMonth(year: number, month: number): Gig[] {
    return gigs.filter((gig) => {
      if (memberFilter !== 'all' && gig.user_id !== memberFilter) return false
      if (gig.gig_dates && gig.gig_dates.length > 0) {
        return gig.gig_dates.some((gd) => {
          const d = new Date(gd.date + 'T12:00:00')
          return d.getFullYear() === year && d.getMonth() === month
        })
      }
      const gigDate = new Date(gig.date)
      return gigDate.getFullYear() === year && gigDate.getMonth() === month
    })
  }

  // Navigate to specific month from year view
  function goToMonth(month: number) {
    setCurrentDate(new Date(year, month, 1))
    setViewMode('month')
  }

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDayOfMonth = getFirstDayOfMonth(year, month)

  const monthNames = Array.from({ length: 12 }, (_, i) => format(new Date(2024, i, 1), 'LLLL', { locale: dateLocale }))

  const dayNames = Array.from({ length: 7 }, (_, i) => {
    // Monday=0 .. Sunday=6 → 2024-01-01 is a Monday
    const d = new Date(2024, 0, 1 + i)
    return format(d, 'EEE', { locale: dateLocale })
  })

  // Generate calendar days
  const calendarDays: (number | null)[] = []

  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(null)
  }

  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day)
  }

  function isToday(day: number): boolean {
    const today = new Date()
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
  }

  return (
    <PullToRefresh onRefresh={loadGigs}>
      <PageTransition>
        <div
          className={cn('lg:flex lg:h-[calc(100vh-9.5rem)]', selectedGig && 'overflow-hidden')}
          style={{ gap: '16px' }}
        >
          {/* Main content */}
          <div
            className={cn(
              'flex-1 min-w-0 space-y-2 transition-all duration-300 lg:flex lg:flex-col',
              selectedGig && 'lg:overflow-y-auto',
            )}
          >
            <Card className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
              <CardHeader className="py-3">
                <div className="flex flex-wrap items-center justify-between gap-y-2">
                  <div className="flex items-center gap-4 min-w-0">
                    <CardTitle className="flex items-center gap-2 text-lg shrink-0">
                      <CalendarIcon className="h-5 w-5" />
                      {viewMode === 'year' ? year : `${monthNames[month]} ${year}`}
                    </CardTitle>
                    {/* Compact legend — hides overflow when panel compresses calendar */}
                    <div className="hidden lg:flex items-center gap-3 text-xs text-muted-foreground overflow-hidden whitespace-nowrap min-w-0">
                      {Object.entries(statusColors).map(([status, color]) => (
                        <div key={status} className="flex items-center gap-1 shrink-0">
                          <div className={cn('w-2 h-2 rounded-full', color)} />
                          <span>{tStatus(status)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {isSharedMode && !gigFilter.shouldFilter && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant={memberFilter === 'all' ? 'default' : 'outline'}
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setMemberFilter('all')}
                      >
                        {tTeam('allMembers')}
                      </Button>
                      {members.map((m) => (
                        <Button
                          key={m.user_id}
                          variant={memberFilter === m.user_id ? 'default' : 'outline'}
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setMemberFilter(m.user_id)}
                        >
                          {getMemberLabel(m.user_id)}
                        </Button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border overflow-hidden">
                      <Button
                        variant={viewMode === 'month' ? 'default' : 'ghost'}
                        size="sm"
                        className="rounded-none h-8"
                        onClick={() => setViewMode('month')}
                      >
                        {t('monthView')}
                      </Button>
                      <Button
                        variant={viewMode === 'year' ? 'default' : 'ghost'}
                        size="sm"
                        className="rounded-none h-8"
                        onClick={() => setViewMode('year')}
                      >
                        {t('yearView')}
                      </Button>
                    </div>
                    <Button variant="outline" size="sm" className="h-8" onClick={goToToday}>
                      {t('today')}
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={previous}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={next}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                {loading ? (
                  <div className="space-y-3 py-2">
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <Skeleton key={`h-${i}`} className="h-4 w-full" />
                      ))}
                    </div>
                    {Array.from({ length: 5 }).map((_, row) => (
                      <div key={row} className="grid grid-cols-7 gap-1">
                        {Array.from({ length: 7 }).map((_, col) => (
                          <Skeleton key={col} className="h-16 w-full rounded" />
                        ))}
                      </div>
                    ))}
                  </div>
                ) : viewMode === 'year' ? (
                  /* Year View */
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                    {monthNames.map((monthName, monthIndex) => {
                      const monthGigs = getGigsForMonth(year, monthIndex)
                      const isCurrentMonth = new Date().getMonth() === monthIndex && new Date().getFullYear() === year

                      return (
                        <div
                          key={monthIndex}
                          className={cn(
                            'border rounded-lg p-4 cursor-pointer hover:bg-gray-50 transition-colors',
                            isCurrentMonth && 'bg-blue-50 border-blue-300',
                          )}
                          onClick={() => goToMonth(monthIndex)}
                        >
                          <h3 className={cn('font-semibold mb-2', isCurrentMonth && 'text-blue-600')}>{monthName}</h3>
                          {monthGigs.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('noGigs')}</p>
                          ) : (
                            <div className="space-y-1">
                              <p className="text-sm font-medium">{t('gigCount', { count: monthGigs.length })}</p>
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(
                                  monthGigs.reduce(
                                    (acc, gig) => {
                                      acc[gig.status] = (acc[gig.status] || 0) + 1
                                      return acc
                                    },
                                    {} as Record<string, number>,
                                  ),
                                ).map(([status, count]) => (
                                  <div
                                    key={status}
                                    className={cn(
                                      'w-5 h-5 rounded-full flex items-center justify-center text-xs text-white font-medium',
                                      statusColors[status],
                                    )}
                                    title={`${tStatus(status)}: ${count}`}
                                  >
                                    {count}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  /* Month View */
                  <div
                    className="grid grid-cols-7 gap-1 lg:flex-1 lg:min-h-0"
                    style={{ gridTemplateRows: `auto repeat(${Math.ceil(calendarDays.length / 7)}, 1fr)` }}
                  >
                    {/* Day headers */}
                    {dayNames.map((day) => (
                      <div key={day} className="text-center text-xs font-medium text-muted-foreground py-1">
                        {day}
                      </div>
                    ))}

                    {/* Calendar days */}
                    {calendarDays.map((day, index) => {
                      if (day === null) {
                        return <div key={`empty-${index}`} className="min-h-20 lg:min-h-0 bg-gray-50" />
                      }

                      const date = new Date(year, month, day)
                      const dayGigs = getGigsForDate(date)
                      const today = isToday(day)

                      return (
                        <div
                          key={day}
                          className={cn(
                            'min-h-20 lg:min-h-0 border rounded-lg p-1 transition-colors cursor-pointer overflow-hidden',
                            today ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50',
                          )}
                          onClick={() => {
                            if (dayGigs.length === 0) {
                              setPreselectedDate(date)
                              setShowCreateDialog(true)
                            }
                          }}
                        >
                          <div className={cn('text-xs font-medium mb-0.5', today && 'text-blue-600')}>{day}</div>
                          <div className="space-y-0.5">
                            {dayGigs.slice(0, 3).map((gig) => {
                              const dateStr = formatDateLocal(date)
                              const dayData = gig.gig_dates?.find((gd) => gd.date === dateStr)
                              const firstSession = dayData?.sessions?.[0]
                              const timePrefix = firstSession?.start ? `${firstSession.start} ` : ''
                              const label =
                                gig.project_name || (gig.client ? gig.client.name : tGig('clientNotSpecified'))
                              return (
                                <div
                                  key={gig.id}
                                  className={cn(
                                    'text-[11px] px-1 py-0.5 rounded truncate cursor-pointer text-white',
                                    statusColors[gig.status],
                                  )}
                                  onClick={() => {
                                    setSelectedGig(gig)
                                    setEditingNotes(false)
                                  }}
                                  title={`${gig.client ? gig.client.name : tGig('clientNotSpecified')} - ${gig.project_name || (gig.gig_type ? gig.gig_type.name : '')}`}
                                >
                                  {timePrefix}
                                  {label}
                                </div>
                              )
                            })}
                            {dayGigs.length > 3 && (
                              <div className="text-[10px] text-muted-foreground">
                                +{dayGigs.length - 3} {tc('more')}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Create gig dialog (from empty day click) */}
            <GigDialog
              gig={null}
              open={showCreateDialog}
              onOpenChange={(open) => {
                setShowCreateDialog(open)
                if (!open) setPreselectedDate(undefined)
              }}
              onSuccess={loadGigs}
              initialDate={preselectedDate}
            />

            {/* Edit gig dialog */}
            <GigDialog
              gig={editingGig}
              open={editingGig !== null}
              onOpenChange={(open) => !open && setEditingGig(null)}
              onSuccess={() => {
                loadGigs()
                if (editingGig && selectedGig?.id === editingGig.id) {
                  setSelectedGig(null)
                }
              }}
            />

            <UploadReceiptDialog
              open={showReceiptDialog}
              onOpenChange={setShowReceiptDialog}
              onSuccess={() => {
                setShowReceiptDialog(false)
                if (selectedGig) {
                  loadGigExpenses(selectedGig.id)
                }
              }}
              gigId={selectedGig?.id}
              gigTitle={selectedGig?.project_name || selectedGig?.gig_type?.name}
            />
          </div>
          {/* End main content */}

          {/* Desktop Side Panel (lg+) */}
          <div
            className={cn(
              'hidden lg:block transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] overflow-hidden',
              selectedGig ? 'opacity-100' : 'opacity-0',
            )}
            style={{ flex: '0 0 auto', width: selectedGig ? '50%' : 0 }}
          >
            <div className="min-w-0 h-full">
              <Card className="h-full flex flex-col overflow-hidden">
                {selectedGig && (
                  <>
                    {/* Header — compact 2-row */}
                    <div className="px-4 pt-3 pb-2.5 border-b">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-1 h-6 rounded-full shrink-0"
                            style={{ backgroundColor: selectedGig.gig_type?.color || '#6366f1' }}
                          />
                          <h2 className="text-sm font-semibold tracking-tight truncate">
                            {selectedGig.project_name || selectedGig.gig_type?.name || tGig('newGig')}
                          </h2>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full"
                            onClick={() => setEditingGig(selectedGig)}
                            title={tc('edit')}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full"
                            onClick={() => setShowReceiptDialog(true)}
                            title={tGig('addReceipt')}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() => confirmDeleteGig(selectedGig.id)}
                            title={tc('delete')}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full"
                            onClick={() => setSelectedGig(null)}
                          >
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1 ml-[18px]">
                        <span className="text-xs text-muted-foreground truncate">
                          {selectedGig.client?.name || <span className="italic">{tGig('clientNotSpecified')}</span>}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium ${statusConfigColors[selectedGig.status] || 'bg-gray-100 text-gray-800'}`}
                        >
                          {tStatus(selectedGig.status)}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {selectedGig.gig_type?.name}
                          {selectedGig.position && ` · ${selectedGig.position.name}`}
                        </span>
                      </div>
                    </div>

                    {/* Scrollable content with scroll indicators */}
                    <div className="relative flex-1 overflow-hidden">
                      <div
                        ref={panelScrollRef}
                        className="h-full overflow-y-auto px-4 py-3 space-y-3"
                        onScroll={updatePanelScroll}
                      >
                        {/* Fee + Venue */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-lg p-2.5 border border-emerald-100">
                            <p className="text-[9px] font-medium text-emerald-600 uppercase tracking-wider mb-0.5">
                              {tGig('fee')}
                            </p>
                            <p className="text-sm font-bold text-emerald-700">
                              {selectedGig.fee !== null
                                ? `${selectedGig.fee.toLocaleString(formatLocale)} ${tc('kr')}`
                                : '—'}
                            </p>
                            {selectedGig.travel_expense && (
                              <p className="text-[10px] text-emerald-600 mt-0.5">
                                + {selectedGig.travel_expense.toLocaleString(formatLocale)} {tc('kr')}{' '}
                                {tGig('travelShort')}
                              </p>
                            )}
                          </div>
                          {selectedGig.venue ? (
                            <div className="bg-card rounded-lg p-2.5 border shadow-sm">
                              <div className="flex items-center gap-1 mb-0.5">
                                <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
                                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                                  {tGig('venue')}
                                </p>
                              </div>
                              <p className="text-xs font-medium">{selectedGig.venue}</p>
                            </div>
                          ) : (
                            <div className="bg-secondary/50 rounded-lg p-2.5 border">
                              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                                {tGig('venue')}
                              </p>
                              <p className="text-xs text-muted-foreground">—</p>
                            </div>
                          )}
                        </div>

                        {/* Dates */}
                        <div className="bg-secondary/30 rounded-lg p-2.5 border">
                          <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                            {tGig('date')} ({selectedGig.gig_dates?.length || selectedGig.total_days} {tc('days')})
                          </p>
                          {selectedGig.gig_dates && selectedGig.gig_dates.length > 0 ? (
                            <>
                              <div className="flex flex-wrap gap-1">
                                {selectedGig.gig_dates
                                  .sort((a, b) => a.date.localeCompare(b.date))
                                  .map((gd, i) => {
                                    const dateObj = new Date(gd.date + 'T12:00:00')
                                    const dayName = format(dateObj, 'EEE', { locale: dateLocale })
                                    const dayNum = format(dateObj, 'd', { locale: dateLocale })
                                    const mon = format(dateObj, 'MMM', { locale: dateLocale })
                                    return (
                                      <div
                                        key={i}
                                        className="flex flex-col items-center bg-card rounded px-1.5 py-0.5 border shadow-sm min-w-[38px]"
                                      >
                                        <span className="text-[7px] font-medium text-muted-foreground uppercase">
                                          {dayName}
                                        </span>
                                        <span className="text-xs font-bold">{dayNum}</span>
                                        <span className="text-[7px] font-medium text-muted-foreground">{mon}</span>
                                      </div>
                                    )
                                  })}
                              </div>
                              {selectedGig.gig_dates.some((gd) => gd.sessions && gd.sessions.length > 0) && (
                                <div className="space-y-0.5 pt-1.5">
                                  {selectedGig.gig_dates
                                    .sort((a, b) => a.date.localeCompare(b.date))
                                    .filter((gd) => gd.sessions && gd.sessions.length > 0)
                                    .map((gd, i) => {
                                      const date = new Date(gd.date + 'T12:00:00')
                                      return (
                                        <div key={i} className="flex items-baseline gap-1.5 text-[10px]">
                                          <span className="text-muted-foreground w-[55px] shrink-0">
                                            {format(date, 'EEE d MMM', { locale: dateLocale })}
                                          </span>
                                          <span className="text-foreground/80">
                                            {gd.sessions!.map((s, j) => (
                                              <span key={j}>
                                                {j > 0 && (
                                                  <span className="text-muted-foreground/50 mx-0.5">&middot;</span>
                                                )}
                                                {s.label && <span className="font-medium">{s.label} </span>}
                                                {s.start}
                                                {s.end && `\u2013${s.end}`}
                                              </span>
                                            ))}
                                          </span>
                                        </div>
                                      )
                                    })}
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-xs font-semibold">
                              {format(new Date(selectedGig.date), 'PPP', { locale: dateLocale })}
                            </p>
                          )}
                        </div>

                        {/* Notes */}
                        <div className="bg-card rounded-lg p-2.5 border shadow-sm">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                              {tGig('notes')}
                            </p>
                            {!editingNotes && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={() => {
                                  setNotesText(selectedGig.notes || '')
                                  setEditingNotes(true)
                                }}
                              >
                                <Pencil className="h-2.5 w-2.5 text-muted-foreground" />
                              </Button>
                            )}
                          </div>
                          {editingNotes ? (
                            <div className="space-y-2">
                              <Textarea
                                value={notesText}
                                onChange={(e) => setNotesText(e.target.value)}
                                className="text-xs min-h-[80px] resize-none"
                                placeholder={tc('writeNotesHere')}
                                autoFocus
                              />
                              <div className="flex gap-1.5 justify-end">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => setEditingNotes(false)}
                                >
                                  {tc('cancel')}
                                </Button>
                                <Button
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => saveNotes(selectedGig.id, notesText)}
                                >
                                  {tc('save')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-snug">
                              {selectedGig.notes || <span className="italic">{tc('noNotes')}</span>}
                            </p>
                          )}
                        </div>

                        {/* Attachments */}
                        <div className="bg-card rounded-lg p-2.5 border shadow-sm">
                          <GigAttachments gigId={selectedGig.id} />
                        </div>

                        {/* Receipts */}
                        <div className="bg-card rounded-lg p-2.5 border shadow-sm">
                          <div className="flex items-center justify-between mb-1.5">
                            <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                              <Receipt className="h-2.5 w-2.5" />
                              {tGig('receipts')} ({gigExpenses.length})
                            </p>
                          </div>
                          {gigExpenses.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">{tGig('noReceiptsLinked')}</p>
                          ) : (
                            <ul className="space-y-1">
                              {gigExpenses.map((exp) => (
                                <li key={exp.id} className="flex items-center justify-between text-xs">
                                  <span className="truncate">{exp.supplier}</span>
                                  <span className="font-medium shrink-0 ml-2">
                                    {exp.amount.toLocaleString(formatLocale)}{' '}
                                    {exp.currency === 'SEK' ? tc('kr') : exp.currency}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                      {/* Scroll up indicator */}
                      <div
                        className={cn(
                          'pointer-events-none absolute top-0 left-0 right-0 flex flex-col items-center pt-1 bg-gradient-to-b from-card via-card/80 to-transparent h-8 transition-opacity duration-300',
                          panelCanScrollUp ? 'opacity-100' : 'opacity-0',
                        )}
                      >
                        <ChevronUp className="h-4 w-4 text-muted-foreground/60 animate-bounce" />
                      </div>
                      {/* Scroll down indicator */}
                      <div
                        className={cn(
                          'pointer-events-none absolute bottom-0 left-0 right-0 flex flex-col items-center pb-1 bg-gradient-to-t from-card via-card/80 to-transparent h-8 transition-opacity duration-300',
                          panelCanScrollDown ? 'opacity-100' : 'opacity-0',
                        )}
                      >
                        <ChevronDown className="h-4 w-4 text-muted-foreground/60 animate-bounce mt-auto" />
                      </div>
                    </div>
                  </>
                )}
              </Card>
            </div>
          </div>

          {/* Mobile Bottom Sheet (<lg) */}
          <div className="lg:hidden">
            {/* Backdrop */}
            <div
              className={`fixed inset-0 z-40 transition-all duration-300 ${
                selectedGig ? 'bg-black/50 backdrop-blur-sm opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              onClick={() => setSelectedGig(null)}
            />
            {/* Bottom Sheet */}
            <div
              className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                selectedGig ? 'translate-y-0' : 'translate-y-full'
              }`}
              style={{ height: '50vh', minHeight: '320px' }}
            >
              <div className="h-full bg-gradient-to-b from-background/95 to-background/98 backdrop-blur-xl border-t border-white/20 shadow-[0_-20px_60px_-15px_rgba(0,0,0,0.2)]">
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
                <div className="flex justify-center pt-2 pb-0">
                  <div className="w-10 h-1 rounded-full bg-gray-300/80" />
                </div>
                {selectedGig && (
                  <div className="h-full flex flex-col px-5">
                    <div className="flex items-start justify-between py-3">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-1 h-12 rounded-full mt-0.5"
                          style={{ backgroundColor: selectedGig.gig_type?.color || '#6366f1' }}
                        />
                        <div className="space-y-0.5">
                          <h2 className="text-xl font-semibold tracking-tight text-gray-900">
                            {selectedGig.project_name || selectedGig.gig_type?.name || tGig('newGig')}
                          </h2>
                          <p className="text-sm text-gray-500">
                            {selectedGig.client?.name || <span className="italic">{tGig('clientNotSpecified')}</span>}
                          </p>
                          <div className="flex items-center gap-2 pt-0.5">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfigColors[selectedGig.status] || 'bg-gray-100 text-gray-800'}`}
                            >
                              {tStatus(selectedGig.status)}
                            </span>
                            <span className="text-xs text-gray-400">
                              {selectedGig.gig_type?.name}
                              {selectedGig.position && ` · ${selectedGig.position.name}`}
                            </span>
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full hover:bg-gray-100 -mt-1"
                        onClick={() => setSelectedGig(null)}
                      >
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      </Button>
                    </div>
                    <div className="flex-1 overflow-y-auto pb-2">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-3 border border-emerald-100">
                              <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider mb-0.5">
                                {tGig('fee')}
                              </p>
                              <p className="text-base font-bold text-emerald-700">
                                {selectedGig.fee !== null
                                  ? `${selectedGig.fee.toLocaleString(formatLocale)} ${tc('kr')}`
                                  : '—'}
                              </p>
                            </div>
                            {selectedGig.venue ? (
                              <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <MapPin className="h-3 w-3 text-gray-400" />
                                  <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                                    {tGig('venue')}
                                  </p>
                                </div>
                                <p className="text-sm font-medium text-gray-900">{selectedGig.venue}</p>
                              </div>
                            ) : (
                              <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">
                                  {tGig('venue')}
                                </p>
                                <p className="text-sm text-gray-400">—</p>
                              </div>
                            )}
                          </div>
                          <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-3 border border-gray-100">
                            <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                              {tGig('date')} ({selectedGig.gig_dates?.length || selectedGig.total_days} {tc('days')})
                            </p>
                            {selectedGig.gig_dates && selectedGig.gig_dates.length > 0 ? (
                              <>
                                <div className="flex flex-wrap gap-1">
                                  {selectedGig.gig_dates
                                    .sort((a, b) => a.date.localeCompare(b.date))
                                    .map((gd, i) => {
                                      const dateObj = new Date(gd.date + 'T12:00:00')
                                      return (
                                        <div
                                          key={i}
                                          className="flex flex-col items-center bg-white rounded-lg px-2 py-1 border border-gray-200 shadow-sm min-w-[44px]"
                                        >
                                          <span className="text-[8px] font-medium text-gray-400 uppercase">
                                            {format(dateObj, 'EEE', { locale: dateLocale })}
                                          </span>
                                          <span className="text-sm font-bold text-gray-900">
                                            {format(dateObj, 'd', { locale: dateLocale })}
                                          </span>
                                          <span className="text-[8px] font-medium text-gray-500">
                                            {format(dateObj, 'MMM', { locale: dateLocale })}
                                          </span>
                                        </div>
                                      )
                                    })}
                                </div>
                                {selectedGig.gig_dates.some((gd) => gd.sessions && gd.sessions.length > 0) && (
                                  <div className="space-y-0.5 pt-1.5">
                                    {selectedGig.gig_dates
                                      .sort((a, b) => a.date.localeCompare(b.date))
                                      .filter((gd) => gd.sessions && gd.sessions.length > 0)
                                      .map((gd, i) => {
                                        const date = new Date(gd.date + 'T12:00:00')
                                        return (
                                          <div key={i} className="flex items-baseline gap-1.5 text-[10px]">
                                            <span className="text-gray-400 w-[55px] shrink-0">
                                              {format(date, 'EEE d MMM', { locale: dateLocale })}
                                            </span>
                                            <span className="text-gray-700">
                                              {gd.sessions!.map((s, j) => (
                                                <span key={j}>
                                                  {j > 0 && <span className="text-gray-300 mx-0.5">&middot;</span>}
                                                  {s.label && <span className="font-medium">{s.label} </span>}
                                                  {s.start}
                                                  {s.end && `\u2013${s.end}`}
                                                </span>
                                              ))}
                                            </span>
                                          </div>
                                        )
                                      })}
                                  </div>
                                )}
                              </>
                            ) : (
                              <p className="text-sm font-semibold text-gray-900">
                                {format(new Date(selectedGig.date), 'PPP', { locale: dateLocale })}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="py-3 pb-5 border-t border-gray-100 flex items-center gap-2">
                      <Button
                        className="bg-gray-900 hover:bg-gray-800 text-white rounded-lg px-4 h-9 text-sm shadow-lg shadow-gray-900/10"
                        onClick={() => setEditingGig(selectedGig)}
                      >
                        <Edit className="h-3.5 w-3.5 mr-1.5" />
                        {tc('edit')}
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-lg px-4 h-9 text-sm border-gray-200 hover:bg-gray-50"
                        onClick={() => setShowReceiptDialog(true)}
                      >
                        <Receipt className="h-3.5 w-3.5 mr-1.5" />
                        {tGig('addReceipt')}
                      </Button>
                      <div className="flex-1" />
                      <Button
                        variant="ghost"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50 rounded-lg px-3 h-9 text-sm"
                        onClick={() => confirmDeleteGig(selectedGig.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                        {tc('delete')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <ConfirmDialog
            open={deleteConfirmOpen}
            onOpenChange={(open) => {
              setDeleteConfirmOpen(open)
              if (!open) setGigToDelete(null)
            }}
            title={tGig('deleteGig')}
            description={tGig('deleteConfirm')}
            confirmLabel={tc('delete')}
            variant="destructive"
            onConfirm={() => {
              if (gigToDelete) {
                deleteGig(gigToDelete)
                if (selectedGig?.id === gigToDelete) {
                  setSelectedGig(null)
                }
              }
              setDeleteConfirmOpen(false)
              setGigToDelete(null)
            }}
          />
        </div>
      </PageTransition>
    </PullToRefresh>
  )
}
