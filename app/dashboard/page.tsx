'use client'

import { useEffect, useLayoutEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Plus, Receipt, CalendarDays, Music } from 'lucide-react'
import Link from 'next/link'
import { GigDialog } from '@/components/gigs/gig-dialog'
import { UploadReceiptDialog } from '@/components/expenses/upload-receipt-dialog'
import { format, isToday as isTodayFn } from 'date-fns'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { motion, type Variants } from 'framer-motion'
import { UpcomingPayments } from '@/components/dashboard/upcoming-payments'
import { WeekView } from '@/components/dashboard/week-view'
import { ActionRequiredCard, type NeedsActionGig, type PendingGig } from '@/components/dashboard/action-required-card'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { ListSkeleton } from '@/components/skeletons/list-skeleton'
import { PageTransition } from '@/components/ui/page-transition'
import { SponsorBanner } from '@/components/sponsor-banner'
import { UsageSummary } from '@/components/dashboard/usage-summary'
import { useGigFilter } from '@/lib/hooks/use-gig-filter'
import { useCompany } from '@/lib/hooks/use-company'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.05 },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
  },
}

type UpcomingGig = {
  id: string
  date: string
  project_name: string | null
  fee: number | null
  fee_base: number | null
  client: { name: string } | null
  gig_type: { name: string } | null
}

function getDeadlineInfo(
  deadline: string | null,
  dateLocale: import('date-fns').Locale,
): { label: string; urgent: boolean; isKey: boolean } | null {
  if (!deadline) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadlineDate = new Date(deadline)
  deadlineDate.setHours(0, 0, 0, 0)

  const diffDays = Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays < 0) {
    return { label: 'overdue', urgent: true, isKey: true }
  } else if (diffDays === 0) {
    return { label: 'today', urgent: true, isKey: true }
  } else if (diffDays <= 2) {
    return { label: `${diffDays}d`, urgent: true, isKey: false }
  } else {
    return { label: format(deadlineDate, 'd/M', { locale: dateLocale }), urgent: false, isKey: false }
  }
}

function getGreeting(t: ReturnType<typeof useTranslations<'dashboard'>>): string {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return t('goodMorning')
  if (hour >= 12 && hour < 18) return t('goodAfternoon')
  return t('goodEvening')
}

