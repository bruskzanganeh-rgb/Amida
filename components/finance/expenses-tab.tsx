'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useCompany } from '@/lib/hooks/use-company'
import { useGigFilter } from '@/lib/hooks/use-gig-filter'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { categoryLabel } from '@/lib/expenses/categories'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'
import { formatCurrency, type SupportedCurrency } from '@/lib/currency/exchange'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Receipt, BarChart3, Upload, Image as ImageIcon, Download, Loader2, X, Search } from 'lucide-react'
import NextImage from 'next/image'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { UploadReceiptDialog } from '@/components/expenses/upload-receipt-dialog'
import { EditExpenseDialog } from '@/components/expenses/edit-expense-dialog'
import { ExportDialog } from '@/components/expenses/export-dialog'
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
  const { symbol: baseCurrencySymbol } = useBaseCurrency()
  const { shouldFilter, currentUserId: filterUserId, loaded: filterLoaded } = useGigFilter()
  const isSharedMode = company?.gig_visibility === 'shared' && members.length > 1
  const [currentUserId, setCurrentUserId] = useState<string>('')

  const [searchQuery, setSearchQuery] = useState('')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [supplierFilter, setSupplierFilter] = useState<string>('all')
  const [gigFilter, setGigFilter] = useState<string>('all')
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [mobileExpenseLimit, setMobileExpenseLimit] = useState(20)

  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewIsPdf, setPreviewIsPdf] = useState(false)
  const tableScrollRef = useRef<HTMLDivElement>(null)

  const supabase = createClient()

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
        const data = await response.json()
        setPreviewUrl(data.url)
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

  const years = [...new Set(expenses.map((e) => new Date(e.date).getFullYear()))].sort((a, b) => b - a)
  const categories = ([...new Set(expenses.map((e) => e.category).filter(Boolean))] as string[]).sort((a, b) =>
    categoryLabel(a, t).localeCompare(categoryLabel(b, t)),
  )
  const suppliers = [...new Set(expenses.map((e) => e.supplier))].sort()

  const filteredExpenses = expenses.filter((e) => {
    if (yearFilter !== 'all' && new Date(e.date).getFullYear().toString() !== yearFilter) return false
    if (categoryFilter !== 'all' && e.category !== categoryFilter) return false
    if (supplierFilter !== 'all' && e.supplier !== supplierFilter) return false
    if (gigFilter === 'linked' && !e.gig_id) return false
    if (gigFilter === 'unlinked' && e.gig_id) return false
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
  })

  const totalExpenses = filteredExpenses.reduce((sum, e) => sum + (e.amount_base || e.amount), 0)

  const yearlyData = years
    .map((year) => {
      const yearExpenses = expenses.filter((e) => new Date(e.date).getFullYear() === year)
      const total = yearExpenses.reduce((sum, e) => sum + (e.amount_base || e.amount), 0)
      return {
        year: year.toString(),
        total: Math.round(total),
        count: yearExpenses.length,
      }
    })
    .sort((a, b) => parseInt(a.year) - parseInt(b.year))

  useEffect(() => {
    function handleUpload() {
      setShowUploadDialog(true)
    }
    function handleExport() {
      setShowExportDialog(true)
    }
    window.addEventListener('upload-receipt', handleUpload)
    window.addEventListener('export-expenses', handleExport)
    return () => {
      window.removeEventListener('upload-receipt', handleUpload)
      window.removeEventListener('export-expenses', handleExport)
    }
  }, [])

  return (
    <PageTransition className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
      <div className="lg:flex lg:flex-col lg:h-full lg:min-h-0 space-y-6">
        {/* Filter */}
        <div className="flex flex-wrap gap-2 lg:shrink-0">
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
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:shrink-0">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {yearFilter !== 'all' || categoryFilter !== 'all' || supplierFilter !== 'all' || gigFilter !== 'all'
                  ? `${t('filteredExpenses')} ${yearFilter !== 'all' ? yearFilter : ''} (${filteredExpenses.length} / ${expenses.length})`
                  : t('totalExpenses')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalExpenses.toLocaleString(formatLocale)} {baseCurrencySymbol}
              </div>
            </CardContent>
          </Card>

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
                          backgroundColor: 'white',
                          border: '1px solid #e5e7eb',
                          borderRadius: '8px',
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
                {yearFilter !== 'all' || categoryFilter !== 'all' || supplierFilter !== 'all' || gigFilter !== 'all'
                  ? `${t('expenses')} ${yearFilter !== 'all' ? yearFilter : ''} (${filteredExpenses.length} / ${expenses.length})`
                  : `${t('allExpenses')} (${expenses.length})`}
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
                      className="p-3 rounded-lg border bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedExpense(expense)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm truncate">{expense.supplier}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                              {format(new Date(expense.date), 'd MMM yyyy', { locale: dateLocale })}
                            </span>
                            {expense.category && (
                              <Badge variant="outline" className="text-xs">
                                {categoryLabel(expense.category, t)}
                              </Badge>
                            )}
                          </div>
                          {expense.gig && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              {expense.gig.client?.name ||
                                expense.gig.project_name ||
                                format(new Date(expense.gig.date), 'd MMM', { locale: dateLocale })}
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
                          {expense.currency && expense.currency !== 'SEK' && expense.amount_base && (
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
                        <TableHead>{t('date')}</TableHead>
                        <TableHead>{t('supplier')}</TableHead>
                        <TableHead>{t('category')}</TableHead>
                        <TableHead>{t('gig')}</TableHead>
                        <TableHead>{t('amount')}</TableHead>
                        <TableHead>{t('notes')}</TableHead>
                        {isSharedMode && <TableHead>{t('createdBy')}</TableHead>}
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map((expense) => (
                        <TableRow
                          key={expense.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedExpense(expense)}
                        >
                          <TableCell>{format(new Date(expense.date), 'PPP', { locale: dateLocale })}</TableCell>
                          <TableCell className="font-medium">{expense.supplier}</TableCell>
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
                                  format(new Date(expense.gig.date), 'd MMM', { locale: dateLocale })}
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {expense.currency && expense.currency !== 'SEK' ? (
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
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{expense.notes || '-'}</span>
                          </TableCell>
                          {isSharedMode && (
                            <TableCell>
                              <span className="text-xs text-muted-foreground">{getMemberLabel(expense.user_id)}</span>
                            </TableCell>
                          )}
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
        />

        <ExportDialog open={showExportDialog} onOpenChange={setShowExportDialog} />

        <EditExpenseDialog
          expense={selectedExpense}
          open={selectedExpense !== null}
          onOpenChange={(open) => !open && setSelectedExpense(null)}
          onSuccess={() => mutateExpenses()}
          gigs={gigs}
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
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
                <div className="flex items-center justify-center h-96 text-gray-500">{t('couldNotLoadImage')}</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  )
}
