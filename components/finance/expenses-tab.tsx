'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useCompany } from '@/lib/hooks/use-company'
import { useGigFilter } from '@/lib/hooks/use-gig-filter'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { categoryLabel } from '@/lib/expenses/categories'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'
import { parseLocalDate } from '@/lib/dates'
import { formatCurrency, type SupportedCurrency } from '@/lib/currency/exchange'
import { readJsonSafe } from '@/lib/http'
import { claimAction } from '@/lib/pending-action'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatCard } from '@/components/ui/stat-card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  Receipt,
  BarChart3,
  Upload,
  Image as ImageIcon,
  Download,
  Loader2,
  X,
  Search,
  Trash2,
  FileArchive,
  FileText,
  Files,
  CheckCircle2,
  Merge,
  SlidersHorizontal,
} from 'lucide-react'
import NextImage from 'next/image'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { UploadReceiptDialog } from '@/components/expenses/upload-receipt-dialog'
import { EditExpenseDialog } from '@/components/expenses/edit-expense-dialog'
import { ExportDialog } from '@/components/expenses/export-dialog'
import { MergeSuppliersDialog } from '@/components/expenses/merge-suppliers-dialog'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { format } from 'date-fns'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { toast } from 'sonner'
import { downloadFile } from '@/lib/download'
import { PageTransition } from '@/components/ui/page-transition'
import { ScrollIndicator } from '@/components/ui/scroll-indicator'

type Expense = {
  id: string
  date: string
  supplier: string
  amount: number
  currency: string | null
  amount_base: number | null
  category: string | null
  notes: string | null
  user_id: string
  attachment_url: string | null
  is_private: boolean | null
  sent_to_accountant_at: string | null
  gig_id: string | null
  gig: {
    id: string
    project_name: string | null
    date: string
    client: { name: string } | null
  } | null
}

type Gig = {
  id: string
  date: string
  project_name: string | null
  venue: string | null
  status: string
  client: { name: string } | null
}