export default function DashboardPage() {
  const t = useTranslations('dashboard')
  const tc = useTranslations('common')
  const tGig = useTranslations('gig')
  const dateLocale = useDateLocale()
  const formatLocale = useFormatLocale()
  const { fullName, loading: companyLoading } = useCompany()
  const { symbol: baseCurrencySymbol } = useBaseCurrency()

  const [upcomingGigs, setUpcomingGigs] = useState<UpcomingGig[]>([])
  const [upcomingRevenue, setUpcomingRevenue] = useState(0)
  const [upcomingDays, setUpcomingDays] = useState(0)
  const [pendingGigs, setPendingGigs] = useState<PendingGig[]>([])
  const [needsActionGigs, setNeedsActionGigs] = useState<NeedsActionGig[]>([])
  const [loading, setLoading] = useState(true)
  const [showGigDialog, setShowGigDialog] = useState(false)
  const [showReceiptDialog, setShowReceiptDialog] = useState(false)
  const [gridHeight, setGridHeight] = useState<number | undefined>(undefined)
  const [isDesktop, setIsDesktop] = useState(false)
  const supabase = createClient()
  const { shouldFilter, currentUserId } = useGigFilter()

  const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect
  useIsomorphicLayoutEffect(() => {
    function updateHeight() {
      if (window.innerWidth < 768) {
        setGridHeight(undefined)
        setIsDesktop(false)
        return
      }
      const desktop = window.innerWidth >= 1280
      setIsDesktop(desktop)
      const header = 56
      const padding = 44
      setGridHeight(window.innerHeight - header - padding)
    }
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  useEffect(() => {
    loadDashboardData()
    // Refresh data when app returns from background
    function onVisibility() {
      if (!document.hidden) loadDashboardData()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldFilter, currentUserId])

  function userFilter<T extends { eq: (col: string, val: string) => T }>(query: T): T {
    return shouldFilter && currentUserId ? query.eq('user_id', currentUserId) : query
  }

  async function loadDashboardData() {
    setLoading(true)

    const today = new Date().toISOString().split('T')[0]

    const [upcomingRes, pendingRes, needsActionRes] = await Promise.all([
      userFilter(
        supabase
          .from('gigs')
          .select('id, date, fee, fee_base, project_name, client:clients(name), gig_type:gig_types(name)')
          .gte('date', today)
          .eq('status', 'accepted'),
      ).order('date', { ascending: true }),
      userFilter(
        supabase
          .from('gigs')
          .select('id, date, fee, status, response_deadline, client:clients(name)')
          .in('status', ['pending', 'tentative']),
      )
        .order('response_deadline', { ascending: true, nullsFirst: false })
        .limit(5),
      userFilter(
        supabase
          .from('gigs')
          .select(
            'id, date, fee, status, currency, total_days, start_date, end_date, project_name, client:clients(name), gig_type:gig_types(name, color)',
          )
          .in('status', ['accepted', 'pending', 'tentative']),
      ).order('date', { ascending: false }),
    ])

    const upcomingList = (upcomingRes.data || []) as unknown as UpcomingGig[]
    setUpcomingGigs(upcomingList)
    setUpcomingRevenue(upcomingList.reduce((sum, g) => sum + (g.fee_base ?? g.fee ?? 0), 0))

    setPendingGigs((pendingRes.data || []) as unknown as PendingGig[])

    const pastNeedingAction = ((needsActionRes.data || []) as unknown as NeedsActionGig[]).filter(
      (g) => (g.end_date || g.date) < today,
    )
    setNeedsActionGigs(pastNeedingAction)

    if (upcomingList.length > 0) {
      const gigDatesRes = await supabase
        .from('gig_dates')
        .select('date')
        .in(
          'gig_id',
          upcomingList.map((g) => g.id),
        )
        .gte('date', today)
      setUpcomingDays(new Set(gigDatesRes.data?.map((d) => d.date) || []).size)
    }

    setLoading(false)
  }

  async function updateGigStatus(gigId: string, status: string) {
    await supabase
      .from('gigs')
      .update({
        status: status as
          | 'tentative'
          | 'pending'
          | 'accepted'
          | 'declined'
          | 'completed'
          | 'invoiced'
          | 'paid'
          | 'draft',
      })
      .eq('id', gigId)
    loadDashboardData()
  }

  const isEmpty = !loading && upcomingGigs.length === 0 && pendingGigs.length === 0 && needsActionGigs.length === 0
  const actionCount = pendingGigs.length + needsActionGigs.length

  // Greeting
  const greeting = getGreeting(t)
  const firstName = fullName?.split(' ')[0] || null
  const allReady = !loading && !companyLoading
  const nextGig = upcomingGigs[0] || null
  const nextGigIsToday = nextGig ? isTodayFn(new Date(nextGig.date)) : false

  function getNextGigText(): string | null {
    if (loading || !nextGig) return loading ? null : t('noUpcomingRelaxed')
    const gigLabel = nextGig.project_name || nextGig.client?.name || nextGig.gig_type?.name || ''
    if (nextGigIsToday) return t('nextGigToday', { name: gigLabel })
    const dateStr = format(new Date(nextGig.date), 'd MMM', { locale: dateLocale })
    return t('nextGig', { name: gigLabel, date: dateStr })
  }

  const greetingName = firstName ? `${greeting}, ${firstName}` : greeting
  const nextGigText = getNextGigText()

  return (
    <PageTransition>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate={allReady ? 'visible' : 'hidden'}
        className="space-y-3"
        style={
          gridHeight
            ? {
                display: 'grid',
                gridTemplateRows: 'auto auto auto',
                gap: '12px',
                maxHeight: gridHeight,
                overflow: 'hidden',
              }
            : undefined
        }
      >
        {/* ── Top section: Mobile actions + Greeting ── */}
        <div>
          {/* Mobile Quick Actions */}
          <div className="lg:hidden mb-3">
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => setShowGigDialog(true)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card border hover:bg-accent transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                  <Plus className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-medium">{t('newGig')}</span>
              </button>
              <button
                onClick={() => setShowReceiptDialog(true)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card border hover:bg-accent transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <Receipt className="h-4 w-4 text-emerald-500" />
                </div>
                <span className="text-xs font-medium">{t('uploadReceipt')}</span>
              </button>
              <Link
                href="/calendar"
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-card border hover:bg-accent transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <CalendarDays className="h-4 w-4 text-blue-500" />
                </div>
                <span className="text-xs font-medium">{t('viewCalendar')}</span>
              </Link>
            </div>
          </div>

          {/* Greeting */}
          <motion.div variants={itemVariants}>
            {isEmpty ? (
              <div className="py-4">
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
                  {t('welcome', { name: firstName || '' })}
                </h1>
                <p className="text-muted-foreground mt-1 text-sm">{t('welcomeHint')}</p>
                <div className="hidden lg:grid grid-cols-3 gap-3 mt-5">
                  <button
                    onClick={() => setShowGigDialog(true)}
                    className="group flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-primary/30 hover:border-primary hover:bg-primary/5 transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                      <Plus className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-center">
                      <span className="text-sm font-medium block">{t('newGig')}</span>
                      <span className="text-xs text-muted-foreground">{t('startHere')}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setShowReceiptDialog(true)}
                    className="group flex flex-col items-center gap-2 p-4 rounded-xl border hover:bg-accent transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <Receipt className="h-5 w-5 text-emerald-500" />
                    </div>
                    <span className="text-sm font-medium">{t('uploadReceipt')}</span>
                  </button>
                  <Link
                    href="/calendar"
                    className="group flex flex-col items-center gap-2 p-4 rounded-xl border hover:bg-accent transition-all duration-200 hover:-translate-y-0.5"
                  >
                    <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <CalendarDays className="h-5 w-5 text-blue-500" />
                    </div>
                    <span className="text-sm font-medium">{t('viewCalendar')}</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="py-4 md:py-5 px-1">
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">{greetingName}</h1>
                {nextGigText && (
                  <p className="text-muted-foreground mt-1.5 text-[13px] leading-relaxed">{nextGigText}</p>
                )}
              </div>
            )}
          </motion.div>
        </div>

        {/* ── Usage Summary (free users only) ── */}
        <motion.div variants={itemVariants}>
          <UsageSummary />
        </motion.div>

        {/* ── Main Grid: Gigs | Invoices | Week View ── */}
        <motion.div
          variants={itemVariants}
          className="grid gap-3"
          style={{
            gridTemplateColumns: gridHeight ? (isDesktop ? '1fr 1fr 1fr' : '1fr 1fr') : undefined,
          }}
        >
          {/* Column 1: Upcoming Gigs — overflow-hidden makes grid min-height:0 so calendar determines row height */}
          <Card className="overflow-hidden flex flex-col">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  {t('upcoming')}
                </CardTitle>
                <span className="text-sm font-semibold tabular-nums">
                  {loading ? '—' : upcomingRevenue.toLocaleString(formatLocale)} {baseCurrencySymbol}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {upcomingGigs.length} {t('gigs')} · {upcomingDays} {tc('days')}
              </p>
            </CardHeader>
            <CardContent className="pb-4 flex-1 flex flex-col" style={{ minHeight: 0 }}>
              {loading ? (
                <ListSkeleton items={4} />
              ) : upcomingGigs.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Music className="h-6 w-6 mx-auto mb-1 opacity-50" />
                  <p className="text-xs">{tGig('noUpcoming')}</p>
                </div>
              ) : (
                <div className="flex-1 relative" style={{ minHeight: 0 }}>
                  <div className="absolute inset-0 space-y-0.5 overflow-y-auto pr-1">
                    {upcomingGigs.map((gig) => (
                      <Link
                        key={gig.id}
                        href="/gigs"
                        className="group flex items-center gap-3 py-2 px-3 rounded-lg text-xs hover:bg-secondary/80 transition-all duration-150"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                        <span className="font-mono text-muted-foreground shrink-0 w-14">
                          {format(new Date(gig.date), 'd MMM', { locale: dateLocale })}
                        </span>
                        <span className="font-medium truncate flex-1">
                          {gig.project_name || gig.client?.name || gig.gig_type?.name || '—'}
                        </span>
                        {gig.fee && (
                          <span className="text-muted-foreground shrink-0 tabular-nums">
                            {gig.fee.toLocaleString(formatLocale)} {baseCurrencySymbol}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Column 2: Unpaid Invoices — overflow-hidden makes grid min-height:0 */}
          <div className="overflow-hidden">
            <ErrorBoundary>
              <UpcomingPayments className="h-full flex flex-col min-h-0" />
            </ErrorBoundary>
          </div>

          {/* Column 3: Week View — NO overflow-hidden so it determines the grid row height */}
          <div className="md:col-span-2 xl:col-span-1">
            <Card>
              <CardContent className="p-4">
                <ErrorBoundary>
                  <WeekView />
                </ErrorBoundary>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        {/* ── Action Required (full width, detailed, below grid) ── */}
        <motion.div variants={itemVariants}>
          {actionCount > 0 && (
            <ActionRequiredCard
              pendingGigs={pendingGigs}
              needsActionGigs={needsActionGigs}
              dateLocale={dateLocale}
              formatLocale={formatLocale}
              onStatusChange={updateGigStatus}
              getDeadlineInfo={(deadline) => getDeadlineInfo(deadline, dateLocale)}
            />
          )}
        </motion.div>
      </motion.div>

      <SponsorBanner />

      {/* Quick Action Dialogs — outside grid container */}
      <GigDialog gig={null} open={showGigDialog} onOpenChange={setShowGigDialog} onSuccess={loadDashboardData} />
      <UploadReceiptDialog open={showReceiptDialog} onOpenChange={setShowReceiptDialog} onSuccess={() => {}} />
    </PageTransition>
  )
}
