'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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

type CreateGigTypeDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  onCreated?: (id: string) => void
}

export function CreateGigTypeDialog({ open, onOpenChange, onSuccess, onCreated }: CreateGigTypeDialogProps) {
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
      // Silently fail — user can type manually
    }
    setTranslating(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const { data: created, error } = await supabase
      .from('gig_types')
      .insert([
        {
          name: formData.name,
          name_en: formData.name_en || null,
          vat_rate: parseFloat(formData.vat_rate),
          color: formData.color,
          is_default: false,
        },
      ])
      .select('id')
      .single()

    setLoading(false)

    if (error) {
      console.error('Error creating gig type:', error)
      toast.error(t('createError'))
    } else {
      toast.success(t('createSuccess'))
      setFormData({
        name: '',
        name_en: '',
        vat_rate: '0',
        color: '#3b82f6',
      })
      onSuccess()
      if (created) onCreated?.(created.id)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('newGigType')}</DialogTitle>
            <DialogDescription>{t('newGigTypeDescription')}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">
                {t('name')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                placeholder={t('namePlaceholder')}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="name_en">{t('nameEn')}</Label>
              <div className="flex gap-2">
                <Input
                  id="name_en"
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

            <div className="grid gap-2">
              <Label htmlFor="vat_rate">
                {t('vatRate')} (%) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vat_rate"
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
              <Label htmlFor="color">{t('color')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="color"
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
              {tc('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