export default function ExpensesTab() {
  const t = useTranslations('expense')
  const tc = useTranslations('common')
  const tt = useTranslations('toast')
  const dateLocale = useDateLocale()
  const formatLocale = useFormatLocale()
  const tTeam = useTranslations('team')
  const { company, members, allMembers } = useCompany()
  const { code: baseCurrencyCode, symbol: baseCurrencySymbol } = useBaseCurrency()
  const { shouldFilter, currentUserId: filterUserId, loaded: filterLoaded } = useGigFilter()
  const isSharedMode = company?.gig_visibility === 'shared' && members.length > 1
  const [currentUserId, setCurrentUserId] = useState<string>('')

  const [searchQuery, setSearchQuery] = useState('')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')
  const [gigFilter, setGigFilter] = useState<string>('all')
  const [privacyFilter, setPrivacyFilter] = useState<string>('all')
  const [accountantFilter, setAccountantFilter] = useState<string>('all')
  const [memberFilter, setMemberFilter] = useState<string>('all')
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [showMergeDialog, setShowMergeDialog] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [mobileExpenseLimit, setMobileExpenseLimit] = useState(20)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewIsPdf, setPreviewIsPdf] = useState(false)
  const tableScrollRef = useRef<HTMLDivElement>(null)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkExporting, setBulkExporting] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [supabase.auth])

  // When the global "Mine" toggle turns on, the member filter becomes meaningless
  // (server-side query already restricts to the current user). Reset it so a stale
  // value doesn't silently filter out everything when "Mine" is turned off again.
  useEffect(() => {
    if (shouldFilter && memberFilter !== 'all') setMemberFilter('all')
  }, [shouldFilter, memberFilter])

  function getMemberLabel(userId: string): string {
    if (userId === currentUserId) return tTeam('me')
    const member = allMembers.find((m) => m.user_id === userId)
    if (member?.full_name) return member.full_name.split(' ')[0]
    if (member?.email) return member.email.split('@')[0]
    return userId.slice(0, 6)
  }

  const {
    data: expenses = [],
    isLoading: loading,
    mutate: mutateExpenses,
  } = useSWR<Expense[]>(
    filterLoaded ? ['expenses-with-gigs', shouldFilter, filterUserId] : null,
    async () => {
      let query = supabase.from('expenses').select('*, gig:gigs(id, project_name, date, client:clients(name))')
      if (shouldFilter && filterUserId) query = query.eq('user_id', filterUserId)
      const { data, error } = await query.order('date', { ascending: false })
      if (error) throw error
      return (data || []) as unknown as Expense[]
    },
    { revalidateOnFocus: true, dedupingInterval: 10_000 },
  )

  const { data: gigs = [] } = useSWR<Gig[]>(
    filterLoaded ? ['gigs-for-expenses', shouldFilter, filterUserId] : null,
    async () => {
      let query = supabase
        .from('gigs')
        .select('id, date, project_name, venue, status, client:clients(name)')
        .in('status', ['pending', 'accepted', 'completed', 'invoiced', 'paid'])
      if (shouldFilter && filterUserId) query = query.eq('user_id', filterUserId)
      const { data } = await query.order('date', { ascending: false })
      return (data || []) as unknown as Gig[]
    },
    { revalidateOnFocus: true, dedupingInterval: 30_000 },
  )

  async function openPreview(expenseId: string, attachmentUrl?: string) {
    setPreviewIsPdf(!!attachmentUrl && attachmentUrl.toLowerCase().includes('.pdf'))
    setPreviewOpen(true)
    setPreviewLoading(true)
    setPreviewUrl(null)

    try {
      const response = await fetch(`/api/expenses/${expenseId}/attachment`)
      if (response.ok) {
        const data = await readJsonSafe<{ url: string }>(response)
        setPreviewUrl(data?.url ?? null)
      } else {
        toast.error(tt('couldNotLoadReceiptImage'))
        setPreviewOpen(false)
      }
    } catch (error) {
      console.error('Preview error:', error)
      toast.error(tt('genericError'))
      setPreviewOpen(false)
    } finally {
      setPreviewLoading(false)
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function handleBulkExport(format: 'zip' | 'pdf' | 'individual') {
    if (selectedIds.size === 0) return
    setBulkExporting(format)
    try {
      const ids = Array.from(selectedIds).join(',')
      const params = new URLSearchParams({ ids, format, locale: formatLocale })
      const response = await fetch(`/api/expenses/export?${params}`)

      if (format === 'individual') {
        const result = await readJsonSafe<{ error?: string; expenses: { attachment_url: string | null }[] }>(response)
        if (!response.ok || !result) throw new Error(result?.error || t('exportFailed'))
        const withReceipts = result.expenses.filter((e: { attachment_url: string | null }) => e.attachment_url)
        if (withReceipts.length === 0) {
          toast.error(t('noReceiptsForMonth'))
          return
        }
        for (const expense of withReceipts) {
          if (expense.attachment_url) window.open(expense.attachment_url, '_blank')
        }
        toast.success(t('openedReceipts', { count: withReceipts.length }))
        return
      }

      if (!response.ok) {
        const err = await readJsonSafe<{ error?: string }>(response)
        throw new Error(err?.error || t('exportFailed'))
      }

      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const today = new Date().toISOString().split('T')[0]
      a.download = `${today}-Kvitton-${selectedIds.size}st.${format}`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success(t('downloadedFile', { format: format.toUpperCase() }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('exportFailed'))
    } finally {
      setBulkExporting(null)
    }
  }

  async function markSelectedSentToAccountant(sent: boolean) {
    if (selectedIds.size === 0) return
    const { error } = await supabase
      .from('expenses')
      .update({ sent_to_accountant_at: sent ? new Date().toISOString() : null })
      .in('id', Array.from(selectedIds))
    if (error) {
      toast.error(tt('genericError'))
    } else {
      toast.success(sent ? tt('markedSentToAccountant') : tt('unmarkedSentToAccountant'))
      clearSelection()
      mutateExpenses()
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    setBulkDeleting(true)
    try {
      const response = await fetch('/api/expenses/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      })
      const result = await readJsonSafe<{ error?: string; deleted: number }>(response)
      if (!response.ok || !result) throw new Error(result?.error || tt('genericError'))
      toast.success(t('bulkDeleted', { count: result.deleted }))
      clearSelection()
      mutateExpenses()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tt('genericError'))
    } finally {
      setBulkDeleting(false)
      setBulkDeleteOpen(false)
    }
  }

  const years = useMemo(
    () => [...new Set(expenses.map((e) => parseLocalDate(e.date).getFullYear()))].sort((a, b) => b - a),
    [expenses],
  )
  const categories = useMemo(
    () =>
      ([...new Set(expenses.map((e) => e.category).filter(Boolean))] as string[]).sort((a, b) =>
        categoryLabel(a, t).localeCompare(categoryLabel(b, t)),
      ),
    [expenses, t],
  )
  const suppliers = useMemo(() => [...new Set(expenses.map((e) => e.supplier))].sort(), [expenses])
  const supplierCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const e of expenses) {
      if (e.supplier) counts.set(e.supplier, (counts.get(e.supplier) || 0) + 1)
    }
    return [...counts.entries()].map(([supplier, count]) => ({ supplier, count }))
  }, [expenses])

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        if (yearFilter !== 'all' && parseLocalDate(e.date).getFullYear().toString() !== yearFilter) return false
        if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
        if (supplierFilter !== 'all' && e.supplier !== supplierFilter) return false
        if (gigFilter === 'linked' && !e.gig_id) return false
        if (gigFilter === 'unlinked' && e.gig_id) return false
        if (privacyFilter === 'private' && !e.is_private) return false
        if (privacyFilter === 'business' && e.is_private) return false
        if (accountantFilter === 'sent' && !e.sent_to_accountant_at) return false
        if (accountantFilter === 'not_sent' && e.sent_to_accountant_at) return false
        if (memberFilter !== 'all' && e.user_id !== memberFilter) return false
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          const matchesSupplier = e.supplier.toLowerCase().includes(q)
          // Search against both the canonical key and the localized label
          const matchesCategory =
            e.category?.toLowerCase().includes(q) || categoryLabel(e.category, t).toLowerCase().includes(q)
          const matchesNotes = e.notes?.toLowerCase().includes(q)
          if (!matchesSupplier && !matchesCategory && !matchesNotes) return false
        }
        return true
      }),
    [
      expenses,
      yearFilter,
      categoryFilter,
      supplierFilter,
      gigFilter,
      privacyFilter,
      accountantFilter,
      memberFilter,
      searchQuery,
      t,
    ],
  )

  const totalExpenses = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + (e.amount_base || e.amount), 0),
    [filteredExpenses],
  )

  // Selection scoped to currently visible (filtered) rows
  const filteredIds = useMemo(() => filteredExpenses.map((e) => e.id), [filteredExpenses])
  const visibleSelectedCount = filteredIds.reduce((n, id) => (selectedIds.has(id) ? n + 1 : n), 0)
  const allVisibleSelected = filteredIds.length > 0 && visibleSelectedCount === filteredIds.length
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected

  function toggleSelectAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        filteredIds.forEach((id) => next.delete(id))
      } else {
        filteredIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  const yearlyData = useMemo(
    () =>
      years
        .map((year) => {
          const yearExpenses = expenses.filter((e) => parseLocalDate(e.date).getFullYear() === year)
          const total = yearExpenses.reduce((sum, e) => sum + (e.amount_base || e.amount), 0)
          return {
            year: year.toString(),
            total: Math.round(total),
            count: yearExpenses.length,
          }
        })
        .sort((a, b) => parseInt(a.year) - parseInt(b.year)),
    [years, expenses],
  )

  useEffect(() => {
    function handleUpload() {
      claimAction('upload-receipt')
      setShowUploadDialog(true)
    }
    function handleExport() {
      setShowExportDialog(true)
    }
    // Claim any upload intent buffered before this lazily-imported tab mounted.
    if (claimAction('upload-receipt')) setShowUploadDialog(true)
    window.addEventListener('upload-receipt', handleUpload)
    window.addEventListener('export-expenses', handleExport)
    return () => {
      window.removeEventListener('upload-receipt', handleUpload)
      window.removeEventListener('export-expenses', handleExport)
    }
  }, [])

  // Filter <Select> controls, shared between the desktop row and the mobile
  // filter sheet (rendered in a flex-col container that forces full width).
  const filterSelects = (
    <>
      <div>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t('allYears')} />
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
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t('allCategories')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allCategories')}</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {categoryLabel(cat, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Select value={supplierFilter} onValueChange={setSupplierFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t('allSuppliers')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allSuppliers')}</SelectItem>
            {suppliers.map((sup) => (
              <SelectItem key={sup} value={sup}>
                {sup}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Select value={gigFilter} onValueChange={setGigFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t('allGigs')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allGigs')}</SelectItem>
            <SelectItem value="linked">{t('withGig')}</SelectItem>
            <SelectItem value="unlinked">{t('withoutGig')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Select value={privacyFilter} onValueChange={setPrivacyFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t('allTypes')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allTypes')}</SelectItem>
            <SelectItem value="private">{t('onlyPrivate')}</SelectItem>
            <SelectItem value="business">{t('onlyBusiness')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Select value={accountantFilter} onValueChange={setAccountantFilter}>
          <SelectTrigger>
            <SelectValue placeholder={t('allAccountant')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allAccountant')}</SelectItem>
            <SelectItem value="sent">{t('onlySentToAccountant')}</SelectItem>
            <SelectItem value="not_sent">{t('onlyNotSentToAccountant')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {isSharedMode && !shouldFilter && (
        <div>
          <Select value={memberFilter} onValueChange={setMemberFilter}>
            <SelectTrigger>
              <SelectValue placeholder={tTeam('allMembers')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{tTeam('allMembers')}</SelectItem>
              {allMembers.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.user_id === currentUserId
                    ? tTeam('me')
                    : m.full_name?.split(' ')[0] || m.email?.split('@')[0] || m.user_id.slice(0, 6)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  )

  // Active (non-"all") filters, for the mobile count badge + removable chips.
  const activeFilters: { key: string; label: string; onClear: () => void }[] = []
  if (yearFilter !== 'all') activeFilters.push({ key: 'year', label: yearFilter, onClear: () => setYearFilter('all') })
  if (categoryFilter !== 'all')
    activeFilters.push({ key: 'cat', label: categoryLabel(categoryFilter, t), onClear: () => setCategoryFilter('all') })
  if (supplierFilter !== 'all')
    activeFilters.push({ key: 'sup', label: supplierFilter, onClear: () => setSupplierFilter('all') })
  if (gigFilter !== 'all')
    activeFilters.push({
      key: 'gig',
      label: gigFilter === 'linked' ? t('withGig') : t('withoutGig'),
      onClear: () => setGigFilter('all'),
    })
  if (privacyFilter !== 'all')
    activeFilters.push({
      key: 'priv',
      label: privacyFilter === 'private' ? t('onlyPrivate') : t('onlyBusiness'),
      onClear: () => setPrivacyFilter('all'),
    })
  if (accountantFilter !== 'all')
    activeFilters.push({
      key: 'acc',
      label: accountantFilter === 'sent' ? t('onlySentToAccountant') : t('onlyNotSentToAccountant'),
      onClear: () => setAccountantFilter('all'),
    })
  if (memberFilter !== 'all')
    activeFilters.push({ key: 'mem', label: getMemberLabel(memberFilter), onClear: () => setMemberFilter('all') })

  return (
    <PageTransition className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
      <div className="lg:flex lg:flex-col lg:h-full lg:min-h-0 space-y-6">
        {/* Filter — desktop row */}
        <div className="hidden lg:flex flex-wrap gap-2 lg:shrink-0">
          {filterSelects}
          {supplierCounts.length > 1 && (
            <Button variant="outline" onClick={() => setShowMergeDialog(true)} className="ml-auto">
              <Merge className="h-4 w-4 mr-1" />
              {t('mergeSuppliers')}
            </Button>
          )}
        </div>

        {/* Filter — mobile: button + removable chips */}
        <div className="lg:hidden space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="shrink-0" onClick={() => setShowFilterSheet(true)}>
              <SlidersHorizontal className="h-4 w-4 mr-1.5" />
              {tc('filter')}
              {activeFilters.length > 0 && (
                <Badge className="ml-1.5 h-5 min-w-5 justify-center px-1 bg-primary text-primary-foreground">
                  {activeFilters.length}
                </Badge>
              )}
            </Button>
            {activeFilters.length > 0 && (
              <div className="flex-1 flex gap-1.5 overflow-x-auto scrollbar-hide">
                {activeFilters.map((f) => (
                  <button
                    key={f.key}
                    onClick={f.onClear}
                    className="shrink-0 inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs"
                  >
                    {f.label}
                    <X className="h-3 w-3" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:shrink-0">
          <StatCard
            label={
              yearFilter !== 'all' ||
              categoryFilter !== 'all' ||
              supplierFilter !== 'all' ||
              gigFilter !== 'all' ||
              memberFilter !== 'all'
                ? `${t('filteredExpenses')} ${yearFilter !== 'all' ? yearFilter : ''} (${filteredExpenses.length} / ${expenses.length})`
                : shouldFilter
                  ? t('myTotalExpenses')
                  : t('totalExpenses')
            }
            value={`${totalExpenses.toLocaleString(formatLocale)} ${baseCurrencySymbol}`}
          />

          {yearlyData.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  {t('expensesPerYear')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[120px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={yearlyData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                      <XAxis dataKey="year" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
                        width={40}
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          `${value.toLocaleString(formatLocale)} ${baseCurrencySymbol}`,
                          tc('total'),
                        ]}
                        labelFormatter={(label) => `${t('year')} ${label}`}
                        contentStyle={{
                          backgroundColor: 'var(--popover)',
                          border: 'none',
                          borderRadius: '8px',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                        }}
                      />
                      <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                        {yearlyData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.year === yearFilter ? '#3b82f6' : '#93c5fd'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
          <CardHeader className="lg:shrink-0">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                {yearFilter !== 'all' ||
                categoryFilter !== 'all' ||
                supplierFilter !== 'all' ||
                gigFilter !== 'all' ||
                memberFilter !== 'all'
                  ? `${t('expenses')} ${yearFilter !== 'all' ? yearFilter : ''} (${filteredExpenses.length} / ${expenses.length})`
                  : `${shouldFilter ? t('myExpenses') : t('allExpenses')} (${expenses.length})`}
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
            {selectedIds.size > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                <span className="text-sm font-medium">{t('selectedCount', { count: selectedIds.size })}</span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" disabled={!!bulkExporting || !!bulkDeleting}>
                        {bulkExporting ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-1" />
                        )}
                        {t('exportSelected')}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => handleBulkExport('zip')}>
                        <FileArchive className="h-4 w-4 mr-2 text-amber-600" />
                        {t('downloadAsZip')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkExport('pdf')}>
                        <FileText className="h-4 w-4 mr-2 text-red-600" />
                        {t('downloadAsPdf')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBulkExport('individual')}>
                        <Files className="h-4 w-4 mr-2 text-blue-600" />
                        {t('openIndividualFiles')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" disabled={!!bulkExporting || !!bulkDeleting}>
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        {t('sentToAccountant')}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => markSelectedSentToAccountant(true)}>
                        <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />
                        {t('markSentToAccountant')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => markSelectedSentToAccountant(false)}>
                        <X className="h-4 w-4 mr-2 text-muted-foreground" />
                        {t('unmarkSentToAccountant')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setBulkDeleteOpen(true)}
                    disabled={!!bulkExporting || !!bulkDeleting}
                  >
                    {bulkDeleting ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4 mr-1" />
                    )}
                    {tc('delete')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={clearSelection}
                    disabled={!!bulkExporting || !!bulkDeleting}
                  >
                    {t('clearSelection')}
                  </Button>
                </div>
              </div>
            )}
          </CardHeader>
          <CardContent className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col lg:overflow-hidden">
            {loading ? (
              <TableSkeleton columns={7} rows={5} />
            ) : filteredExpenses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                {expenses.length === 0 ? (
                  <>
                    <p>{t('noExpensesYet')}</p>
                    <p className="text-sm">{t('uploadOrImportHint')}</p>
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowUploadDialog(true)}>
                      <Upload className="h-4 w-4 mr-1" />
                      {t('uploadReceipt')}
                    </Button>
                  </>
                ) : (
                  <p>{t('noExpensesMatchFilter')}</p>
                )}
              </div>
            ) : (
              <>
                {/* Mobile card view */}
                <div className="lg:hidden space-y-2">
                  {filteredExpenses.slice(0, mobileExpenseLimit).map((expense) => (
                    <div
                      key={expense.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedIds.has(expense.id) ? 'bg-primary/5 border-primary/40' : 'bg-card hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedExpense(expense)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(expense.id)}
                            onCheckedChange={() => toggleSelected(expense.id)}
                            aria-label={t('selectRow')}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{expense.supplier}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {format(parseLocalDate(expense.date), 'd MMM yyyy', { locale: dateLocale })}
                            </span>
                            {expense.category && (
                              <Badge variant="outline" className="text-xs">
                                {categoryLabel(expense.category, t)}
                              </Badge>
                            )}
                            {expense.is_private && (
                              <Badge variant="outline" className="text-xs border-dashed text-muted-foreground">
                                {t('private')}
                              </Badge>
                            )}
                            {expense.sent_to_accountant_at && (
                              <Badge className="text-xs bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                {t('sentToAccountant')}
                              </Badge>
                            )}
                          </div>
                          {expense.gig && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {expense.gig.client?.name ||
                                expense.gig.project_name ||
                                format(parseLocalDate(expense.gig.date), 'd MMM', { locale: dateLocale })}
                            </Badge>
                          )}
                          {isSharedMode && (
                            <p className="text-xs text-muted-foreground">{getMemberLabel(expense.user_id)}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-semibold text-sm">
                            {formatCurrency(
                              expense.amount,
                              (expense.currency || 'SEK') as SupportedCurrency,
                              formatLocale,
                            )}
                          </span>
                          {expense.currency && expense.currency !== baseCurrencyCode && expense.amount_base && (
                            <p className="text-xs text-muted-foreground">
                              {expense.amount_base.toLocaleString(formatLocale)} {baseCurrencySymbol}
                            </p>
                          )}
                        </div>
                      </div>
                      {(expense.notes || expense.attachment_url) && (
                        <div className="flex items-center justify-between mt-2 pt-2 border-t">
                          {expense.notes ? (
                            <p className="text-xs text-muted-foreground truncate flex-1">{expense.notes}</p>
                          ) : (
                            <div />
                          )}
                          {expense.attachment_url && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                openPreview(expense.id, expense.attachment_url!)
                              }}
                              className="p-2 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors"
                              title={t('showReceiptImage')}
                            >
                              <ImageIcon className="h-5 w-5 text-blue-500" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {filteredExpenses.length > mobileExpenseLimit && (
                    <Button
                      variant="ghost"
                      className="w-full mt-2 text-sm text-muted-foreground"
                      onClick={() => setMobileExpenseLimit((prev) => prev + 20)}
                    >
                      {t('showMore', { count: filteredExpenses.length - mobileExpenseLimit })}
                    </Button>
                  )}
                </div>

                {/* Desktop table view */}
                <div ref={tableScrollRef} className="hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0 lg:overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allVisibleSelected ? true : someVisibleSelected ? 'indeterminate' : false}
                            onCheckedChange={toggleSelectAllVisible}
                            aria-label={t('selectAll')}
                          />
                        </TableHead>
                        <TableHead>{t('date')}</TableHead>
                        <TableHead>{t('supplier')}</TableHead>
                        <TableHead>{t('category')}</TableHead>
                        <TableHead>{t('gig')}</TableHead>
                        <TableHead>{t('amount')}</TableHead>
                        <TableHead>{t('notes')}</TableHead>
                        {isSharedMode && <TableHead>{t('createdBy')}</TableHead>}
                        <TableHead className="w-16 text-center">{t('accountantShort')}</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map((expense) => (
                        <TableRow
                          key={expense.id}
                          data-state={selectedIds.has(expense.id) ? 'selected' : undefined}
                          className="cursor-pointer hover:bg-muted/50 data-[state=selected]:bg-primary/5"
                          onClick={() => setSelectedExpense(expense)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedIds.has(expense.id)}
                              onCheckedChange={() => toggleSelected(expense.id)}
                              aria-label={t('selectRow')}
                            />
                          </TableCell>
                          <TableCell>{format(parseLocalDate(expense.date), 'PPP', { locale: dateLocale })}</TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5">
                              <span>{expense.supplier}</span>
                              {expense.is_private && (
                                <Badge variant="outline" className="text-xs border-dashed text-muted-foreground">
                                  {t('private')}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {expense.category ? (
                              <Badge variant="outline">{categoryLabel(expense.category, t)}</Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {expense.gig ? (
                              <Badge variant="secondary" className="text-xs">
                                {expense.gig.client?.name ||
                                  expense.gig.project_name ||
                                  format(parseLocalDate(expense.gig.date), 'd MMM', { locale: dateLocale })}
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {expense.currency && expense.currency !== baseCurrencyCode ? (
                              <div>
                                <span>
                                  {formatCurrency(expense.amount, expense.currency as SupportedCurrency, formatLocale)}
                                </span>
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({expense.amount_base?.toLocaleString(formatLocale)} {baseCurrencySymbol})
                                </span>
                              </div>
                            ) : (
                              <span>
                                {expense.amount.toLocaleString(formatLocale)} {baseCurrencySymbol}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[300px]">
                            <span className="text-sm text-muted-foreground line-clamp-1">{expense.notes || '-'}</span>
                          </TableCell>
                          {isSharedMode && (
                            <TableCell>
                              <span className="text-xs text-muted-foreground">{getMemberLabel(expense.user_id)}</span>
                            </TableCell>
                          )}
                          <TableCell className="text-center">
                            {expense.sent_to_accountant_at ? (
                              <span title={t('sentToAccountant')} className="inline-flex">
                                <CheckCircle2
                                  className="h-4 w-4 text-green-600 dark:text-green-400"
                                  aria-label={t('sentToAccountant')}
                                />
                              </span>
                            ) : (
                              <span className="text-muted-foreground/40">–</span>
                            )}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {expense.attachment_url && (
                              <button
                                onClick={() => openPreview(expense.id, expense.attachment_url!)}
                                className="p-2 hover:bg-blue-50 dark:hover:bg-blue-950 rounded transition-colors"
                                title={t('showReceiptImage')}
                              >
                                <ImageIcon className="h-5 w-5 text-blue-500" />
                              </button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
          <ScrollIndicator targetRef={tableScrollRef} />
        </Card>

        <UploadReceiptDialog
          open={showUploadDialog}
          onOpenChange={setShowUploadDialog}
          onSuccess={() => mutateExpenses()}
          existingSuppliers={suppliers}
        />

        <ExportDialog open={showExportDialog} onOpenChange={setShowExportDialog} />

        <MergeSuppliersDialog
          open={showMergeDialog}
          onOpenChange={setShowMergeDialog}
          suppliers={supplierCounts}
          onMerged={() => mutateExpenses()}
        />

        {/* Mobile filter sheet */}
        <Sheet open={showFilterSheet} onOpenChange={setShowFilterSheet}>
          <SheetContent
            side="bottom"
            className="max-h-[85dvh] rounded-t-2xl pb-[calc(env(safe-area-inset-bottom)+16px)]"
          >
            <SheetHeader className="pb-0">
              <SheetTitle>{tc('filter')}</SheetTitle>
            </SheetHeader>
            <div className="overflow-y-auto px-4 flex flex-col gap-3 [&>div]:w-full [&_button]:w-full">
              {filterSelects}
            </div>
            <div className="flex items-center gap-2 px-4">
              {activeFilters.length > 0 && (
                <Button variant="ghost" className="flex-1" onClick={() => activeFilters.forEach((f) => f.onClear())}>
                  {tc('clearFilters')}
                </Button>
              )}
              <Button className="flex-1" onClick={() => setShowFilterSheet(false)}>
                {tc('done')}
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        <ConfirmDialog
          open={bulkDeleteOpen}
          onOpenChange={setBulkDeleteOpen}
          title={t('bulkDeleteTitle')}
          description={t('bulkDeleteConfirm', { count: selectedIds.size })}
          confirmLabel={bulkDeleting ? t('deleting') : tc('delete')}
          variant="destructive"
          onConfirm={handleBulkDelete}
        />

        <EditExpenseDialog
          expense={selectedExpense}
          open={selectedExpense !== null}
          onOpenChange={(open) => !open && setSelectedExpense(null)}
          onSuccess={() => mutateExpenses()}
          gigs={gigs}
          existingSuppliers={suppliers}
        />

        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className={`p-0 ${previewIsPdf ? 'sm:max-w-[700px]' : 'sm:max-w-[600px]'}`}>
            <DialogTitle className="sr-only">{t('receiptPreview')}</DialogTitle>
            <div className="relative">
              <div className="absolute top-2 right-2 z-10 flex gap-1">
                {previewUrl && (
                  <button
                    onClick={() => previewUrl && downloadFile(previewUrl, `kvitto.${previewIsPdf ? 'pdf' : 'jpg'}`)}
                    className="p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                    title={tc('download')}
                  >
                    <Download className="h-5 w-5" />
                  </button>
                )}
                <button
                  onClick={() => setPreviewOpen(false)}
                  className="p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              {previewLoading ? (
                <div className="flex items-center justify-center h-96">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-muted-foreground" />
                </div>
              ) : previewUrl ? (
                previewIsPdf ? (
                  <iframe src={previewUrl} className="w-full h-[80vh] rounded-lg" title={t('receiptPreview')} />
                ) : (
                  <div className="relative w-full h-[80vh]">
                    <NextImage src={previewUrl} alt="" fill className="object-contain" unoptimized />
                  </div>
                )
              ) : (
                <div className="flex items-center justify-center h-96 text-gray-500 dark:text-muted-foreground">
                  {t('couldNotLoadImage')}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  )
}
