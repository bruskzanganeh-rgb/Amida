'use client'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useVirtualizer } from '@tanstack/react-virtual'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/lib/types/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus,
  Calendar,
  Check,
  X,
  Clock,
  FileText,
  DollarSign,
  Trash2,
  Edit,
  MapPin,
  ChevronDown,
  ChevronUp,
  Pencil,
  HelpCircle,
  AlertTriangle,
  Receipt,
  ArrowRight,
  History,
  Ban,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Copy,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { GigAttachments } from '@/components/gigs/gig-attachments'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { GigDialog } from '@/components/gigs/gig-dialog'
import { UploadReceiptDialog } from '@/components/expenses/upload-receipt-dialog'
import { format } from 'date-fns'
import type { Locale } from 'date-fns'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { formatCurrency, type SupportedCurrency } from '@/lib/currency/exchange'
import { useCompany } from '@/lib/hooks/use-company'
import { useGigFilter } from '@/lib/hooks/use-gig-filter'
import { PageTransition } from '@/components/ui/page-transition'

function fmtFee(amount: number, currency?: string | null): string {
  return formatCurrency(amount, (currency || 'SEK') as SupportedCurrency)
}

type SortColumn = 'date' | 'client' | 'type' | 'venue' | 'fee' | 'status'
type SortDir = 'asc' | 'desc'
type SortConfig = { column: SortColumn; direction: SortDir }

