'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Music, Plus, Trash2, Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

type InstrumentCategory = {
  id: string
  name: string
  slug?: string
  sort_order?: number
  instrument_count?: number
}

type Props = {
  categories: InstrumentCategory[]
  setCategories: React.Dispatch<React.SetStateAction<InstrumentCategory[]>>
  onReload: () => void
}

export function CategoriesTab({ categories, setCategories, onReload }: Props) {
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const supabase = createClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState({ name: '', sort_order: 0 })
  const [saving, setSaving] = useState(false)

  // AI analysis state
  type AnalysisMatch = {
    user_id: string
    text: string
    instrument_id: string | null
    instrument_name: string | null
    category_name: string
    confidence: number
    selected: boolean
  }
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResults, setAnalysisResults] = useState<AnalysisMatch[]>([])
  const [applying, setApplying] = useState(false)

  async function handleAnalyze() {
    setAnalyzing(true)
    setAnalysisResults([])
    try {
      const res = await fetch('/api/admin/analyze-instruments', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Analysis failed')
        setAnalyzing(false)
        return
      }
      if (!data.results || data.results.length === 0) {
        toast.info(t('noUnmatchedText'))
        setAnalyzing(false)
        return
      }
      const flat: AnalysisMatch[] = []
      for (const user of data.results) {
        for (const match of user.matches) {
          flat.push({
            user_id: user.user_id,
            text: match.text,
            instrument_id: match.instrument_id || null,
            instrument_name: match.instrument_name || null,
            category_name: match.category_name || '',
            confidence: match.confidence || 0,
            selected: match.instrument_id != null && match.confidence >= 0.7,
          })
        }
      }
      setAnalysisResults(flat)
    } catch {
      toast.error('Analysis failed')
    }
    setAnalyzing(false)
  }

  async function handleApply() {
    const selected = analysisResults.filter((r) => r.selected && r.instrument_id)
    if (selected.length === 0) return
    setApplying(true)
    try {
      const res = await fetch('/api/admin/analyze-instruments/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matches: selected.map((r) => ({ user_id: r.user_id, instrument_id: r.instrument_id })),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${t('matchesApplied')} (${data.applied})`)
        setAnalysisResults([])
      } else {
        toast.error('Failed to apply matches')
      }
    } catch {
      toast.error('Failed to apply matches')
    }
    setApplying(false)
  }

  async function handleCreate() {
    if (!form.name) return
    setSaving(true)
    const slug = form.name.toLowerCase().replace(/[^a-zåäö0-9]+/g, '-')
    const { error } = await supabase.from('instrument_categories').insert({
      name: form.name,
      slug,
      sort_order: form.sort_order,
    })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(t('categorySaved'))
      setDialogOpen(false)
      setForm({ name: '', sort_order: 0 })
      onReload()
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('instrument_categories').delete().eq('id', id)
    if (error) {
      toast.error(error.message)
    } else {
      setCategories((prev) => prev.filter((c) => c.id !== id))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold">{t('categories')}</h2>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          {t('newCategory')}
        </Button>
      </div>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Music className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('noCategories')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {categories.map((c) => (
            <Card key={c.id}>
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.instrument_count || 0} {t('instrumentCount')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    #{c.sort_order}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(c.id)}
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

      {/* AI Analysis Section */}
      <Card>
        <CardContent className="py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{t('analyzeText')}</p>
              <p className="text-xs text-muted-foreground">
                {t('analyzeTextDescription') || 'Match free-text instrument entries to structured instruments using AI'}
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {analyzing ? t('analyzing') : t('analyzeText')}
            </Button>
          </div>

          {analysisResults.length > 0 && (
            <div className="space-y-2">
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2 text-left w-8"></th>
                      <th className="p-2 text-left">{tc('text') || 'Text'}</th>
                      <th className="p-2 text-left">{t('suggestedMatch')}</th>
                      <th className="p-2 text-left">{t('categories')}</th>
                      <th className="p-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysisResults.map((r, i) => (
                      <tr key={i} className="border-t">
                        <td className="p-2">
                          <Checkbox
                            checked={r.selected}
                            disabled={!r.instrument_id}
                            onCheckedChange={(checked) => {
                              setAnalysisResults((prev) =>
                                prev.map((item, idx) => (idx === i ? { ...item, selected: !!checked } : item)),
                              )
                            }}
                          />
                        </td>
                        <td className="p-2 font-mono text-xs">{r.text}</td>
                        <td className="p-2">
                          {r.instrument_name ? (
                            <Badge variant="secondary">{r.instrument_name}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </td>
                        <td className="p-2 text-xs text-muted-foreground">{r.category_name}</td>
                        <td className="p-2 text-right">
                          <Badge
                            variant={r.confidence >= 0.8 ? 'default' : r.confidence >= 0.5 ? 'secondary' : 'outline'}
                          >
                            {Math.round(r.confidence * 100)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setAnalysisResults([])}>
                  {tc('cancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={applying || analysisResults.filter((r) => r.selected && r.instrument_id).length === 0}
                >
                  {applying && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                  {t('applyMatches')} ({analysisResults.filter((r) => r.selected && r.instrument_id).length})
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('newCategory')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('categoryName')}</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Stråk / Strings"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('sortOrder')}</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
              />
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
