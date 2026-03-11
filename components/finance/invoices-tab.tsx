'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useCompany } from '@/lib/hooks/use-company'
import { useGigFilter } from '@/lib/hooks/use-gig-filter'
import useSWR from 'swr'
import { useVirtualizer } from '@tanstack/react-virtual'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Plus, FileText, Mail, Check, Trash2, ClipboardList, ChevronDown, Bell, Search, X, Eye } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { CreateInvoiceDialog } from '@/components/invoices/create-invoice-dialog'
import { SendInvoiceDialog } from '@/components/invoices/send-invoice-dialog'
import { SendReminderDialog } from '@/components/invoices/send-reminder-dialog'
import { EditInvoiceDialog } from '@/components/invoices/edit-invoice-dialog'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { format, differenceInDays } from 'date-fns'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, type SupportedCurrency } from '@/lib/currency/exchange'
import { PageTransition } from '@/components/ui/page-transition'

type Invoice = {
  id: string
  invoice_number: number
  invoice_date: string
  due_date: string
  paid_date: string | null
  subtotal: number
  vat_rate: number
  vat_amount: number
  total: number
  currency: string | null
  total_base: number | null
  status: string
  gig_id: string | null
  client_id: string
  user_id: string
  original_pdf_url: string | null
  pdf_url: string | null
  imported_from_pdf: boolean
  client: { id: string; name: string; email: string | null; invoice_language: string | null }
}

type Client = {
  id: string
  name: string
}

type GigExpense = {
  id: string
  supplier: string
  amount: number
  amount_base: number
  category: string | null
  notes: string | null
}

type PendingGig = {
  id: string
  fee: number
  travel_expense: number | null
  date: string
  start_date: string | null
  end_date: string | null
  total_days: number
  project_name: string | null
  client_id: string
  client_name: string
  gig_type_id: string
  gig_type_name: string
  gig_type_name_en: string | null
  gig_type_vat_rate: number
  client_payment_terms: number
  invoice_notes: string | null
  expenses: GigExpense[]
}

const statusConfig = {
  draft: { color: 'bg-gray-100 text-gray-800' },
  sent: { color: 'bg-blue-100 text-blue-800' },
  paid: { color: 'bg-green-100 text-green-800' },
  overdue: { color: 'bg-red-100 text-red-800' },
}

