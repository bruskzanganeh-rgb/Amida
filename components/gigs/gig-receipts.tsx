'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Receipt, Plus, Loader2, ExternalLink, Trash2 } from 'lucide-react'
import { UploadReceiptDialog } from '@/components/expenses/upload-receipt-dialog'
import { format } from 'date-fns'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'
import { formatCurrency, type SupportedCurrency } from '@/lib/currency/exchange'

type Expense = {
  id: string
  date: string
  supplier: string
  amount: number
  currency: string | null
  amount_base: number | null
  category: string | null
  attachment_url: string | null
}

type GigReceiptsProps = {
  gigId: string
  gigTitle?: string
  disabled?: boolean
}

export function GigReceipts({ gigId, gigTitle, disabled }: GigReceiptsProps) {
  const t = useTranslations('gig')
  const tc = useTranslations('common')
  const tToast = useTranslations('toast')
  const dateLocale = useDateLocale()
  const { symbol: baseCurrencySymbol } = useBaseCurrency()
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null)
  const supabase = createClient()

  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    async function loadExpenses() {
      setLoading(true)
      const { data, error } = await supabase
        .from('expenses')
        .select('id, date, supplier, amount, currency, amount_base, category, attachment_url')
        .eq('gig_id', gigId)
        .order('date', { ascending: false })

      if (error) {
        console.error('Error loading gig receipts:', error)
      } else {
        setExpenses(data || [])
      }
      setLoading(false)
    }
    loadExpenses()
  }, [gigId, supabase, refreshKey])

  function confirmDelete(expenseId: string) {
    setExpenseToDelete(expenseId)
    setDeleteConfirmOpen(true)
  }

  async function handleDelete(expenseId: string) {
    setDeleting(expenseId)
    const { error } = await supabase.from('expenses').delete().eq('id', expenseId)

    if (error) {
      console.error('Error deleting expense:', error)
      toast.error(tToast('deleteReceiptError'))
    } else {
      setRefreshKey((k) => k + 1)
    }
    setDeleting(null)
  }

  const totalAmount = expenses.reduce((sum, e) => sum + (e.amount_base || e.amount), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">{t('receipts')}</h3>
          {expenses.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {expenses.length} {tc('items')} • {totalAmount.toLocaleString('sv-SE')} {baseCurrencySymbol}
            </Badge>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setShowUploadDialog(true)}
          disabled={disabled}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : expenses.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">{t('noReceiptsLinked')}</p>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => (
            <div key={expense.id} className="flex items-center justify-between p-2 rounded-lg border bg-white">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{expense.supplier}</span>
                  {expense.category && (
                    <Badge variant="outline" className="text-xs">
                      {expense.category}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(expense.date), 'PPP', { locale: dateLocale })} •{' '}
                  {expense.currency && expense.currency !== 'SEK' ? (
                    <>
                      {formatCurrency(expense.amount, expense.currency as SupportedCurrency, 'sv-SE')} (
                      {expense.amount_base?.toLocaleString('sv-SE')} {baseCurrencySymbol})
                    </>
                  ) : (
                    <>
                      {expense.amount.toLocaleString('sv-SE')} {baseCurrencySymbol}
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {expense.attachment_url && (
                  <a
                    href={expense.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded hover:bg-gray-100"
                    title={t('viewReceipt')}
                  >
                    <ExternalLink className="h-4 w-4 text-blue-600" />
                  </a>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => confirmDelete(expense.id)}
                  disabled={deleting === expense.id}
                >
                  {deleting === expense.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 text-destructive" />
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <UploadReceiptDialog
        open={showUploadDialog}
        onOpenChange={setShowUploadDialog}
        onSuccess={() => {
          setShowUploadDialog(false)
          setRefreshKey((k) => k + 1)
        }}
        gigId={gigId}
        gigTitle={gigTitle}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open)
          if (!open) setExpenseToDelete(null)
        }}
        title={t('deleteReceipt')}
        description={t('deleteReceiptConfirm')}
        confirmLabel={tc('delete')}
        variant="destructive"
        onConfirm={() => {
          if (expenseToDelete) {
            handleDelete(expenseToDelete)
          }
          setDeleteConfirmOpen(false)
          setExpenseToDelete(null)
        }}
      />
    </div>
  )
}
