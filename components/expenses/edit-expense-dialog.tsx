'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslations } from 'next-intl'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Trash2, Upload, Image as ImageIcon, X } from 'lucide-react'
import NextImage from 'next/image'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { GigCombobox } from '@/components/expenses/gig-combobox'
import { GigListBox } from '@/components/expenses/gig-listbox'
import { isValidReceiptFile, ALLOWED_RECEIPT_EXTENSIONS } from '@/lib/upload/file-validation'

type Expense = {
  id: string
  date: string
  supplier: string
  amount: number
  currency: string | null
  amount_base: number | null
  category: string | null
  notes: string | null
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

type EditExpenseDialogProps = {
  expense: Expense | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  gigs: Gig[]
}

const categories = [
  'Resa',
  'Mat',
  'Hotell',
  'Instrument',
  'Noter',
  'Utrustning',
  'Kontorsmaterial',
  'Telefon',
  'Prenumeration',
  'Redovisning',
  'Övrigt',
]

const CATEGORY_KEY_MAP: Record<string, string> = {
  Resa: 'categoryTravel',
  Mat: 'categoryFood',
  Hotell: 'categoryHotel',
  Instrument: 'categoryInstrument',
  Noter: 'categorySheetMusic',
  Utrustning: 'categoryEquipment',
  Kontorsmaterial: 'categoryOffice',
  Telefon: 'categoryPhone',
  Prenumeration: 'categorySubscription',
  Redovisning: 'categoryAccounting',
  Övrigt: 'categoryOther',
}

function categoryLabel(category: string, t: (k: string) => string): string {
  const key = CATEGORY_KEY_MAP[category]
  if (!key) return category
  try {
    return t(key)
  } catch {
    return category
  }
}

const currencies = ['SEK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK']

export function EditExpenseDialog({ expense, open, onOpenChange, onSuccess, gigs }: EditExpenseDialogProps) {
  const t = useTranslations('expense')
  const tc = useTranslations('common')
  const tt = useTranslations('toast')
  const [saving, setSaving] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Attachment state
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null)
  const [attachmentLoading, setAttachmentLoading] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [hasAttachment, setHasAttachment] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    date: '',
    supplier: '',
    amount: 0,
    currency: 'SEK',
    category: 'Övrigt',
    notes: '',
    gig_id: 'none',
  })

  // Uppdatera form och ladda attachment när expense ändras
  useEffect(() => {
    if (expense && open) {
      setFormData({
        date: expense.date,
        supplier: expense.supplier,
        amount: expense.amount,
        currency: expense.currency || 'SEK',
        category: expense.category || 'Övrigt',
        notes: expense.notes || '',
        gig_id: expense.gig_id || 'none',
      })
      setHasAttachment(!!expense.attachment_url)

      // Ladda signerad URL om det finns attachment
      if (expense.attachment_url) {
        loadAttachment(expense.id)
      } else {
        setAttachmentUrl(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAttachment is stable; only re-run when expense or open changes
  }, [expense, open])

  // Rensa state när dialogen stängs
  useEffect(() => {
    if (!open) {
      setAttachmentUrl(null)
      setHasAttachment(false)
    }
  }, [open])

  async function loadAttachment(expenseId: string) {
    setAttachmentLoading(true)
    try {
      const response = await fetch(`/api/expenses/${expenseId}/attachment`)
      if (response.ok) {
        const data = await response.json()
        setAttachmentUrl(data.url)
      } else {
        setAttachmentUrl(null)
      }
    } catch (error) {
      console.error('Error loading attachment:', error)
      setAttachmentUrl(null)
      toast.error(tt('pdfLoadError'))
    } finally {
      setAttachmentLoading(false)
    }
  }

  async function handleUploadAttachment(file: File) {
    if (!expense) return

    setUploadingAttachment(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/expenses/${expense.id}/attachment`, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || tt('couldNotUpload'))
      }

      setAttachmentUrl(result.url)
      setHasAttachment(true)
      toast.success(tt('receiptUploaded'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tt('genericError'))
    } finally {
      setUploadingAttachment(false)
    }
  }

  async function handleDeleteAttachment() {
    if (!expense) return

    setUploadingAttachment(true)
    try {
      const response = await fetch(`/api/expenses/${expense.id}/attachment`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || tt('couldNotDelete'))
      }

      setAttachmentUrl(null)
      setHasAttachment(false)
      toast.success(tt('receiptDeleted'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tt('genericError'))
    } finally {
      setUploadingAttachment(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      const validation = isValidReceiptFile(file)
      if (!validation.valid) {
        toast.error(validation.error)
        e.target.value = ''
        return
      }
      handleUploadAttachment(file)
    }
    // Reset input så samma fil kan väljas igen
    e.target.value = ''
  }

  const handleSave = async () => {
    if (!expense) return

    setSaving(true)

    try {
      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: formData.date,
          supplier: formData.supplier,
          amount: formData.amount,
          currency: formData.currency,
          amount_base: formData.currency === 'SEK' ? formData.amount : expense.amount_base,
          category: formData.category,
          notes: formData.notes || null,
          gig_id: formData.gig_id === 'none' ? null : formData.gig_id,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || tt('couldNotSave'))
      }

      toast.success(tt('expenseUpdated'))
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tt('genericError'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!expense) return

    setDeleting(true)

    try {
      const response = await fetch(`/api/expenses/${expense.id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || tt('couldNotDelete'))
      }

      toast.success(tt('expenseDeleted'))
      onSuccess()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tt('genericError'))
    } finally {
      setDeleting(false)
      setDeleteConfirmOpen(false)
    }
  }

  if (!expense) return null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] flex flex-col w-[95vw] md:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{t('editExpense')}</DialogTitle>
            <DialogDescription>{t('editExpenseDescription')}</DialogDescription>
          </DialogHeader>

          {/* Responsive layout: stacked on mobile, 3 columns on desktop */}
          <div className="flex flex-col md:flex-row gap-6 min-w-0 flex-1 overflow-y-auto">
            {/* Vänster kolumn: Kvittobild */}
            <div className="w-full md:w-44 md:shrink-0 space-y-3">
              <Label className="text-sm font-medium">{t('receiptImage')}</Label>

              {attachmentLoading ? (
                <div className="flex flex-col items-center justify-center h-40 md:h-56 text-sm text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin mb-2" />
                  {tc('loading')}
                </div>
              ) : hasAttachment && attachmentUrl ? (
                <div className="space-y-2">
                  <a
                    href={attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block relative w-full h-40 md:h-56 rounded-lg border shadow-sm overflow-hidden hover:opacity-90 transition-opacity"
                  >
                    <NextImage src={attachmentUrl} alt="" fill className="object-cover" unoptimized />
                  </a>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAttachment}
                    >
                      {uploadingAttachment ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          <Upload className="h-3 w-3 mr-1" />
                          {t('replace')}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-500 hover:text-red-600 text-xs"
                      onClick={handleDeleteAttachment}
                      disabled={uploadingAttachment}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : hasAttachment && !attachmentUrl ? (
                <div className="space-y-2">
                  <div className="w-full h-40 md:h-56 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 flex items-center justify-center">
                    <p className="text-xs text-amber-600 text-center px-2">{t('couldNotLoad')}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAttachment}
                  >
                    {uploadingAttachment ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-3 w-3 mr-1" />
                        {tc('upload')}
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div
                    className="w-full h-40 md:h-56 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImageIcon className="h-8 w-8 text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400">{t('noImage')}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAttachment}
                  >
                    {uploadingAttachment ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <>
                        <Upload className="h-3 w-3 mr-1" />
                        {tc('upload')}
                      </>
                    )}
                  </Button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_RECEIPT_EXTENSIONS}
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {/* Mitten kolumn: Formulärfält */}
            <div className="w-full md:w-72 md:shrink-0 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="date">{t('date')}</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="supplier">{t('supplier')}</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1 space-y-1">
                  <Label htmlFor="amount">{t('amount')}</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="w-24 space-y-1">
                  <Label htmlFor="currency">{t('currency')}</Label>
                  <Select
                    value={formData.currency}
                    onValueChange={(value) => setFormData({ ...formData, currency: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="category">{t('category')}</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {categoryLabel(c, t)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="notes">{t('notes')}</Label>
                <Input
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder={t('optionalDescription')}
                />
              </div>
            </div>

            {/* Höger kolumn: Uppdragsväljare */}
            <div className="flex-1 min-w-0 space-y-2">
              <Label>{t('gig')}</Label>
              {/* Dropdown på mobil */}
              <div className="md:hidden">
                <GigCombobox
                  gigs={gigs}
                  value={formData.gig_id}
                  onValueChange={(value) => setFormData({ ...formData, gig_id: value })}
                />
              </div>
              {/* Inline lista på desktop */}
              <div className="hidden md:block">
                <GigListBox
                  gigs={gigs}
                  value={formData.gig_id}
                  onValueChange={(value) => setFormData({ ...formData, gig_id: value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('linkExpenseToGigHint')}</p>
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            <Button
              variant="ghost"
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={saving || deleting}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              {tc('delete')}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                {tc('cancel')}
              </Button>
              <Button onClick={handleSave} disabled={saving || !formData.supplier}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('saving')}
                  </>
                ) : (
                  tc('save')
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title={t('deleteExpense')}
        description={t('deleteExpenseConfirm')}
        confirmLabel={deleting ? t('deleting') : tc('delete')}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </>
  )
}
