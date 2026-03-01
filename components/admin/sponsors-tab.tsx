'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Award, Plus, Trash2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

type Sponsor = {
  id: string
  name: string
  logo_url: string | null
  tagline: string | null
  website_url: string | null
  instrument_category_id: string
  active: boolean | null
  priority: number | null
  display_prefix: string | null
  category_name?: string
}

type InstrumentCategory = {
  id: string
  name: string
}

type Props = {
  sponsors: Sponsor[]
  setSponsors: React.Dispatch<React.SetStateAction<Sponsor[]>>
  categories: InstrumentCategory[]
  onReload: () => void
}

export function SponsorsTab({ sponsors, setSponsors, categories, onReload }: Props) {
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const tToast = useTranslations('toast')
  const supabase = createClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({
    name: '',
    logo_url: '',
    tagline: '',
    website_url: '',
    instrument_category_id: '',
    priority: 0,
    display_prefix: 'Sponsored by',
  })
  const [saving, setSaving] = useState(false)

  async function handleCreate() {
    if (!form.name || !form.instrument_category_id) {
      toast.error(t('nameAndCategoryRequired'))
      return
    }

    setSaving(true)
    const { error } = await supabase.from('sponsors').insert({
      name: form.name,
      logo_url: form.logo_url || null,
      tagline: form.tagline || null,
      website_url: form.website_url || null,
      instrument_category_id: form.instrument_category_id,
      priority: form.priority,
      display_prefix: form.display_prefix || 'Sponsored by',
      active: true,
    })

    if (error) {
      toast.error(tToast('sponsorCreateError'))
    } else {
      toast.success(tToast('sponsorCreated'))
      setDialogOpen(false)
      setForm({
        name: '',
        logo_url: '',
        tagline: '',
        website_url: '',
        instrument_category_id: '',
        priority: 0,
        display_prefix: 'Sponsored by',
      })
      onReload()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('sponsors').delete().eq('id', id)
    setSponsors((prev) => prev.filter((s) => s.id !== id))
    toast.success(tToast('sponsorDeleted'))
  }

  async function handleToggle(id: string, active: boolean | null) {
    await supabase.from('sponsors').update({ active: !active }).eq('id', id)
    setSponsors((prev) => prev.map((s) => (s.id === id ? { ...s, active: !active } : s)))
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold">{t('sponsors')}</h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('newSponsor')}
        </Button>
      </div>

      {sponsors.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Award className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('noSponsors')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sponsors.map((s) => (
            <Card key={s.id}>
              <CardContent className="py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{s.name}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {s.category_name}
                    </Badge>
                    {!s.active && (
                      <Badge variant="destructive" className="text-[10px]">
                        {t('inactive')}
                      </Badge>
                    )}
                  </div>
                  {s.display_prefix && (
                    <p className="text-xs text-muted-foreground">
                      {s.display_prefix} {s.name}
                    </p>
                  )}
                  {s.tagline && <p className="text-xs text-muted-foreground">{s.tagline}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleToggle(s.id, s.active)}>
                    {s.active ? t('deactivate') : t('activate')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(s.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('newSponsor')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('name')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Pirastro"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('instrumentCategory')}</Label>
              <Select
                value={form.instrument_category_id}
                onValueChange={(v) => setForm((f) => ({ ...f, instrument_category_id: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('selectCategory')} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('tagline')}</Label>
              <Input
                value={form.tagline}
                onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
                placeholder="The sound of excellence"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('website')}</Label>
              <Input
                value={form.website_url}
                onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
                placeholder="https://pirastro.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('logoUrl')}</Label>
              <Input
                value={form.logo_url}
                onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>{t('priority')}</Label>
              <Input
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('displayPrefix')}</Label>
              <Select value={form.display_prefix} onValueChange={(v) => setForm((f) => ({ ...f, display_prefix: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Sponsored by">Sponsored by</SelectItem>
                  <SelectItem value="Powered by">Powered by</SelectItem>
                  <SelectItem value="Presented by">Presented by</SelectItem>
                  <SelectItem value="In partnership with">In partnership with</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{t('displayPrefixHint')}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