function sortGigs(gigs: Gig[], config: SortConfig): Gig[] {
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
      case 'venue':
        cmp = (a.venue || '').localeCompare(b.venue || '')
        break
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

function SortableHead({
  column,
  sort,
  onSort,
  children,
  className,
}: {
  column: SortColumn
  sort: SortConfig
  onSort: (col: SortColumn) => void
  children: React.ReactNode
  className?: string
}) {
  const active = sort.column === column
  return (
    <TableHead className={cn('cursor-pointer select-none hover:bg-muted/50', className)} onClick={() => onSort(column)}>
      <div className="flex items-center gap-1">
        {children}
        {active ? (
          sort.direction === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </TableHead>
  )
}

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
  }[]
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

function formatGigDates(gig: Gig, locale: Locale): string {
  if (!gig.total_days || gig.total_days === 1) {
    return format(new Date(gig.date), 'PPP', { locale })
  }

  const start = format(new Date(gig.start_date!), 'd MMM', { locale })
  const end = format(new Date(gig.end_date!), 'd MMM yyyy', { locale })
  return `${start} - ${end}`
}

function getDeadlineStatus(
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
    return { label: '', color: 'bg-red-100 text-red-800', urgent: true, key: 'overdue' }
  } else if (diffDays === 0) {
    return { label: '', color: 'bg-red-100 text-red-800', urgent: true, key: 'todayDeadline' }
  } else if (diffDays <= 2) {
    return { label: `${diffDays}`, color: 'bg-orange-100 text-orange-800', urgent: true, key: 'daysCount' }
  } else if (diffDays <= 7) {
    return { label: format(deadlineDate, 'd MMM', { locale }), color: 'bg-yellow-100 text-yellow-800', urgent: false }
  } else {
    return { label: format(deadlineDate, 'd MMM', { locale }), color: 'bg-gray-100 text-gray-600', urgent: false }
  }
}

function gigHasPassed(gig: Gig): boolean {
  const lastDate = gig.end_date || gig.date
  const today = new Date().toISOString().split('T')[0]
  return lastDate < today
}

const statusConfig = {
  tentative: { icon: HelpCircle, color: 'bg-orange-100 text-orange-800' },
  pending: { icon: Clock, color: 'bg-yellow-100 text-yellow-800' },
  accepted: { icon: Check, color: 'bg-green-100 text-green-800' },
  declined: { icon: X, color: 'bg-red-100 text-red-800' },
  completed: { icon: Check, color: 'bg-blue-100 text-blue-800' },
  invoiced: { icon: FileText, color: 'bg-purple-100 text-purple-800' },
  paid: { icon: DollarSign, color: 'bg-green-200 text-green-900' },
}

const activeStatuses = new Set(['tentative', 'pending', 'accepted'])
const historyStatuses = new Set(['completed', 'invoiced', 'paid'])

export default function GigsPage() {
  const t = useTranslations('gig')
  const tStatus = useTranslations('status')
  const tc = useTranslations('common')
  const tToast = useTranslations('toast')
  const tTeam = useTranslations('team')
  const dateLocale = useDateLocale()
  const formatLocale = useFormatLocale()
  const { company, members, allMembers } = useCompany()
  const gigFilter = useGigFilter()
  const isSharedMode = company?.gig_visibility === 'shared' && members.length > 1

  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingGig, setEditingGig] = useState<Gig | null>(null)
  const [selectedGig, setSelectedGig] = useState<Gig | null>(null)
  const [activeTab, setActiveTab] = useState('upcoming')
  const [searchQuery, setSearchQuery] = useState('')
  const [upcomingSort, setUpcomingSort] = useState<SortConfig>({ column: 'date', direction: 'asc' })
  const [historySort, setHistorySort] = useState<SortConfig>({ column: 'date', direction: 'desc' })
  const [declinedSort, setDeclinedSort] = useState<SortConfig>({ column: 'date', direction: 'desc' })
  const [mobileLimit, setMobileLimit] = useState({ upcoming: 20, history: 20, declined: 20 })
  const [editingNotes, setEditingNotes] = useState(false)
  const [notesText, setNotesText] = useState('')
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)
  const [duplicateValues, setDuplicateValues] = useState<
    | {
        client_id?: string
        gig_type_id?: string
        position_id?: string
        fee?: string
        currency?: string
        venue?: string
        project_name?: string
      }
    | undefined
  >(undefined)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [gigToDelete, setGigToDelete] = useState<string | null>(null)
  const [confirmDeclineGig, setConfirmDeclineGig] = useState<string | null>(null)
  const [confirmBatchComplete, setConfirmBatchComplete] = useState(false)
  const [gigExpenses, setGigExpenses] = useState<GigExpense[]>([])
  const [showScrollHint, setShowScrollHint] = useState(true)
  const [currentUserId, setCurrentUserId] = useState<string>('')
  const [panelCanScrollUp, setPanelCanScrollUp] = useState(false)
  const [panelCanScrollDown, setPanelCanScrollDown] = useState(false)
  const panelScrollRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  const upcomingScrollRef = useRef<HTMLDivElement>(null)
  const historyScrollRef = useRef<HTMLDivElement>(null)
  const declinedScrollRef = useRef<HTMLDivElement>(null)

  const updatePanelScroll = useCallback(() => {
    const el = panelScrollRef.current
    if (!el) return
    setPanelCanScrollUp(el.scrollTop > 10)
    setPanelCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 10)
  }, [])

  const {
    data: gigs = [],
    isLoading: loading,
    mutate: mutateGigs,
  } = useSWR<Gig[]>(
    'gigs-full',
    async () => {
      const { data, error } = await supabase
        .from('gigs')
        .select(
          `
          *,
          user_id,
          client:clients(name, payment_terms),
          gig_type:gig_types(name, vat_rate, color),
          position:positions(name),
          gig_dates(date, schedule_text, sessions)
        `,
        )
        .neq('status', 'draft')
        .order('date', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data || []) as unknown as Gig[]
    },
    { revalidateOnFocus: true, dedupingInterval: 10_000 },
  )

  const loadGigs = useCallback(() => mutateGigs(), [mutateGigs])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [supabase.auth])

  function getMemberLabel(userId: string): string {
    if (userId === currentUserId) return tTeam('me')
    const member = allMembers.find((m) => m.user_id === userId)
    if (member?.full_name) return member.full_name.split(' ')[0]
    if (member?.email) return member.email.split('@')[0]
    return userId.slice(0, 6)
  }

  function handleDuplicate(gig: Gig) {
    setDuplicateValues({
      client_id: gig.client_id || undefined,
      gig_type_id: gig.gig_type_id,
      position_id: gig.position_id || undefined,
      fee: gig.fee?.toString() || undefined,
      currency: gig.currency || undefined,
      venue: gig.venue || undefined,
      project_name: gig.project_name || undefined,
    })
    setSelectedGig(null)
    setShowCreateDialog(true)
  }

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    const noScroll = el.scrollHeight <= el.clientHeight
    setShowScrollHint(!nearBottom && !noScroll)
  }

  const loadGigExpenses = useCallback(
    async (gigId: string) => {
      const { data, error } = await supabase
        .from('expenses')
        .select('id, date, supplier, amount, currency, category, attachment_url')
        .eq('gig_id', gigId)
        .order('date', { ascending: false })

      if (error) {
        console.error('Error loading gig expenses:', error)
        toast.error(tToast('expenseLoadError'))
      } else {
        setGigExpenses(data || [])
      }
    },
    [supabase, tToast],
  )

  useEffect(() => {
    if (selectedGig) {
      loadGigExpenses(selectedGig.id)
      setTimeout(updatePanelScroll, 100)
    } else {
      setGigExpenses([])
      setPanelCanScrollUp(false)
      setPanelCanScrollDown(false)
    }
  }, [selectedGig, loadGigExpenses, updatePanelScroll])

  async function updateStatus(id: string, status: string) {
    const { error } = await supabase
      .from('gigs')
      .update({
        status: status as Database['public']['Enums']['gig_status'],
        response_date: status !== 'pending' ? new Date().toISOString() : null,
      })
      .eq('id', id)

    if (error) {
      console.error('Error updating status:', error)
      toast.error(tToast('statusUpdateError'))
    } else {
      loadGigs()
      document.dispatchEvent(new Event('gig-status-changed'))
      if (status === 'completed') {
        toast.success(tToast('gigCompleted'), {
          action: {
            label: tToast('invoiceNow'),
            onClick: () => {
              window.location.href = '/finance'
            },
          },
          duration: 6000,
        })
      }
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

  async function openEditById(gigId: string) {
    const { data, error } = await supabase
      .from('gigs')
      .select(
        `
        *,
        client:clients(name, payment_terms),
        gig_type:gig_types(name, vat_rate, color),
        position:positions(name),
        gig_dates(date, schedule_text, sessions)
      `,
      )
      .eq('id', gigId)
      .single()

    if (error) {
      console.error('Error loading gig:', error)
      return
    }
    setEditingGig(data as unknown as Gig)
  }

  async function saveNotes(id: string, notes: string) {
    const { error } = await supabase
      .from('gigs')
      .update({ notes: notes || null })
      .eq('id', id)

    if (error) {
      console.error('Error saving notes:', error)
      toast.error(tToast('notesError'))
    } else {
      // Update local cache optimistically
      mutateGigs(
        gigs.map((g) => (g.id === id ? { ...g, notes: notes || null } : g)),
        false,
      )
      if (selectedGig?.id === id) {
        setSelectedGig({ ...selectedGig, notes: notes || null })
      }
      setEditingNotes(false)
    }
  }

  async function batchMarkCompleted(gigIds: string[]) {
    const { error } = await supabase.from('gigs').update({ status: 'completed' }).in('id', gigIds)

    if (error) {
      console.error('Error batch updating:', error)
      toast.error(tToast('statusUpdateError'))
    } else {
      toast.success(tToast('gigsCompleted', { count: gigIds.length }), {
        action: {
          label: tToast('goToFinance'),
          onClick: () => {
            window.location.href = '/finance'
          },
        },
        duration: 6000,
      })
      loadGigs()
    }
  }

  function toggleSort(setter: (s: SortConfig) => void, current: SortConfig, column: SortColumn) {
    setter(
      current.column === column
        ? { column, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: 'asc' },
    )
  }

  function renderDeadlineLabel(deadlineInfo: { label: string; color: string; urgent: boolean; key?: string }) {
    if (deadlineInfo.key === 'overdue') return t('overdue')
    if (deadlineInfo.key === 'todayDeadline') return t('todayDeadline')
    if (deadlineInfo.key === 'daysCount') return `${deadlineInfo.label} ${tc('days')}`
    return deadlineInfo.label
  }

  // Computed groups
  const pastNeedingAction = useMemo(
    () =>
      gigs.filter((g) => activeStatuses.has(g.status) && gigHasPassed(g)).sort((a, b) => a.date.localeCompare(b.date)),
    [gigs],
  )

  const pastAccepted = pastNeedingAction.filter((g) => g.status === 'accepted')
  const pastUnanswered = pastNeedingAction.filter((g) => g.status === 'pending' || g.status === 'tentative')

  const matchesSearch = useCallback(
    (g: Gig) => {
      if (gigFilter.shouldFilter && g.user_id !== gigFilter.currentUserId) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        (g.project_name || '').toLowerCase().includes(q) ||
        (g.client?.name || '').toLowerCase().includes(q) ||
        (g.venue || '').toLowerCase().includes(q) ||
        (g.gig_type?.name || '').toLowerCase().includes(q)
      )
    },
    [gigFilter.shouldFilter, gigFilter.currentUserId, searchQuery],
  )

  const sortedUpcoming = useMemo(
    () =>
      sortGigs(
        gigs.filter((g) => activeStatuses.has(g.status) && !gigHasPassed(g) && matchesSearch(g)),
        upcomingSort,
      ),
    [gigs, upcomingSort, matchesSearch],
  )

  const sortedHistory = useMemo(
    () =>
      sortGigs(
        gigs.filter((g) => historyStatuses.has(g.status) && matchesSearch(g)),
        historySort,
      ),
    [gigs, historySort, matchesSearch],
  )

  const sortedDeclined = useMemo(
    () =>
      sortGigs(
        gigs.filter((g) => g.status === 'declined' && matchesSearch(g)),
        declinedSort,
      ),
    [gigs, declinedSort, matchesSearch],
  )

  const pipelineCounts = useMemo(
    () => ({
      completed: gigs.filter((g) => g.status === 'completed').length,
      invoiced: gigs.filter((g) => g.status === 'invoiced').length,
      paid: gigs.filter((g) => g.status === 'paid').length,
    }),
    [gigs],
  )

  const upcomingVirtualizer = useVirtualizer({
    count: sortedUpcoming.length,
    getScrollElement: () => upcomingScrollRef.current,
    estimateSize: () => 65,
    overscan: 5,
  })

  const historyVirtualizer = useVirtualizer({
    count: sortedHistory.length,
    getScrollElement: () => historyScrollRef.current,
    estimateSize: () => 65,
    overscan: 5,
  })

  const declinedVirtualizer = useVirtualizer({
    count: sortedDeclined.length,
    getScrollElement: () => declinedScrollRef.current,
    estimateSize: () => 65,
    overscan: 5,
  })

  // Re-measure virtualizers when tab changes (scroll container may have been hidden)
  useEffect(() => {
    requestAnimationFrame(() => {
      if (activeTab === 'history') historyVirtualizer.measure()
      if (activeTab === 'declined') declinedVirtualizer.measure()
      if (activeTab === 'upcoming') upcomingVirtualizer.measure()
    })
  }, [activeTab, historyVirtualizer, declinedVirtualizer, upcomingVirtualizer])

  return (
    <>
      <PageTransition>
        <div className="lg:flex lg:h-[calc(100vh-7rem)]" style={{ gap: '16px' }}>
          {/* Main content */}
          <div
            className={cn(
              'flex-1 min-w-0 space-y-6 transition-all duration-300 lg:flex lg:flex-col',
              selectedGig && 'lg:overflow-y-auto',
            )}
          >
            {/* Section 1: Past gigs needing action */}
            {pastNeedingAction.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-amber-800">
                      <AlertTriangle className="h-5 w-5" />
                      {t('needsActionCount', { count: pastNeedingAction.length })}
                    </CardTitle>
                    {pastAccepted.length > 1 && (
                      <Button size="sm" onClick={() => setConfirmBatchComplete(true)}>
                        <Check className="h-4 w-4 mr-1" />
                        {t('markAllCompleted', { count: pastAccepted.length })}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {pastUnanswered.length > 0 && (
                    <div className="mb-4 p-3 rounded-lg bg-yellow-100/50 border border-yellow-200 text-sm text-yellow-800">
                      <AlertTriangle className="h-4 w-4 inline mr-1.5" />
                      {t('passedNoResponse', { count: pastUnanswered.length })}
                    </div>
                  )}
                  {/* Mobile card view */}
                  <div className="lg:hidden space-y-2">
                    {pastNeedingAction.map((gig) => {
                      const StatusIcon = statusConfig[gig.status as keyof typeof statusConfig]?.icon
                      return (
                        <div
                          key={gig.id}
                          className="py-2.5 pr-3 pl-3 rounded-lg border border-amber-200/50 border-l-4 bg-white/60 dark:bg-white/5 cursor-pointer hover:bg-amber-100/30 transition-colors"
                          style={{ borderLeftColor: gig.gig_type.color || '#9ca3af' }}
                          onClick={() => {
                            setSelectedGig(selectedGig?.id === gig.id ? null : gig)
                            setEditingNotes(false)
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-medium text-sm">{formatGigDates(gig, dateLocale)}</p>
                              <p className="text-sm text-muted-foreground truncate">
                                {gig.client?.name || t('notSpecified')}
                              </p>
                              {gig.project_name && (
                                <p className="text-xs text-muted-foreground truncate">{gig.project_name}</p>
                              )}
                              {isSharedMode && gig.user_id !== currentUserId && (
                                <p className="text-xs text-blue-600 dark:text-blue-400">
                                  {getMemberLabel(gig.user_id)}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-semibold text-sm">
                                {gig.fee !== null ? fmtFee(gig.fee, gig.currency) : '-'}
                              </span>
                              <div className="mt-0.5">
                                <Badge
                                  className={`text-xs ${statusConfig[gig.status as keyof typeof statusConfig]?.color}`}
                                >
                                  {StatusIcon && <StatusIcon className="h-3 w-3 mr-0.5" />}
                                  {tStatus(gig.status)}
                                </Badge>
                              </div>
                              {gig.status === 'accepted' && (
                                <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => updateStatus(gig.id, 'completed')}
                                  >
                                    <Check className="h-3 w-3 mr-1" />
                                    {t('markCompleted')}
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Desktop table view */}
                  <div className="hidden lg:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('date')}</TableHead>
                          <TableHead>{t('client')}</TableHead>
                          <TableHead>{t('type')}</TableHead>
                          <TableHead>{t('fee')}</TableHead>
                          <TableHead>{t('status')}</TableHead>
                          <TableHead className="text-right">{t('action')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pastNeedingAction.map((gig) => {
                          const StatusIcon = statusConfig[gig.status as keyof typeof statusConfig]?.icon
                          return (
                            <TableRow
                              key={gig.id}
                              className="cursor-pointer hover:bg-amber-100/50"
                              onClick={() => {
                                setSelectedGig(selectedGig?.id === gig.id ? null : gig)
                                setEditingNotes(false)
                              }}
                            >
                              <TableCell className="font-medium">
                                <div>
                                  {formatGigDates(gig, dateLocale)}
                                  {gig.total_days > 1 && (
                                    <span className="text-xs text-muted-foreground ml-1">
                                      ({gig.total_days} {tc('days')})
                                    </span>
                                  )}
                                  {gig.project_name && (
                                    <div className="text-sm text-muted-foreground truncate max-w-[200px]">
                                      {gig.project_name}
                                    </div>
                                  )}
                                  {isSharedMode && gig.user_id !== currentUserId && (
                                    <div className="text-xs text-blue-600 dark:text-blue-400">
                                      {getMemberLabel(gig.user_id)}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {gig.client?.name || (
                                  <span className="text-muted-foreground italic">{t('notSpecified')}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-3 h-3 rounded-full"
                                    style={{ backgroundColor: gig.gig_type.color || '#9ca3af' }}
                                  />
                                  <span className="text-sm">{gig.gig_type.name}</span>
                                </div>
                              </TableCell>
                              <TableCell className="font-medium">
                                {gig.fee !== null ? (
                                  fmtFee(gig.fee, gig.currency)
                                ) : (
                                  <span className="text-muted-foreground italic">{t('notSet')}</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge className={statusConfig[gig.status as keyof typeof statusConfig]?.color}>
                                  {StatusIcon && <StatusIcon className="h-3 w-3 mr-1" />}
                                  {tStatus(gig.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                {gig.status === 'accepted' ? (
                                  <Button size="sm" onClick={() => updateStatus(gig.id, 'completed')}>
                                    <Check className="h-4 w-4 mr-1" />
                                    {t('markCompleted')}
                                  </Button>
                                ) : (
                                  <div className="flex items-center justify-end gap-1">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => updateStatus(gig.id, 'accepted')}
                                      title={t('acceptGig')}
                                    >
                                      <Check className="h-4 w-4 text-green-600" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setConfirmDeclineGig(gig.id)}
                                      title={t('declineGig')}
                                    >
                                      <X className="h-4 w-4 text-red-600" />
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tabs + action button (page-level toolbar) */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v)
                setShowScrollHint(true)
              }}
              className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col"
            >
              <div className="flex items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="upcoming" className="gap-1.5">
                    <Calendar className="h-4 w-4 shrink-0 hidden sm:block" />
                    {t('upcoming')} ({sortedUpcoming.length})
                  </TabsTrigger>
                  <TabsTrigger value="history" className="gap-1.5">
                    <History className="h-4 w-4 shrink-0 hidden sm:block" />
                    {t('history')} ({sortedHistory.length})
                  </TabsTrigger>
                  <TabsTrigger value="declined" className="gap-1.5">
                    <Ban className="h-4 w-4 shrink-0 hidden sm:block" />
                    {t('declined')} ({sortedDeclined.length})
                  </TabsTrigger>
                </TabsList>
                <Button onClick={() => setShowCreateDialog(true)} size="sm" className="shrink-0">
                  <Plus className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">{t('newGig')}</span>
                </Button>
              </div>

              {/* Upcoming */}
              <TabsContent value="upcoming" className="mt-4 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                <Card className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                  <CardHeader>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2">
                          <Calendar className="h-5 w-5" />
                          {t('upcoming')} ({sortedUpcoming.length})
                        </CardTitle>
                        <div className="flex items-center gap-2" />
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={`${tc('search')}...`}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                    {loading ? (
                      <TableSkeleton columns={7} rows={5} />
                    ) : sortedUpcoming.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{t('noUpcoming')}</p>
                        <p className="text-sm">{t('noUpcomingHint')}</p>
                        <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowCreateDialog(true)}>
                          <Plus className="h-4 w-4 mr-1" />
                          {t('newGig')}
                        </Button>
                      </div>
                    ) : (
                      <div className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                        {/* Mobile card view */}
                        <div className="lg:hidden space-y-2">
                          {sortedUpcoming.slice(0, mobileLimit.upcoming).map((gig) => {
                            const StatusIcon = statusConfig[gig.status as keyof typeof statusConfig]?.icon
                            return (
                              <div
                                key={gig.id}
                                className="py-2.5 pr-3 pl-3 rounded-lg border border-l-4 bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                                style={{ borderLeftColor: gig.gig_type.color || '#9ca3af' }}
                                onClick={() => {
                                  setSelectedGig(selectedGig?.id === gig.id ? null : gig)
                                  setEditingNotes(false)
                                }}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-sm">{formatGigDates(gig, dateLocale)}</p>
                                    <p className="text-sm text-muted-foreground truncate">
                                      {gig.client?.name || t('notSpecified')}
                                    </p>
                                    {gig.project_name && (
                                      <p className="text-xs text-muted-foreground truncate">{gig.project_name}</p>
                                    )}
                                    {isSharedMode && gig.user_id !== currentUserId && (
                                      <p className="text-xs text-blue-600 dark:text-blue-400">
                                        {getMemberLabel(gig.user_id)}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="font-semibold text-sm">
                                      {gig.fee !== null ? fmtFee(gig.fee, gig.currency) : '-'}
                                    </span>
                                    <div className="mt-0.5">
                                      <Badge
                                        className={`text-xs ${statusConfig[gig.status as keyof typeof statusConfig]?.color}`}
                                      >
                                        {StatusIcon && <StatusIcon className="h-3 w-3 mr-0.5" />}
                                        {tStatus(gig.status)}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                          {sortedUpcoming.length > mobileLimit.upcoming && (
                            <Button
                              variant="ghost"
                              className="w-full mt-2 text-sm text-muted-foreground"
                              onClick={() => setMobileLimit((prev) => ({ ...prev, upcoming: prev.upcoming + 20 }))}
                            >
                              {t('showMore', { count: sortedUpcoming.length - mobileLimit.upcoming })}
                            </Button>
                          )}
                        </div>

                        {/* Desktop table view */}
                        <div className="relative hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
                          <div
                            ref={upcomingScrollRef}
                            onScroll={handleScroll}
                            className="lg:flex-1 lg:min-h-0 overflow-auto rounded-md border"
                          >
                            <table className="w-full caption-bottom text-sm table-fixed">
                              <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background">
                                <TableRow>
                                  <SortableHead
                                    column="date"
                                    sort={upcomingSort}
                                    onSort={(c) => toggleSort(setUpcomingSort, upcomingSort, c)}
                                    className="w-[18%]"
                                  >
                                    {t('date')}
                                  </SortableHead>
                                  <SortableHead
                                    column="client"
                                    sort={upcomingSort}
                                    onSort={(c) => toggleSort(setUpcomingSort, upcomingSort, c)}
                                    className="w-[18%]"
                                  >
                                    {t('client')}
                                  </SortableHead>
                                  <SortableHead
                                    column="type"
                                    sort={upcomingSort}
                                    onSort={(c) => toggleSort(setUpcomingSort, upcomingSort, c)}
                                    className="w-[14%]"
                                  >
                                    {t('type')}
                                  </SortableHead>
                                  <SortableHead
                                    column="venue"
                                    sort={upcomingSort}
                                    onSort={(c) => toggleSort(setUpcomingSort, upcomingSort, c)}
                                    className="w-[12%]"
                                  >
                                    {t('venue')}
                                  </SortableHead>
                                  <SortableHead
                                    column="fee"
                                    sort={upcomingSort}
                                    onSort={(c) => toggleSort(setUpcomingSort, upcomingSort, c)}
                                    className="w-[10%]"
                                  >
                                    {t('fee')}
                                  </SortableHead>
                                  <SortableHead
                                    column="status"
                                    sort={upcomingSort}
                                    onSort={(c) => toggleSort(setUpcomingSort, upcomingSort, c)}
                                    className="w-[12%]"
                                  >
                                    {t('status')}
                                  </SortableHead>
                                  <TableHead className="w-[16%] text-right">{t('actions')}</TableHead>
                                </TableRow>
                              </thead>
                              <tbody className="[&_tr:last-child]:border-0">
                                {upcomingVirtualizer.getVirtualItems().length > 0 && (
                                  <tr>
                                    <td
                                      colSpan={7}
                                      style={{
                                        height: upcomingVirtualizer.getVirtualItems()[0].start,
                                        padding: 0,
                                        border: 'none',
                                      }}
                                    />
                                  </tr>
                                )}
                                {upcomingVirtualizer.getVirtualItems().map((virtualRow) => {
                                  const gig = sortedUpcoming[virtualRow.index]
                                  const StatusIcon = statusConfig[gig.status as keyof typeof statusConfig]?.icon
                                  return (
                                    <TableRow
                                      key={gig.id}
                                      data-index={virtualRow.index}
                                      ref={upcomingVirtualizer.measureElement}
                                      className="cursor-pointer hover:bg-muted/50"
                                      onClick={() => {
                                        setSelectedGig(selectedGig?.id === gig.id ? null : gig)
                                        setEditingNotes(false)
                                      }}
                                    >
                                      <TableCell className="font-medium">
                                        <div>
                                          {formatGigDates(gig, dateLocale)}
                                          {gig.total_days > 1 && (
                                            <span className="text-xs text-muted-foreground ml-1">
                                              ({gig.total_days} {tc('days')})
                                            </span>
                                          )}
                                          {gig.project_name && (
                                            <div
                                              className="text-sm text-muted-foreground truncate max-w-[250px]"
                                              title={gig.project_name}
                                            >
                                              {gig.project_name}
                                            </div>
                                          )}
                                          {isSharedMode && gig.user_id !== currentUserId && (
                                            <div className="text-xs text-blue-600 dark:text-blue-400">
                                              {getMemberLabel(gig.user_id)}
                                            </div>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {gig.client?.name || (
                                          <span className="text-muted-foreground italic">{t('notSpecified')}</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: gig.gig_type.color || '#9ca3af' }}
                                          />
                                          <span className="text-sm">{gig.gig_type.name}</span>
                                          <Badge variant="outline" className="text-xs">
                                            {gig.gig_type.vat_rate}%
                                          </Badge>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <span className="text-sm text-muted-foreground">{gig.venue || '-'}</span>
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        {gig.fee !== null ? (
                                          fmtFee(gig.fee, gig.currency)
                                        ) : (
                                          <span className="text-muted-foreground italic">{t('notSet')}</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex flex-col gap-1">
                                          <Badge
                                            className={statusConfig[gig.status as keyof typeof statusConfig]?.color}
                                          >
                                            {StatusIcon && <StatusIcon className="h-3 w-3 mr-1" />}
                                            {tStatus(gig.status)}
                                          </Badge>
                                          {(gig.status === 'pending' || gig.status === 'tentative') &&
                                            gig.response_deadline &&
                                            (() => {
                                              const deadlineInfo = getDeadlineStatus(gig.response_deadline, dateLocale)
                                              if (!deadlineInfo) return null
                                              return (
                                                <Badge variant="outline" className={`text-xs ${deadlineInfo.color}`}>
                                                  {deadlineInfo.urgent && <AlertTriangle className="h-3 w-3 mr-1" />}
                                                  {t('response')}: {renderDeadlineLabel(deadlineInfo)}
                                                </Badge>
                                              )
                                            })()}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1">
                                          {gig.status === 'pending' && (
                                            <>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => updateStatus(gig.id, 'accepted')}
                                                title={t('acceptGig')}
                                              >
                                                <Check className="h-4 w-4 text-green-600" />
                                              </Button>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setConfirmDeclineGig(gig.id)}
                                                title={t('declineGig')}
                                              >
                                                <X className="h-4 w-4 text-red-600" />
                                              </Button>
                                            </>
                                          )}
                                          {gig.status === 'accepted' && (
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8"
                                              onClick={() => updateStatus(gig.id, 'completed')}
                                              title={t('markCompleted')}
                                            >
                                              <Check className="h-4 w-4 text-blue-600" />
                                            </Button>
                                          )}
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDuplicate(gig)}
                                            title={t('duplicateGig')}
                                          >
                                            <Copy className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditingGig(gig)}
                                            title={t('editGig')}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => confirmDeleteGig(gig.id)}
                                            title={t('deleteGig')}
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                                {upcomingVirtualizer.getVirtualItems().length > 0 && (
                                  <tr>
                                    <td
                                      colSpan={7}
                                      style={{
                                        height:
                                          upcomingVirtualizer.getTotalSize() -
                                          (upcomingVirtualizer.getVirtualItems().at(-1)?.end ?? 0),
                                        padding: 0,
                                        border: 'none',
                                      }}
                                    />
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          {showScrollHint && (
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none animate-bounce">
                              <ChevronDown className="h-5 w-5 text-muted-foreground/40" />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* History */}
              <TabsContent value="history" className="mt-4 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                <Card className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                  <CardHeader>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2">
                          <History className="h-5 w-5" />
                          {t('history')} ({sortedHistory.length})
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {activeTab === 'history' && (
                            <>
                              {pipelineCounts.completed > 0 && (
                                <Badge className="bg-blue-100 text-blue-800">
                                  <Check className="h-3 w-3 mr-1" />
                                  {pipelineCounts.completed} {t('completedPipeline')}
                                </Badge>
                              )}
                              {pipelineCounts.completed > 0 && pipelineCounts.invoiced > 0 && (
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              )}
                              {pipelineCounts.invoiced > 0 && (
                                <Badge className="bg-purple-100 text-purple-800">
                                  <FileText className="h-3 w-3 mr-1" />
                                  {pipelineCounts.invoiced} {t('invoicedPipeline')}
                                </Badge>
                              )}
                              {pipelineCounts.invoiced > 0 && pipelineCounts.paid > 0 && (
                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                              )}
                              {pipelineCounts.paid > 0 && (
                                <Badge className="bg-green-200 text-green-900">
                                  <DollarSign className="h-3 w-3 mr-1" />
                                  {pipelineCounts.paid} {t('paidPipeline')}
                                </Badge>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={`${tc('search')}...`}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                    {sortedHistory.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{t('noHistory')}</p>
                        <p className="text-sm">{t('noHistoryHint')}</p>
                      </div>
                    ) : (
                      <div className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                        {/* Mobile card view */}
                        <div className="lg:hidden space-y-2">
                          {sortedHistory.slice(0, mobileLimit.history).map((gig) => {
                            const StatusIcon = statusConfig[gig.status as keyof typeof statusConfig]?.icon
                            return (
                              <div
                                key={gig.id}
                                className="py-2.5 pr-3 pl-3 rounded-lg border border-l-4 bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                                style={{ borderLeftColor: gig.gig_type.color || '#9ca3af' }}
                                onClick={() => {
                                  setSelectedGig(selectedGig?.id === gig.id ? null : gig)
                                  setEditingNotes(false)
                                }}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-sm">{formatGigDates(gig, dateLocale)}</p>
                                    <p className="text-sm text-muted-foreground truncate">
                                      {gig.client?.name || t('notSpecified')}
                                    </p>
                                    {isSharedMode && gig.user_id !== currentUserId && (
                                      <p className="text-xs text-blue-600 dark:text-blue-400">
                                        {getMemberLabel(gig.user_id)}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="font-semibold text-sm">
                                      {gig.fee !== null ? fmtFee(gig.fee, gig.currency) : '-'}
                                    </span>
                                    <div className="mt-0.5">
                                      <Badge
                                        className={`text-xs ${statusConfig[gig.status as keyof typeof statusConfig]?.color}`}
                                      >
                                        {StatusIcon && <StatusIcon className="h-3 w-3 mr-0.5" />}
                                        {tStatus(gig.status)}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                          {sortedHistory.length > mobileLimit.history && (
                            <Button
                              variant="ghost"
                              className="w-full mt-2 text-sm text-muted-foreground"
                              onClick={() => setMobileLimit((prev) => ({ ...prev, history: prev.history + 20 }))}
                            >
                              {t('showMore', { count: sortedHistory.length - mobileLimit.history })}
                            </Button>
                          )}
                        </div>

                        {/* Desktop table view */}
                        <div className="relative hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
                          <div
                            ref={historyScrollRef}
                            onScroll={handleScroll}
                            className="lg:flex-1 lg:min-h-0 overflow-auto rounded-md border"
                          >
                            <table className="w-full caption-bottom text-sm table-fixed">
                              <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background">
                                <TableRow>
                                  <SortableHead
                                    column="date"
                                    sort={historySort}
                                    onSort={(c) => toggleSort(setHistorySort, historySort, c)}
                                    className="w-[18%]"
                                  >
                                    {t('date')}
                                  </SortableHead>
                                  <SortableHead
                                    column="client"
                                    sort={historySort}
                                    onSort={(c) => toggleSort(setHistorySort, historySort, c)}
                                    className="w-[18%]"
                                  >
                                    {t('client')}
                                  </SortableHead>
                                  <SortableHead
                                    column="type"
                                    sort={historySort}
                                    onSort={(c) => toggleSort(setHistorySort, historySort, c)}
                                    className="w-[16%]"
                                  >
                                    {t('type')}
                                  </SortableHead>
                                  <SortableHead
                                    column="venue"
                                    sort={historySort}
                                    onSort={(c) => toggleSort(setHistorySort, historySort, c)}
                                    className="w-[14%]"
                                  >
                                    {t('venue')}
                                  </SortableHead>
                                  <SortableHead
                                    column="fee"
                                    sort={historySort}
                                    onSort={(c) => toggleSort(setHistorySort, historySort, c)}
                                    className="w-[12%]"
                                  >
                                    {t('fee')}
                                  </SortableHead>
                                  <SortableHead
                                    column="status"
                                    sort={historySort}
                                    onSort={(c) => toggleSort(setHistorySort, historySort, c)}
                                    className="w-[10%]"
                                  >
                                    {t('status')}
                                  </SortableHead>
                                  <TableHead className="w-[12%] text-right">{t('actions')}</TableHead>
                                </TableRow>
                              </thead>
                              <tbody className="[&_tr:last-child]:border-0">
                                {historyVirtualizer.getVirtualItems().length > 0 && (
                                  <tr>
                                    <td
                                      colSpan={7}
                                      style={{
                                        height: historyVirtualizer.getVirtualItems()[0].start,
                                        padding: 0,
                                        border: 'none',
                                      }}
                                    />
                                  </tr>
                                )}
                                {historyVirtualizer.getVirtualItems().map((virtualRow) => {
                                  const gig = sortedHistory[virtualRow.index]
                                  const StatusIcon = statusConfig[gig.status as keyof typeof statusConfig]?.icon
                                  return (
                                    <TableRow
                                      key={gig.id}
                                      data-index={virtualRow.index}
                                      ref={historyVirtualizer.measureElement}
                                      className="cursor-pointer hover:bg-muted/50"
                                      onClick={() => {
                                        setSelectedGig(selectedGig?.id === gig.id ? null : gig)
                                        setEditingNotes(false)
                                      }}
                                    >
                                      <TableCell className="font-medium">
                                        <div>
                                          {formatGigDates(gig, dateLocale)}
                                          {gig.total_days > 1 && (
                                            <span className="text-xs text-muted-foreground ml-1">
                                              ({gig.total_days} {tc('days')})
                                            </span>
                                          )}
                                          {gig.project_name && (
                                            <div
                                              className="text-sm text-muted-foreground truncate max-w-[250px]"
                                              title={gig.project_name}
                                            >
                                              {gig.project_name}
                                            </div>
                                          )}
                                          {isSharedMode && gig.user_id !== currentUserId && (
                                            <div className="text-xs text-blue-600 dark:text-blue-400">
                                              {getMemberLabel(gig.user_id)}
                                            </div>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {gig.client?.name || (
                                          <span className="text-muted-foreground italic">{t('notSpecified')}</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: gig.gig_type.color || '#9ca3af' }}
                                          />
                                          <span className="text-sm">{gig.gig_type.name}</span>
                                          <Badge variant="outline" className="text-xs">
                                            {gig.gig_type.vat_rate}%
                                          </Badge>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <span className="text-sm text-muted-foreground">{gig.venue || '-'}</span>
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        {gig.fee !== null ? (
                                          fmtFee(gig.fee, gig.currency)
                                        ) : (
                                          <span className="text-muted-foreground italic">{t('notSet')}</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <Badge className={statusConfig[gig.status as keyof typeof statusConfig]?.color}>
                                          {StatusIcon && <StatusIcon className="h-3 w-3 mr-1" />}
                                          {tStatus(gig.status)}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDuplicate(gig)}
                                            title={t('duplicateGig')}
                                          >
                                            <Copy className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditingGig(gig)}
                                            title={t('editGig')}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => confirmDeleteGig(gig.id)}
                                            title={t('deleteGig')}
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                                {historyVirtualizer.getVirtualItems().length > 0 && (
                                  <tr>
                                    <td
                                      colSpan={7}
                                      style={{
                                        height:
                                          historyVirtualizer.getTotalSize() -
                                          (historyVirtualizer.getVirtualItems().at(-1)?.end ?? 0),
                                        padding: 0,
                                        border: 'none',
                                      }}
                                    />
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          {showScrollHint && (
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none animate-bounce">
                              <ChevronDown className="h-5 w-5 text-muted-foreground/40" />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Declined */}
              <TabsContent value="declined" className="mt-4 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                <Card className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                  <CardHeader>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="flex items-center gap-2">
                          <Ban className="h-5 w-5" />
                          {t('declined')} ({sortedDeclined.length})
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {activeTab === 'declined' && sortedDeclined.length > 0 && (
                            <p className="text-sm text-muted-foreground">
                              {tc('total')}:{' '}
                              {sortedDeclined
                                .reduce((sum, g) => sum + (g.fee_base || g.fee || 0), 0)
                                .toLocaleString(formatLocale)}{' '}
                              {tc('kr')}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={`${tc('search')}...`}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9"
                        />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                    {sortedDeclined.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <Ban className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>{t('noDeclined')}</p>
                        <p className="text-sm">{t('noDeclinedHint')}</p>
                      </div>
                    ) : (
                      <div className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
                        {/* Mobile card view */}
                        <div className="lg:hidden space-y-2">
                          {sortedDeclined.slice(0, mobileLimit.declined).map((gig) => {
                            const StatusIcon = statusConfig[gig.status as keyof typeof statusConfig]?.icon
                            return (
                              <div
                                key={gig.id}
                                className="py-2.5 pr-3 pl-3 rounded-lg border border-l-4 bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                                style={{ borderLeftColor: gig.gig_type.color || '#9ca3af' }}
                                onClick={() => {
                                  setSelectedGig(selectedGig?.id === gig.id ? null : gig)
                                  setEditingNotes(false)
                                }}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-sm">{formatGigDates(gig, dateLocale)}</p>
                                    <p className="text-sm text-muted-foreground truncate">
                                      {gig.client?.name || t('notSpecified')}
                                    </p>
                                    {isSharedMode && gig.user_id !== currentUserId && (
                                      <p className="text-xs text-blue-600 dark:text-blue-400">
                                        {getMemberLabel(gig.user_id)}
                                      </p>
                                    )}
                                  </div>
                                  <div className="text-right shrink-0">
                                    <span className="font-semibold text-sm">
                                      {gig.fee !== null ? fmtFee(gig.fee, gig.currency) : '-'}
                                    </span>
                                    <div className="mt-0.5">
                                      <Badge
                                        className={`text-xs ${statusConfig[gig.status as keyof typeof statusConfig]?.color}`}
                                      >
                                        {StatusIcon && <StatusIcon className="h-3 w-3 mr-0.5" />}
                                        {tStatus(gig.status)}
                                      </Badge>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                          {sortedDeclined.length > mobileLimit.declined && (
                            <Button
                              variant="ghost"
                              className="w-full mt-2 text-sm text-muted-foreground"
                              onClick={() => setMobileLimit((prev) => ({ ...prev, declined: prev.declined + 20 }))}
                            >
                              {t('showMore', { count: sortedDeclined.length - mobileLimit.declined })}
                            </Button>
                          )}
                        </div>

                        {/* Desktop table view */}
                        <div className="relative hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
                          <div
                            ref={declinedScrollRef}
                            onScroll={handleScroll}
                            className="lg:flex-1 lg:min-h-0 overflow-auto rounded-md border"
                          >
                            <table className="w-full caption-bottom text-sm table-fixed">
                              <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background">
                                <TableRow>
                                  <SortableHead
                                    column="date"
                                    sort={declinedSort}
                                    onSort={(c) => toggleSort(setDeclinedSort, declinedSort, c)}
                                    className="w-[18%]"
                                  >
                                    {t('date')}
                                  </SortableHead>
                                  <SortableHead
                                    column="client"
                                    sort={declinedSort}
                                    onSort={(c) => toggleSort(setDeclinedSort, declinedSort, c)}
                                    className="w-[18%]"
                                  >
                                    {t('client')}
                                  </SortableHead>
                                  <SortableHead
                                    column="type"
                                    sort={declinedSort}
                                    onSort={(c) => toggleSort(setDeclinedSort, declinedSort, c)}
                                    className="w-[16%]"
                                  >
                                    {t('type')}
                                  </SortableHead>
                                  <SortableHead
                                    column="venue"
                                    sort={declinedSort}
                                    onSort={(c) => toggleSort(setDeclinedSort, declinedSort, c)}
                                    className="w-[14%]"
                                  >
                                    {t('venue')}
                                  </SortableHead>
                                  <SortableHead
                                    column="fee"
                                    sort={declinedSort}
                                    onSort={(c) => toggleSort(setDeclinedSort, declinedSort, c)}
                                    className="w-[12%]"
                                  >
                                    {t('fee')}
                                  </SortableHead>
                                  <SortableHead
                                    column="status"
                                    sort={declinedSort}
                                    onSort={(c) => toggleSort(setDeclinedSort, declinedSort, c)}
                                    className="w-[10%]"
                                  >
                                    {t('status')}
                                  </SortableHead>
                                  <TableHead className="w-[12%] text-right">{t('actions')}</TableHead>
                                </TableRow>
                              </thead>
                              <tbody className="[&_tr:last-child]:border-0">
                                {declinedVirtualizer.getVirtualItems().length > 0 && (
                                  <tr>
                                    <td
                                      colSpan={7}
                                      style={{
                                        height: declinedVirtualizer.getVirtualItems()[0].start,
                                        padding: 0,
                                        border: 'none',
                                      }}
                                    />
                                  </tr>
                                )}
                                {declinedVirtualizer.getVirtualItems().map((virtualRow) => {
                                  const gig = sortedDeclined[virtualRow.index]
                                  const StatusIcon = statusConfig[gig.status as keyof typeof statusConfig]?.icon
                                  return (
                                    <TableRow
                                      key={gig.id}
                                      data-index={virtualRow.index}
                                      ref={declinedVirtualizer.measureElement}
                                      className="cursor-pointer hover:bg-muted/50"
                                      onClick={() => {
                                        setSelectedGig(selectedGig?.id === gig.id ? null : gig)
                                        setEditingNotes(false)
                                      }}
                                    >
                                      <TableCell className="font-medium">
                                        <div>
                                          {formatGigDates(gig, dateLocale)}
                                          {gig.total_days > 1 && (
                                            <span className="text-xs text-muted-foreground ml-1">
                                              ({gig.total_days} {tc('days')})
                                            </span>
                                          )}
                                          {gig.project_name && (
                                            <div
                                              className="text-sm text-muted-foreground truncate max-w-[250px]"
                                              title={gig.project_name}
                                            >
                                              {gig.project_name}
                                            </div>
                                          )}
                                          {isSharedMode && gig.user_id !== currentUserId && (
                                            <div className="text-xs text-blue-600 dark:text-blue-400">
                                              {getMemberLabel(gig.user_id)}
                                            </div>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {gig.client?.name || (
                                          <span className="text-muted-foreground italic">{t('notSpecified')}</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <div
                                            className="w-3 h-3 rounded-full"
                                            style={{ backgroundColor: gig.gig_type.color || '#9ca3af' }}
                                          />
                                          <span className="text-sm">{gig.gig_type.name}</span>
                                          <Badge variant="outline" className="text-xs">
                                            {gig.gig_type.vat_rate}%
                                          </Badge>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <span className="text-sm text-muted-foreground">{gig.venue || '-'}</span>
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        {gig.fee !== null ? (
                                          fmtFee(gig.fee, gig.currency)
                                        ) : (
                                          <span className="text-muted-foreground italic">{t('notSet')}</span>
                                        )}
                                      </TableCell>
                                      <TableCell>
                                        <Badge className={statusConfig[gig.status as keyof typeof statusConfig]?.color}>
                                          {StatusIcon && <StatusIcon className="h-3 w-3 mr-1" />}
                                          {tStatus(gig.status)}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                        <div className="flex items-center justify-end gap-1">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDuplicate(gig)}
                                            title={t('duplicateGig')}
                                          >
                                            <Copy className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setEditingGig(gig)}
                                            title={t('editGig')}
                                          >
                                            <Edit className="h-4 w-4" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => confirmDeleteGig(gig.id)}
                                            title={t('deleteGig')}
                                          >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                                {declinedVirtualizer.getVirtualItems().length > 0 && (
                                  <tr>
                                    <td
                                      colSpan={7}
                                      style={{
                                        height:
                                          declinedVirtualizer.getTotalSize() -
                                          (declinedVirtualizer.getVirtualItems().at(-1)?.end ?? 0),
                                        padding: 0,
                                        border: 'none',
                                      }}
                                    />
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                          {showScrollHint && (
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none animate-bounce">
                              <ChevronDown className="h-5 w-5 text-muted-foreground/40" />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <GigDialog
              gig={null}
              open={showCreateDialog}
              onOpenChange={(open) => {
                setShowCreateDialog(open)
                if (!open) setDuplicateValues(undefined)
              }}
              onSuccess={loadGigs}
              initialValues={duplicateValues}
              onCreated={(gigId) => {
                toast.success(tToast('gigCreated'), {
                  description: tToast('gigCreatedHint'),
                  action: {
                    label: tToast('addAttachments'),
                    onClick: () => openEditById(gigId),
                  },
                  duration: 6000,
                })
              }}
            />

            <GigDialog
              gig={editingGig}
              open={editingGig !== null}
              onOpenChange={(open) => !open && setEditingGig(null)}
              onSuccess={() => {
                loadGigs()
                // Update selectedGig if it was being edited
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
              gigTitle={selectedGig?.project_name || selectedGig?.gig_type.name}
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
                    {/* Header */}
                    <div className="px-4 pt-3 pb-2.5 border-b">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-1 h-6 rounded-full shrink-0"
                            style={{ backgroundColor: selectedGig.gig_type.color || '#6366f1' }}
                          />
                          <h2 className="text-sm font-semibold tracking-tight truncate">
                            {selectedGig.project_name || selectedGig.gig_type.name}
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
                            title={t('addReceipt')}
                          >
                            <Receipt className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full"
                            onClick={() => handleDuplicate(selectedGig)}
                            title={t('duplicateGig')}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
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
                          {selectedGig.client?.name || <span className="italic">{t('clientNotSpecified')}</span>}
                        </span>
                        <span className="text-muted-foreground/40">·</span>
                        <span
                          className={`inline-flex items-center px-1.5 py-0 rounded-full text-[10px] font-medium ${statusConfig[selectedGig.status as keyof typeof statusConfig]?.color}`}
                        >
                          {tStatus(selectedGig.status)}
                        </span>
                        <span className="text-[10px] text-muted-foreground truncate">
                          {selectedGig.gig_type.name}
                          {selectedGig.position && ` · ${selectedGig.position.name}`}
                        </span>
                        {isSharedMode && selectedGig.user_id !== currentUserId && (
                          <>
                            <span className="text-muted-foreground/40">·</span>
                            <span className="text-[10px] text-blue-600 dark:text-blue-400">
                              {getMemberLabel(selectedGig.user_id)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Scrollable content */}
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
                              {t('fee')}
                            </p>
                            <p className="text-sm font-bold text-emerald-700">
                              {selectedGig.fee !== null ? fmtFee(selectedGig.fee, selectedGig.currency) : '—'}
                            </p>
                            {selectedGig.travel_expense && (
                              <p className="text-[10px] text-emerald-600 mt-0.5">
                                + {fmtFee(selectedGig.travel_expense, selectedGig.currency)} {t('travelShort')}
                              </p>
                            )}
                          </div>
                          {selectedGig.venue ? (
                            <div className="bg-card rounded-lg p-2.5 border shadow-sm">
                              <div className="flex items-center gap-1 mb-0.5">
                                <MapPin className="h-2.5 w-2.5 text-muted-foreground" />
                                <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                                  {t('venue')}
                                </p>
                              </div>
                              <p className="text-xs font-medium">{selectedGig.venue}</p>
                            </div>
                          ) : (
                            <div className="bg-secondary/50 rounded-lg p-2.5 border">
                              <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
                                {t('venue')}
                              </p>
                              <p className="text-xs text-muted-foreground">—</p>
                            </div>
                          )}
                        </div>

                        {/* Dates */}
                        <div className="bg-secondary/30 rounded-lg p-2.5 border">
                          <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                            {t('date')} ({selectedGig.gig_dates?.length || selectedGig.total_days} {tc('days')})
                          </p>
                          {selectedGig.gig_dates && selectedGig.gig_dates.length > 0 ? (
                            <div className="space-y-1.5">
                              <div className="flex flex-wrap gap-1">
                                {selectedGig.gig_dates
                                  .sort((a, b) => a.date.localeCompare(b.date))
                                  .map((gd, i) => {
                                    const date = new Date(gd.date + 'T12:00:00')
                                    const dayName = format(date, 'EEE', { locale: dateLocale })
                                    const dayNum = format(date, 'd', { locale: dateLocale })
                                    const mon = format(date, 'MMM', { locale: dateLocale })
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
                                <div className="space-y-0.5 pt-1">
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
                            </div>
                          ) : (
                            <p className="text-xs font-semibold">{formatGigDates(selectedGig, dateLocale)}</p>
                          )}
                        </div>

                        {/* Notes */}
                        <div className="bg-card rounded-lg p-2.5 border shadow-sm">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                              {t('notes')}
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
                              {t('receipts')} ({gigExpenses.length})
                            </p>
                          </div>
                          {gigExpenses.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">{t('noReceiptsLinked')}</p>
                          ) : (
                            <ul className="space-y-1">
                              {gigExpenses.map((exp) => (
                                <li key={exp.id} className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    {exp.attachment_url && (
                                      <a
                                        href={exp.attachment_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-500 hover:text-blue-700 shrink-0"
                                      >
                                        <Receipt className="h-3 w-3" />
                                      </a>
                                    )}
                                    <span className="truncate">{exp.supplier}</span>
                                  </div>
                                  <span className="font-medium shrink-0 ml-2">
                                    {exp.amount.toLocaleString(formatLocale)}{' '}
                                    {exp.currency === 'SEK' ? tc('kr') : exp.currency}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {gigExpenses.length > 0 && (
                            <div className="mt-1.5 pt-1.5 border-t flex justify-between text-xs">
                              <span className="text-muted-foreground">{tc('total')}</span>
                              <span className="font-semibold">
                                {gigExpenses.reduce((sum, e) => sum + e.amount, 0).toLocaleString(formatLocale)}{' '}
                                {tc('kr')}
                              </span>
                            </div>
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
            {/* Detail Panel Backdrop */}
            <div
              className={`fixed inset-0 z-40 transition-all duration-300 ${
                selectedGig ? 'bg-black/50 backdrop-blur-sm opacity-100' : 'opacity-0 pointer-events-none'
              }`}
              onClick={() => setSelectedGig(null)}
            />

            {/* Detail Panel - Bottom Sheet */}
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
                    {/* Header */}
                    <div className="flex items-start justify-between py-3">
                      <div className="flex items-start gap-3">
                        <div
                          className="w-1 h-12 rounded-full mt-0.5"
                          style={{ backgroundColor: selectedGig.gig_type.color || '#6366f1' }}
                        />
                        <div className="space-y-0.5">
                          <h2 className="text-xl font-semibold tracking-tight text-gray-900">
                            {selectedGig.project_name || selectedGig.gig_type.name}
                          </h2>
                          <p className="text-sm text-gray-500">
                            {selectedGig.client?.name || <span className="italic">{t('clientNotSpecified')}</span>}
                          </p>
                          <div className="flex items-center gap-2 pt-0.5">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig[selectedGig.status as keyof typeof statusConfig]?.color}`}
                            >
                              {tStatus(selectedGig.status)}
                            </span>
                            <span className="text-xs text-gray-400">
                              {selectedGig.gig_type.name}
                              {selectedGig.position && ` · ${selectedGig.position.name}`}
                            </span>
                            {isSharedMode && selectedGig.user_id !== currentUserId && (
                              <span className="text-xs text-blue-600 dark:text-blue-400">
                                {getMemberLabel(selectedGig.user_id)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 -mt-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full hover:bg-gray-100"
                          onClick={() => setEditingGig(selectedGig)}
                        >
                          <Edit className="h-4 w-4 text-gray-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-full hover:bg-gray-100"
                          onClick={() => setSelectedGig(null)}
                        >
                          <ChevronDown className="h-5 w-5 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                    {/* Content - single column for mobile */}
                    <div className="flex-1 overflow-y-auto pb-2">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-3 border border-emerald-100">
                            <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-wider mb-0.5">
                              {t('fee')}
                            </p>
                            <p className="text-base font-bold text-emerald-700">
                              {selectedGig.fee !== null ? fmtFee(selectedGig.fee, selectedGig.currency) : '—'}
                            </p>
                            {selectedGig.travel_expense && (
                              <p className="text-xs text-emerald-600 mt-1">
                                + {fmtFee(selectedGig.travel_expense, selectedGig.currency)} {t('travelShort')}
                              </p>
                            )}
                          </div>
                          {selectedGig.venue ? (
                            <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <MapPin className="h-3 w-3 text-gray-400" />
                                <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">
                                  {t('venue')}
                                </p>
                              </div>
                              <p className="text-sm font-medium text-gray-900">{selectedGig.venue}</p>
                            </div>
                          ) : (
                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-0.5">
                                {t('venue')}
                              </p>
                              <p className="text-sm text-gray-400">—</p>
                            </div>
                          )}
                        </div>
                        <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-3 border border-gray-100">
                          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-1">
                            {t('date')} ({selectedGig.gig_dates?.length || selectedGig.total_days} {tc('days')})
                          </p>
                          {selectedGig.gig_dates && selectedGig.gig_dates.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {selectedGig.gig_dates
                                .sort((a, b) => a.date.localeCompare(b.date))
                                .map((gd, i) => {
                                  const date = new Date(gd.date + 'T12:00:00')
                                  return (
                                    <div
                                      key={i}
                                      className="flex flex-col items-center bg-white rounded-lg px-2 py-1 border border-gray-200 shadow-sm min-w-[44px]"
                                    >
                                      <span className="text-[8px] font-medium text-gray-400 uppercase">
                                        {format(date, 'EEE', { locale: dateLocale })}
                                      </span>
                                      <span className="text-sm font-bold text-gray-900">
                                        {format(date, 'd', { locale: dateLocale })}
                                      </span>
                                      <span className="text-[8px] font-medium text-gray-500">
                                        {format(date, 'MMM', { locale: dateLocale })}
                                      </span>
                                    </div>
                                  )
                                })}
                            </div>
                          ) : (
                            <p className="text-sm font-semibold text-gray-900">
                              {formatGigDates(selectedGig, dateLocale)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* Footer */}
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
                        {t('addReceipt')}
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-lg px-4 h-9 text-sm border-gray-200 hover:bg-gray-50"
                        onClick={() => handleDuplicate(selectedGig)}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" />
                        {t('duplicateGig')}
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
          {/* End mobile bottom sheet */}

          <ConfirmDialog
            open={deleteConfirmOpen}
            onOpenChange={(open) => {
              setDeleteConfirmOpen(open)
              if (!open) setGigToDelete(null)
            }}
            title={t('deleteGig')}
            description={t('deleteConfirm')}
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

          <ConfirmDialog
            open={!!confirmDeclineGig}
            onOpenChange={(open) => {
              if (!open) setConfirmDeclineGig(null)
            }}
            title={t('declineConfirmTitle')}
            description={t('declineConfirmDescription')}
            confirmLabel={t('decline')}
            variant="destructive"
            onConfirm={() => {
              if (confirmDeclineGig) updateStatus(confirmDeclineGig, 'declined')
              setConfirmDeclineGig(null)
            }}
          />

          <ConfirmDialog
            open={confirmBatchComplete}
            onOpenChange={setConfirmBatchComplete}
            title={t('batchCompleteConfirmTitle')}
            description={t('batchCompleteConfirmDescription', { count: pastAccepted.length })}
            confirmLabel={t('markAllCompleted', { count: pastAccepted.length })}
            onConfirm={() => {
              batchMarkCompleted(pastAccepted.map((g) => g.id))
              setConfirmBatchComplete(false)
            }}
          />
        </div>
      </PageTransition>
    </>
  )
}
