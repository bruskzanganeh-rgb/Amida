'use client'

import { useState, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
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
import { Loader2, Languages } from 'lucide-react'
import { toast } from 'sonner'

type GigType = {
  id: string
  name: string
  name_en: string | null
  vat_rate: number
  color: string | null
}

type EditGigTypeDialogProps = {
  gigType: GigType | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export function EditGigTypeDialog({ gigType, open, onOpenChange, onSuccess }: EditGigTypeDialogProps) {
  const [loading, setLoading] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    name_en: '',
    vat_rate: '0',
    color: '#3b82f6',
  })

  const supabase = createClient()
  const t = useTranslations('gigTypes')
  const tc = useTranslations('common')
  const locale = useLocale()

  useEffect(() => {
    if (gigType) {
      setFormData({
        name: gigType.name,
        name_en: gigType.name_en || '',
        vat_rate: String(gigType.vat_rate),
        color: gigType.color || '#3b82f6',
      })
    }
  }, [gigType])

  async function handleTranslate() {
    if (!formData.name.trim()) return
    setTranslating(true)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: formData.name, targetLang: 'en' }),
      })
      const data = await res.json()
      if (data.translation) {
        setFormData((prev) => ({ ...prev, name_en: data.translation }))
      }
    } catch {
      // Silently fail
    }
    setTranslating(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!gigType) return
    setLoading(true)

    const { error } = await supabase
      .from('gig_types')
      .update({
        name: formData.name,
        name_en: locale === 'en' ? formData.name : formData.name_en || null,
        vat_rate: parseFloat(formData.vat_rate),
        color: formData.color,
      })
      .eq('id', gigType.id)

    setLoading(false)

    if (error) {
      console.error('Error updating gig type:', error)
      toast.error(t('updateError'))
    } else {
      toast.success(t('updateSuccess'))
      onSuccess()
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('editGigType')}</DialogTitle>
            <DialogDescription>{t('editGigTypeDescription')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">
                {t('name')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-name"
                placeholder={t('namePlaceholder')}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            {locale !== 'en' && (
              <div className="grid gap-2">
                <Label htmlFor="edit-name_en">{t('nameEn')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="edit-name_en"
                    placeholder={t('nameEnPlaceholder')}
                    value={formData.name_en}
                    onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleTranslate}
                    disabled={translating || !formData.name.trim()}
                    className="shrink-0"
                  >
                    {translating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('nameEnHint')}</p>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="edit-vat_rate">
                {t('vatRate')} (%) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="edit-vat_rate"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.vat_rate}
                onChange={(e) => setFormData({ ...formData, vat_rate: e.target.value })}
                required
              />
              <p className="text-xs text-muted-foreground">{t('vatRateHint')}</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-color">{t('color')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="edit-color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-20 h-10"
                />
                <span className="text-sm text-muted-foreground">{formData.color}</span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              {tc('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