export default function InvoicesTab() {
  const t = useTranslations('invoice')
  const tGig = useTranslations('gig')
  const tc = useTranslations('common')
  const tToast = useTranslations('toast')
  const dateLocale = useDateLocale()
  const formatLocale = useFormatLocale()
  const tTeam = useTranslations('team')
  const { company, members, allMembers } = useCompany()
  const { shouldFilter, currentUserId: filterUserId, loaded: filterLoaded } = useGigFilter()
  const isSharedMode = company?.gig_visibility === 'shared' && members.length > 1
  const [currentUserId, setCurrentUserId] = useState<string>('')

  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  // Listen for create-invoice event from page-level button
  useEffect(() => {
    const handler = () => setShowCreateDialog(true)
    window.addEventListener('create-invoice', handler)
    return () => window.removeEventListener('create-invoice', handler)
  }, [])
  const [showSendDialog, setShowSendDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null)
  const [selectedGigForInvoice, setSelectedGigForInvoice] = useState<PendingGig | null>(null)
  const [selectedPendingGigIds, setSelectedPendingGigIds] = useState<Set<string>>(new Set())
  const [showReminderDialog, setShowReminderDialog] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<Invoice | null>(null)
  const [confirmPaidInvoice, setConfirmPaidInvoice] = useState<string | null>(null)
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewInvoiceNumber, setPdfPreviewInvoiceNumber] = useState<number>(0)
  const [mobileInvoiceLimit, setMobileInvoiceLimit] = useState(20)
  const supabase = createClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showScrollHint, setShowScrollHint] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [supabase.auth])

  function getMemberLabel(userId: string): string {
    if (userId === currentUserId) return tTeam('me')
    const member = allMembers.find((m) => m.user_id === userId)
    if (member?.email) return member.email.split('@')[0]
    return userId.slice(0, 6)
  }

  // SWR: Invoices + reminder counts
  const {
    data: invoiceData,
    isLoading: loading,
    mutate: mutateInvoices,
  } = useSWR(
    filterLoaded ? ['invoices-with-reminders', shouldFilter, filterUserId] : null,
    async () => {
      // Mark overdue invoices
      const today = new Date().toISOString().split('T')[0]
      let overdueQuery = supabase
        .from('invoices')
        .update({ status: 'overdue' })
        .eq('status', 'sent')
        .lt('due_date', today)
      if (shouldFilter && filterUserId) overdueQuery = overdueQuery.eq('user_id', filterUserId)
      await overdueQuery

      let invoiceQuery = supabase.from('invoices').select(
        `
          *,
          client:clients(id, name, email, invoice_language)
        `,
      )
      if (shouldFilter && filterUserId) invoiceQuery = invoiceQuery.eq('user_id', filterUserId)
      const { data, error } = await invoiceQuery.order('invoice_number', { ascending: false })

      if (error) throw error
      const invoices = (data || []) as unknown as Invoice[]

      // Load reminder counts for overdue invoices
      const overdueIds = invoices.filter((inv) => inv.status === 'overdue').map((inv) => inv.id)
      const reminderCounts: Record<string, number> = {}
      if (overdueIds.length > 0) {
        const { data: reminders } = await supabase
          .from('invoice_reminders')
          .select('invoice_id, reminder_number')
          .in('invoice_id', overdueIds)
          .order('reminder_number', { ascending: false })
        for (const r of reminders || []) {
          if (!reminderCounts[r.invoice_id]) reminderCounts[r.invoice_id] = r.reminder_number
        }
      }

      return { invoices, reminderCounts }
    },
    { revalidateOnFocus: true, dedupingInterval: 10_000 },
  )

  const allInvoices = invoiceData?.invoices ?? []
  const reminderCounts = invoiceData?.reminderCounts ?? {}

  // Filter invoices by search query
  const invoices = searchQuery.trim()
    ? allInvoices.filter((inv) => {
        const q = searchQuery.toLowerCase()
        return String(inv.invoice_number).includes(q) || inv.client.name.toLowerCase().includes(q)
      })
    : allInvoices

  // SWR: Clients
  const { data: clients = [] } = useSWR<Client[]>(
    'clients-for-invoices',
    async () => {
      const { data } = await supabase.from('clients').select('id, name').order('name')
      return (data || []) as Client[]
    },
    { revalidateOnFocus: true, dedupingInterval: 30_000 },
  )

  // SWR: Pending gigs (completed, not yet invoiced)
  const { data: pendingGigs = [], mutate: mutatePendingGigs } = useSWR<PendingGig[]>(
    'pending-gigs-for-invoicing',
    async () => {
      // Get gigs already linked to invoices via junction table
      const { data: linkedGigs } = await supabase.from('invoice_gigs').select('gig_id')
      const linkedGigIds = new Set((linkedGigs || []).map((g: { gig_id: string }) => g.gig_id))

      // Get completed gigs with fee that don't have invoices
      const { data, error } = await supabase
        .from('gigs')
        .select(
          `
          id,
          fee,
          travel_expense,
          date,
          start_date,
          end_date,
          total_days,
          project_name,
          invoice_notes,
          client_id,
          client:clients(name, payment_terms),
          gig_type:gig_types(id, name, name_en, vat_rate)
        `,
        )
        .eq('status', 'completed')
        .not('fee', 'is', null)
        .not('client_id', 'is', null)
        .order('date', { ascending: false })

      if (error) throw error

      type RawPendingGig = typeof data extends (infer U)[] ? U : never
      const filteredGigs = (data || []).filter((gig: RawPendingGig) => gig.client && !linkedGigIds.has(gig.id))
      const gigIds = filteredGigs.map((g) => g.id)

      // Fetch expenses for these gigs
      type ExpenseRow = {
        id: string
        gig_id: string
        supplier: string
        amount: number
        amount_base: number | null
        category: string | null
        notes: string | null
      }
      let expensesData: ExpenseRow[] = []
      if (gigIds.length > 0) {
        const { data: expenses } = await supabase
          .from('expenses')
          .select('id, gig_id, supplier, amount, amount_base, category, notes')
          .in('gig_id', gigIds)
        expensesData = (expenses || []) as ExpenseRow[]
      }

      // Group expenses by gig_id
      const expensesByGig = expensesData.reduce(
        (acc, expense) => {
          if (!acc[expense.gig_id]) acc[expense.gig_id] = []
          acc[expense.gig_id].push({
            id: expense.id,
            supplier: expense.supplier,
            amount: expense.amount,
            amount_base: expense.amount_base || expense.amount,
            category: expense.category,
            notes: expense.notes,
          })
          return acc
        },
        {} as Record<string, GigExpense[]>,
      )

      return filteredGigs.map((gig) => {
        const client = gig.client as unknown as { name: string; payment_terms: number | null } | null
        const gigType = gig.gig_type as unknown as {
          id: string
          name: string
          name_en: string | null
          vat_rate: number
        } | null
        return {
          id: gig.id,
          fee: gig.fee!,
          travel_expense: gig.travel_expense,
          date: gig.date,
          start_date: gig.start_date,
          end_date: gig.end_date,
          total_days: gig.total_days || 1,
          project_name: gig.project_name,
          invoice_notes: gig.invoice_notes || null,
          client_id: gig.client_id!,
          client_name: client?.name || '',
          gig_type_id: gigType?.id || '',
          gig_type_name: gigType?.name || '',
          gig_type_name_en: gigType?.name_en || null,
          gig_type_vat_rate: gigType?.vat_rate || 25,
          client_payment_terms: client?.payment_terms || 30,
          expenses: expensesByGig[gig.id] || [],
        }
      })
    },
    { revalidateOnFocus: true, dedupingInterval: 10_000 },
  )

  // SWR: Upcoming revenue
  const { data: upcomingRevenue = 0 } = useSWR(
    'upcoming-revenue',
    async () => {
      const today = new Date().toISOString().split('T')[0]
      const { data: upcoming } = await supabase.from('gigs').select('fee').gte('date', today).eq('status', 'accepted')
      return (upcoming || []).reduce((sum, g: { fee: number | null }) => sum + (g.fee || 0), 0)
    },
    { revalidateOnFocus: true, dedupingInterval: 30_000 },
  )

  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
    const noScroll = el.scrollHeight <= el.clientHeight
    setShowScrollHint(!nearBottom && !noScroll)
  }

  const virtualizer = useVirtualizer({
    count: invoices.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 57,
    overscan: 5,
  })

  function openPdfPreview(invoiceId: string, invoiceNumber: number) {
    setPdfPreviewInvoiceNumber(invoiceNumber)
    setPdfPreviewUrl(`/api/invoices/${invoiceId}/pdf`)
    setPdfPreviewOpen(true)
  }

  async function markAsPaid(id: string) {
    const { error } = await supabase
      .from('invoices')
      .update({
        status: 'paid',
        paid_date: new Date().toISOString().split('T')[0],
      })
      .eq('id', id)

    if (error) {
      console.error('Error marking as paid:', error)
      toast.error(tToast('statusUpdateError'))
    } else {
      mutateInvoices()
    }
  }

  function confirmDeleteInvoice(invoice: Invoice) {
    setInvoiceToDelete(invoice)
    setDeleteConfirmOpen(true)
  }

  async function deleteInvoice(invoice: Invoice) {
    // Get all linked gig IDs before deleting
    const { data: linkedGigs } = await supabase.from('invoice_gigs').select('gig_id').eq('invoice_id', invoice.id)
    const gigIds = (linkedGigs || []).map((g: { gig_id: string }) => g.gig_id)

    // Also check legacy gig_id
    if (invoice.gig_id && !gigIds.includes(invoice.gig_id)) {
      gigIds.push(invoice.gig_id)
    }

    await supabase.from('invoice_lines').delete().eq('invoice_id', invoice.id)

    const { error } = await supabase.from('invoices').delete().eq('id', invoice.id)

    if (error) {
      console.error('Error deleting invoice:', error)
      toast.error(tToast('deleteInvoiceError', { error: error.message }))
    } else {
      // Revert all linked gigs back to completed
      if (gigIds.length > 0) {
        await supabase.from('gigs').update({ status: 'completed' }).in('id', gigIds)
      }
      mutateInvoices()
      mutatePendingGigs()
    }
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Stats */}
        {(() => {
          const currentYear = new Date().getFullYear()
          const yearInvoices = allInvoices.filter(
            (i) => new Date(i.invoice_date).getFullYear() === currentYear && i.status !== 'draft',
          )
          const invoicedThisYear = yearInvoices.reduce((sum, i) => sum + (i.total_base || i.total), 0)
          const paidThisYear = yearInvoices
            .filter((i) => i.status === 'paid')
            .reduce((sum, i) => sum + (i.total_base || i.total), 0)
          const unpaidTotal = allInvoices
            .filter((i) => i.status === 'sent' || i.status === 'overdue')
            .reduce((sum, i) => sum + (i.total_base || i.total), 0)

          return (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('invoicedYear', { year: currentYear })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {invoicedThisYear.toLocaleString(formatLocale)} {tc('kr')}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('paidYear', { year: currentYear })}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {paidThisYear.toLocaleString(formatLocale)} {tc('kr')}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t('unpaid')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {unpaidTotal.toLocaleString(formatLocale)} {tc('kr')}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">{t('upcomingRevenue')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {upcomingRevenue.toLocaleString(formatLocale)} {tc('kr')}
                  </div>
                </CardContent>
              </Card>
            </div>
          )
        })()}

        {/* To invoice - Completed gigs without invoice */}
        {pendingGigs.length > 0 &&
          (() => {
            const selectedGigs = pendingGigs.filter((g) => selectedPendingGigIds.has(g.id))
            const allSameClient =
              selectedGigs.length > 0 && selectedGigs.every((g) => g.client_id === selectedGigs[0].client_id)

            return (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-amber-800">
                      <ClipboardList className="h-5 w-5" />
                      {t('toInvoiceCount', { count: pendingGigs.length })}
                    </CardTitle>
                    {selectedPendingGigIds.size > 1 && allSameClient && (
                      <Button
                        onClick={() => {
                          setSelectedGigForInvoice(null)
                          setShowCreateDialog(true)
                        }}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        {t('collectiveInvoiceCount', { count: selectedPendingGigIds.size })}
                      </Button>
                    )}
                    {selectedPendingGigIds.size > 1 && !allSameClient && (
                      <p className="text-sm text-amber-700">{t('sameClientRequired')}</p>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <Table className="table-fixed">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8"></TableHead>
                        <TableHead className="w-[18%]">{tGig('date')}</TableHead>
                        <TableHead className="w-[22%]">{tGig('clientShort')}</TableHead>
                        <TableHead className="w-[20%] hidden xl:table-cell">{tGig('project')}</TableHead>
                        <TableHead className="w-[15%]">{tGig('fee')}</TableHead>
                        <TableHead className="w-[10%] text-right">{tGig('action')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingGigs.map((gig) => (
                        <TableRow key={gig.id}>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedPendingGigIds.has(gig.id)}
                              onCheckedChange={(checked) => {
                                const newIds = new Set(selectedPendingGigIds)
                                if (checked) {
                                  newIds.add(gig.id)
                                } else {
                                  newIds.delete(gig.id)
                                }
                                setSelectedPendingGigIds(newIds)
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            {gig.total_days > 1 && gig.start_date && gig.end_date
                              ? `${format(new Date(gig.start_date), 'd MMM', { locale: dateLocale })} - ${format(new Date(gig.end_date), 'd MMM yyyy', { locale: dateLocale })}`
                              : format(new Date(gig.date), 'PPP', { locale: dateLocale })}
                          </TableCell>
                          <TableCell className="font-medium truncate" title={gig.client_name}>
                            {gig.client_name}
                          </TableCell>
                          <TableCell
                            className="text-muted-foreground truncate hidden xl:table-cell"
                            title={gig.project_name || undefined}
                          >
                            {gig.project_name || '-'}
                          </TableCell>
                          <TableCell className="font-medium">
                            {gig.fee.toLocaleString(formatLocale)} {tc('kr')}
                            {gig.travel_expense && gig.travel_expense > 0 && (
                              <span className="text-muted-foreground text-sm ml-1">
                                (+{gig.travel_expense.toLocaleString(formatLocale)} {tGig('travelShort')})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => {
                                setSelectedGigForInvoice(gig)
                                setSelectedPendingGigIds(new Set())
                                setShowCreateDialog(true)
                              }}
                              title={t('createInvoice')}
                            >
                              <FileText className="h-4 w-4 xl:mr-1" />
                              <span className="hidden xl:inline">{t('createInvoice')}</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
          })()}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t('allInvoices', { count: invoices.length })}
              </CardTitle>
              <div className="relative w-full max-w-xs">
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
          <CardContent>
            {loading ? (
              <TableSkeleton columns={7} rows={5} />
            ) : invoices.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('noInvoices')}</p>
                <p className="text-sm">{t('noInvoicesHint')}</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  {t('newInvoice')}
                </Button>
              </div>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="lg:hidden space-y-2">
                  {invoices.slice(0, mobileInvoiceLimit).map((invoice) => (
                    <div
                      key={invoice.id}
                      className="p-3 rounded-lg border bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setSelectedInvoice(invoice)
                        setShowEditDialog(true)
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">#{invoice.invoice_number}</span>
                            <Badge
                              className={`text-xs ${statusConfig[invoice.status as keyof typeof statusConfig]?.color}`}
                            >
                              {t(`status.${invoice.status}`)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate mt-0.5">{invoice.client.name}</p>
                          {isSharedMode && invoice.user_id !== currentUserId && (
                            <p className="text-xs text-blue-600 dark:text-blue-400">
                              {getMemberLabel(invoice.user_id)}
                            </p>
                          )}
                        </div>
                        <span className="font-semibold text-sm whitespace-nowrap">
                          {formatCurrency(invoice.total, (invoice.currency || 'SEK') as SupportedCurrency)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(invoice.due_date), 'd MMM yyyy', { locale: dateLocale })}
                          {invoice.status === 'overdue' && (
                            <span className="text-red-600 ml-1">
                              · {differenceInDays(new Date(), new Date(invoice.due_date))}d
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {invoice.status !== 'paid' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => setConfirmPaidInvoice(invoice.id)}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => openPdfPreview(invoice.id, invoice.invoice_number)}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {invoice.status === 'overdue' ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-amber-600"
                              onClick={() => {
                                setSelectedInvoice(invoice)
                                setShowReminderDialog(true)
                              }}
                              title={t('reminder.sendReminder')}
                            >
                              <Bell className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => {
                                setSelectedInvoice(invoice)
                                setShowSendDialog(true)
                              }}
                            >
                              <Mail className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {invoices.length > mobileInvoiceLimit && (
                    <Button
                      variant="ghost"
                      className="w-full mt-2 text-sm text-muted-foreground"
                      onClick={() => setMobileInvoiceLimit((prev) => prev + 20)}
                    >
                      {t('showMore', { count: invoices.length - mobileInvoiceLimit })}
                    </Button>
                  )}
                </div>

                {/* Desktop table view */}
                <div className="relative hidden lg:block">
                  <div
                    ref={scrollRef}
                    onScroll={handleScroll}
                    className="h-[calc(100vh-13rem)] overflow-auto rounded-md border"
                  >
                    <table className="w-full caption-bottom text-sm table-fixed">
                      <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background">
                        <TableRow>
                          <TableHead className="w-[8%]">{t('invoiceNumberShort')}</TableHead>
                          <TableHead className="w-[20%]">{t('customer')}</TableHead>
                          <TableHead className="w-[15%]">{tGig('date')}</TableHead>
                          <TableHead className="w-[15%]">{t('dueDate')}</TableHead>
                          <TableHead className="w-[12%]">{t('amount')}</TableHead>
                          <TableHead className="w-[10%]">{tGig('status')}</TableHead>
                          <TableHead className="w-[20%] text-right">{tGig('actions')}</TableHead>
                        </TableRow>
                      </thead>
                      <tbody className="[&_tr:last-child]:border-0">
                        {virtualizer.getVirtualItems().length > 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              style={{ height: virtualizer.getVirtualItems()[0].start, padding: 0, border: 'none' }}
                            />
                          </tr>
                        )}
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                          const invoice = invoices[virtualRow.index]
                          return (
                            <TableRow
                              key={invoice.id}
                              data-index={virtualRow.index}
                              ref={virtualizer.measureElement}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => {
                                setSelectedInvoice(invoice)
                                setShowEditDialog(true)
                              }}
                            >
                              <TableCell className="font-medium">#{invoice.invoice_number}</TableCell>
                              <TableCell>
                                <div>
                                  {invoice.client.name}
                                  {isSharedMode && invoice.user_id !== currentUserId && (
                                    <div className="text-xs text-blue-600 dark:text-blue-400">
                                      {getMemberLabel(invoice.user_id)}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {format(new Date(invoice.invoice_date), 'PPP', {
                                  locale: dateLocale,
                                })}
                              </TableCell>
                              <TableCell>{format(new Date(invoice.due_date), 'PPP', { locale: dateLocale })}</TableCell>
                              <TableCell className="font-medium">
                                {formatCurrency(invoice.total, (invoice.currency || 'SEK') as SupportedCurrency)}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col gap-0.5">
                                  <Badge className={statusConfig[invoice.status as keyof typeof statusConfig]?.color}>
                                    {t(`status.${invoice.status}`)}
                                  </Badge>
                                  {invoice.status === 'overdue' && (
                                    <span className="text-[10px] text-red-600">
                                      {differenceInDays(new Date(), new Date(invoice.due_date))}d ·{' '}
                                      {reminderCounts[invoice.id]
                                        ? reminderCounts[invoice.id] === 1
                                          ? t('reminder.oneReminderSent')
                                          : t('reminder.remindersSent', { count: reminderCounts[invoice.id] })
                                        : ''}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1">
                                  {invoice.status !== 'paid' && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => setConfirmPaidInvoice(invoice.id)}
                                      title={t('markPaid')}
                                    >
                                      <Check className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openPdfPreview(invoice.id, invoice.invoice_number)}
                                    title={t('previewPdf')}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                  {invoice.status === 'overdue' ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedInvoice(invoice)
                                        setShowReminderDialog(true)
                                      }}
                                      title={t('reminder.sendReminder')}
                                      className="text-amber-600 hover:text-amber-700"
                                    >
                                      <Bell className="h-4 w-4" />
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedInvoice(invoice)
                                        setShowSendDialog(true)
                                      }}
                                      title={t('sendViaEmail')}
                                    >
                                      <Mail className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => confirmDeleteInvoice(invoice)}
                                    title={t('deleteInvoice')}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        {virtualizer.getVirtualItems().length > 0 && (
                          <tr>
                            <td
                              colSpan={7}
                              style={{
                                height: virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
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
              </>
            )}
          </CardContent>
        </Card>

        <CreateInvoiceDialog
          open={showCreateDialog}
          onOpenChange={(open) => {
            setShowCreateDialog(open)
            if (!open) {
              setSelectedGigForInvoice(null)
              setSelectedPendingGigIds(new Set())
            }
          }}
          onSuccess={() => {
            mutateInvoices()
            mutatePendingGigs()
            setSelectedPendingGigIds(new Set())
          }}
          initialGig={selectedGigForInvoice || undefined}
          initialGigs={
            selectedPendingGigIds.size > 1 ? pendingGigs.filter((g) => selectedPendingGigIds.has(g.id)) : undefined
          }
        />

        <SendInvoiceDialog
          invoice={selectedInvoice}
          open={showSendDialog}
          onOpenChange={(open) => {
            setShowSendDialog(open)
            if (!open) setSelectedInvoice(null)
          }}
          onSuccess={() => mutateInvoices()}
        />

        <EditInvoiceDialog
          invoice={selectedInvoice}
          open={showEditDialog}
          onOpenChange={(open) => {
            setShowEditDialog(open)
            if (!open) setSelectedInvoice(null)
          }}
          onSuccess={() => mutateInvoices()}
          clients={clients}
        />

        <SendReminderDialog
          invoice={selectedInvoice}
          open={showReminderDialog}
          onOpenChange={(open) => {
            setShowReminderDialog(open)
            if (!open) setSelectedInvoice(null)
          }}
          onSuccess={() => mutateInvoices()}
          reminderCount={selectedInvoice ? reminderCounts[selectedInvoice.id] || 0 : 0}
        />

        <ConfirmDialog
          open={deleteConfirmOpen}
          onOpenChange={(open) => {
            setDeleteConfirmOpen(open)
            if (!open) setInvoiceToDelete(null)
          }}
          title={t('deleteInvoice')}
          description={t('deleteInvoiceConfirm', { number: invoiceToDelete?.invoice_number ?? '' })}
          confirmLabel={tc('delete')}
          variant="destructive"
          onConfirm={() => {
            if (invoiceToDelete) {
              deleteInvoice(invoiceToDelete)
            }
            setDeleteConfirmOpen(false)
            setInvoiceToDelete(null)
          }}
        />

        <ConfirmDialog
          open={!!confirmPaidInvoice}
          onOpenChange={(open) => {
            if (!open) setConfirmPaidInvoice(null)
          }}
          title={t('markPaidConfirmTitle')}
          description={t('markPaidConfirmDescription')}
          confirmLabel={t('markPaid')}
          onConfirm={() => {
            if (confirmPaidInvoice) markAsPaid(confirmPaidInvoice)
            setConfirmPaidInvoice(null)
          }}
        />
        <Dialog
          open={pdfPreviewOpen}
          onOpenChange={(open) => {
            setPdfPreviewOpen(open)
            if (!open) setPdfPreviewUrl(null)
          }}
        >
          <DialogContent className="sm:max-w-[700px] p-0">
            <DialogTitle className="sr-only">
              {t('invoice')} #{pdfPreviewInvoiceNumber}
            </DialogTitle>
            <div className="relative">
              <div className="absolute top-2 right-2 z-10">
                <button
                  onClick={() => setPdfPreviewOpen(false)}
                  className="p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {pdfPreviewUrl ? (
                <iframe
                  src={pdfPreviewUrl}
                  className="w-full h-[80vh] rounded-lg"
                  title={`${t('invoice')} #${pdfPreviewInvoiceNumber}`}
                />
              ) : (
                <div className="flex items-center justify-center h-96 text-gray-500">{t('errorLoadingPdf')}</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  )
}
