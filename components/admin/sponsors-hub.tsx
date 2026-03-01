'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Award, Plus, Trash2, Loader2, Sparkles, Users, Tag, Target, ChevronDown, ChevronRight } from 'lucide-react'
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

type User = {
  user_id: string
  plan: string
  email: string | null
  company_name: string | null
  city: string | null
  postal_code: string | null
  categories: string[]
}

type Props = {
  sponsors: Sponsor[]
  setSponsors: React.Dispatch<React.SetStateAction<Sponsor[]>>
  categories: InstrumentCategory[]
  setCategories: React.Dispatch<React.SetStateAction<InstrumentCategory[]>>
  users: User[]
  onReload: () => void
}

type AnalysisMatch = {
  user_id: string
  email: string | null
  company_name: string | null
  text: string
  category_id: string | null
  category_name: string | null
  confidence: number
  selected: boolean
}

type TargetingView = 'all' | 'analyze' | 'uncategorized'

export function SponsorsHub({ sponsors, setSponsors, categories, setCategories, users, onReload }: Props) {
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const tToast = useTranslations('toast')
  const supabase = createClient()

  // Section collapse state
  const [sectionsOpen, setSectionsOpen] = useState({
    categories: true,
    sponsors: true,
    targeting: true,
  })

  // Targeting sub-view
  const [targetingView, setTargetingView] = useState<TargetingView>('all')

  // Filter state
  const [cityFilter, setCityFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [planFilter, setPlanFilter] = useState('')

  // Category dialog
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [categoryForm, setCategoryForm] = useState({ name: '', sort_order: 0 })
  const [savingCategory, setSavingCategory] = useState(false)

  // Sponsor dialog
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false)
  const [sponsorForm, setSponsorForm] = useState({
    name: '',
    logo_url: '',
    tagline: '',
    website_url: '',
    instrument_category_id: '',
    priority: 0,
    display_prefix: 'Sponsored by',
  })
  const [savingSponsor, setSavingSponsor] = useState(false)

  // AI analysis state
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResults, setAnalysisResults] = useState<AnalysisMatch[]>([])
  const [applying, setApplying] = useState(false)

  // Manual assignment state
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
  const [assignCategoryId, setAssignCategoryId] = useState('')
  const [savingAssign, setSavingAssign] = useState(false)

  // --- Computed values ---
  const categorizedUsers = users.filter((u) => u.categories.length > 0)
  const uncategorizedUsers = users.filter((u) => u.categories.length === 0)

  function getCategoryUserCount(categoryName: string) {
    return users.filter((u) => u.categories.includes(categoryName)).length
  }

  function getCategorySponsor(categoryId: string) {
    return sponsors.find((s) => s.instrument_category_id === categoryId && s.active)
  }

  // --- Filtered users for "All" view ---
  const filteredUsers = users.filter((u) => {
    if (cityFilter && !u.city?.toLowerCase().includes(cityFilter.toLowerCase())) return false
    if (categoryFilter && categoryFilter !== 'all' && !u.categories.includes(categoryFilter)) return false
    if (planFilter && planFilter !== 'all' && u.plan !== planFilter) return false
    return true
  })

  // --- Category CRUD ---
  async function handleCreateCategory() {
    if (!categoryForm.name) return
    setSavingCategory(true)
    const slug = categoryForm.name.toLowerCase().replace(/[^a-zåäö0-9]+/g, '-')
    const { error } = await supabase.from('instrument_categories').insert({
      name: categoryForm.name,
      slug,
      sort_order: categoryForm.sort_order,
    })
    if (error) {
      toast.error(error.message)
    } else {
      toast.success(t('categorySaved'))
      setCategoryDialogOpen(false)
      setCategoryForm({ name: '', sort_order: 0 })
      onReload()
    }
    setSavingCategory(false)
  }

  async function handleDeleteCategory(id: string) {
    const { error } = await supabase.from('instrument_categories').delete().eq('id', id)
    if (error) {
      toast.error(error.message)
    } else {
      setCategories((prev) => prev.filter((c) => c.id !== id))
    }
  }

  // --- Sponsor CRUD ---
  async function handleCreateSponsor() {
    if (!sponsorForm.name || !sponsorForm.instrument_category_id) {
      toast.error(t('nameAndCategoryRequired'))
      return
    }
    setSavingSponsor(true)
    const { error } = await supabase.from('sponsors').insert({
      name: sponsorForm.name,
      logo_url: sponsorForm.logo_url || null,
      tagline: sponsorForm.tagline || null,
      website_url: sponsorForm.website_url || null,
      instrument_category_id: sponsorForm.instrument_category_id,
      priority: sponsorForm.priority,
      display_prefix: sponsorForm.display_prefix || 'Sponsored by',
      active: true,
    })
    if (error) {
      toast.error(tToast('sponsorCreateError'))
    } else {
      toast.success(tToast('sponsorCreated'))
      setSponsorDialogOpen(false)
      setSponsorForm({
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
    setSavingSponsor(false)
  }

  async function handleDeleteSponsor(id: string) {
    await supabase.from('sponsors').delete().eq('id', id)
    setSponsors((prev) => prev.filter((s) => s.id !== id))
    toast.success(tToast('sponsorDeleted'))
  }

  async function handleToggleSponsor(id: string, active: boolean | null) {
    await supabase.from('sponsors').update({ active: !active }).eq('id', id)
    setSponsors((prev) => prev.map((s) => (s.id === id ? { ...s, active: !active } : s)))
  }

  // --- AI Analysis ---
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
            email: user.email || null,
            company_name: user.company_name || null,
            text: match.text,
            category_id: match.category_id || null,
            category_name: match.category_name || null,
            confidence: match.confidence || 0,
            selected: match.category_id != null && match.confidence >= 0.7,
          })
        }
      }
      setAnalysisResults(flat)
      setTargetingView('analyze')
    } catch {
      toast.error('Analysis failed')
    }
    setAnalyzing(false)
  }

  async function handleApplyMatches() {
    const selected = analysisResults.filter((r) => r.selected && r.category_id)
    if (selected.length === 0) return
    setApplying(true)
    try {
      const res = await fetch('/api/admin/analyze-instruments/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matches: selected.map((r) => ({ user_id: r.user_id, category_id: r.category_id })),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        toast.success(`${t('matchesApplied')} (${data.applied})`)
        setAnalysisResults([])
        onReload()
      } else {
        toast.error('Failed to apply matches')
      }
    } catch {
      toast.error('Failed to apply matches')
    }
    setApplying(false)
  }

  // --- Manual assignment ---
  async function handleAssignCategory(userId: string, categoryId: string) {
    setSavingAssign(true)
    try {
      const res = await fetch('/api/admin/assign-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, category_ids: [categoryId] }),
      })
      if (res.ok) {
        toast.success(t('categoryAssigned'))
        setAssigningUserId(null)
        setAssignCategoryId('')
        onReload()
      } else {
        toast.error('Failed to assign')
      }
    } catch {
      toast.error('Failed to assign')
    }
    setSavingAssign(false)
  }

  function toggleSection(key: keyof typeof sectionsOpen) {
    setSectionsOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // Group analysis results by user
  const groupedResults = analysisResults.reduce(
    (acc, r) => {
      const key = r.user_id
      if (!acc[key]) acc[key] = { email: r.email, company_name: r.company_name, matches: [] }
      acc[key].matches.push(r)
      return acc
    },
    {} as Record<string, { email: string | null; company_name: string | null; matches: AnalysisMatch[] }>,
  )

  return (
    <div className="space-y-4">
      {/* Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DashCard label={t('totalFreelancers')} value={users.length} icon={<Users className="h-4 w-4" />} />
        <DashCard label={t('categorized')} value={categorizedUsers.length} icon={<Tag className="h-4 w-4" />} />
        <DashCard
          label={t('uncategorized')}
          value={uncategorizedUsers.length}
          icon={<Target className="h-4 w-4" />}
          highlight={uncategorizedUsers.length > 0}
        />
        <DashCard
          label={t('activeSponsors')}
          value={sponsors.filter((s) => s.active).length}
          icon={<Award className="h-4 w-4" />}
        />
      </div>

      {/* Categories Section */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('categories')}>
            <div className="flex items-center gap-2">
              {sectionsOpen.categories ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <h3 className="text-sm font-semibold">{t('categories')}</h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                setCategoryDialogOpen(true)
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('newCategory')}
            </Button>
          </div>

          {sectionsOpen.categories && (
            <div className="mt-3 space-y-1">
              {categories.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{t('noCategories')}</p>
              ) : (
                categories.map((c) => {
                  const userCount = getCategoryUserCount(c.name)
                  const sponsor = getCategorySponsor(c.id)
                  return (
                    <div key={c.id} className="flex items-center justify-between py-2 px-3 rounded bg-secondary/30">
                      <div className="flex items-center gap-3">
                        <p className="text-sm font-medium">{c.name}</p>
                        <span className="text-xs text-muted-foreground">
                          {userCount} {t('freelancers')}
                        </span>
                        {sponsor ? (
                          <Badge variant="default" className="text-[10px]">
                            {sponsor.name}
                          </Badge>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">{t('noSponsor')}</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteCategory(c.id)}
                        className="text-destructive hover:text-destructive h-7 w-7 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sponsors Section */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('sponsors')}>
            <div className="flex items-center gap-2">
              {sectionsOpen.sponsors ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <h3 className="text-sm font-semibold">{t('sponsors')}</h3>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation()
                setSponsorDialogOpen(true)
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('newSponsor')}
            </Button>
          </div>

          {sectionsOpen.sponsors && (
            <div className="mt-3 space-y-2">
              {sponsors.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">{t('noSponsors')}</p>
              ) : (
                sponsors.map((s) => {
                  const reach = getCategoryUserCount(s.category_name || '')
                  return (
                    <div key={s.id} className="flex items-center justify-between py-2 px-3 rounded bg-secondary/30">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{s.name}</p>
                          <Badge variant="secondary" className="text-[10px]">
                            {s.category_name}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {reach} {t('freelancers')}
                          </span>
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
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleToggleSponsor(s.id, s.active)}
                        >
                          {s.active ? t('deactivate') : t('activate')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSponsor(s.id)}
                          className="text-destructive hover:text-destructive h-7 w-7 p-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Targeting Section */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => toggleSection('targeting')}>
            <div className="flex items-center gap-2">
              {sectionsOpen.targeting ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <h3 className="text-sm font-semibold">{t('musicianTargeting')}</h3>
            </div>
          </div>

          {sectionsOpen.targeting && (
            <div className="mt-3 space-y-3">
              {/* Sub-view toggles */}
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={targetingView === 'all' ? 'default' : 'outline'}
                  onClick={() => setTargetingView('all')}
                  className="text-xs h-7"
                >
                  {t('allFreelancers')} ({users.length})
                </Button>
                <Button
                  size="sm"
                  variant={targetingView === 'analyze' ? 'default' : 'outline'}
                  onClick={() => setTargetingView('analyze')}
                  className="text-xs h-7"
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {t('analyzeText')}
                </Button>
                <Button
                  size="sm"
                  variant={targetingView === 'uncategorized' ? 'default' : 'outline'}
                  onClick={() => setTargetingView('uncategorized')}
                  className="text-xs h-7"
                >
                  {t('uncategorized')} ({uncategorizedUsers.length})
                </Button>
              </div>

              {/* ALL view */}
              {targetingView === 'all' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      className="w-40 h-7 text-xs"
                      placeholder={t('filterByCity')}
                      value={cityFilter}
                      onChange={(e) => setCityFilter(e.target.value)}
                    />
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-40 h-7 text-xs">
                        <SelectValue placeholder={t('filterByCategory')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('allCategories')}</SelectItem>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={planFilter} onValueChange={setPlanFilter}>
                      <SelectTrigger className="w-32 h-7 text-xs">
                        <SelectValue placeholder={t('filterByPlan')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('allPlans')}</SelectItem>
                        <SelectItem value="free">Free</SelectItem>
                        <SelectItem value="pro">Pro</SelectItem>
                        <SelectItem value="team">Team</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      {filteredUsers.length} / {users.length}
                    </span>
                  </div>
                  <div className="border rounded-md overflow-hidden max-h-[400px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Email</th>
                          <th className="p-2 text-left hidden sm:table-cell">{t('companyName')}</th>
                          <th className="p-2 text-left hidden sm:table-cell">{t('city')}</th>
                          <th className="p-2 text-left">{t('categories')}</th>
                          <th className="p-2 text-left">Plan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredUsers.map((u) => (
                          <tr key={u.user_id} className="border-t">
                            <td className="p-2">{u.email || '—'}</td>
                            <td className="p-2 hidden sm:table-cell text-muted-foreground">{u.company_name || '—'}</td>
                            <td className="p-2 hidden sm:table-cell text-muted-foreground">{u.city || '—'}</td>
                            <td className="p-2">
                              {u.categories.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {u.categories.map((c) => (
                                    <Badge key={c} variant="outline" className="text-[10px]">
                                      {c}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="p-2">
                              <Badge variant={u.plan === 'free' ? 'secondary' : 'default'} className="text-[10px]">
                                {u.plan}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ANALYZE view */}
              {targetingView === 'analyze' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{t('analyzeTextDescription')}</p>
                    <Button size="sm" variant="outline" onClick={handleAnalyze} disabled={analyzing}>
                      {analyzing ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      {analyzing ? t('analyzing') : t('analyzeText')}
                    </Button>
                  </div>

                  {analysisResults.length > 0 && (
                    <div className="space-y-2">
                      {Object.entries(groupedResults).map(([userId, group]) => (
                        <div key={userId} className="border rounded-md overflow-hidden">
                          {/* User header */}
                          <div className="bg-muted/40 px-3 py-2 flex items-center gap-2 text-xs">
                            <span className="font-medium">{group.email || userId.slice(0, 8)}</span>
                            {group.company_name && (
                              <span className="text-muted-foreground">({group.company_name})</span>
                            )}
                          </div>
                          {/* Matches */}
                          {group.matches.map((r, i) => (
                            <div key={i} className="flex items-center gap-3 px-3 py-2 border-t text-xs">
                              <Checkbox
                                checked={r.selected}
                                onCheckedChange={(checked) => {
                                  setAnalysisResults((prev) =>
                                    prev.map((item) =>
                                      item.user_id === r.user_id && item.text === r.text
                                        ? { ...item, selected: !!checked }
                                        : item,
                                    ),
                                  )
                                }}
                              />
                              <span className="font-mono w-32 truncate">{r.text}</span>
                              <div className="flex-1">
                                {r.category_id ? (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {r.category_name}
                                  </Badge>
                                ) : (
                                  <Select
                                    value=""
                                    onValueChange={(catId) => {
                                      const cat = categories.find((c) => c.id === catId)
                                      setAnalysisResults((prev) =>
                                        prev.map((item) =>
                                          item.user_id === r.user_id && item.text === r.text
                                            ? {
                                                ...item,
                                                category_id: catId,
                                                category_name: cat?.name || null,
                                                selected: true,
                                              }
                                            : item,
                                        ),
                                      )
                                    }}
                                  >
                                    <SelectTrigger className="h-6 w-36 text-[10px]">
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
                                )}
                              </div>
                              <Badge
                                variant={
                                  r.confidence >= 0.8 ? 'default' : r.confidence >= 0.5 ? 'secondary' : 'outline'
                                }
                                className="text-[10px]"
                              >
                                {Math.round(r.confidence * 100)}%
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ))}
                      <div className="flex justify-between items-center">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => setCategoryDialogOpen(true)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {t('newCategory')}
                        </Button>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setAnalysisResults([])}
                          >
                            {tc('cancel')}
                          </Button>
                          <Button
                            size="sm"
                            className="text-xs h-7"
                            onClick={handleApplyMatches}
                            disabled={
                              applying || analysisResults.filter((r) => r.selected && r.category_id).length === 0
                            }
                          >
                            {applying && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                            {t('applyMatches')} ({analysisResults.filter((r) => r.selected && r.category_id).length})
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* UNCATEGORIZED view */}
              {targetingView === 'uncategorized' && (
                <div className="space-y-2">
                  {uncategorizedUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">{t('allCategorized')}</p>
                  ) : (
                    uncategorizedUsers.map((u) => (
                      <div
                        key={u.user_id}
                        className="flex items-center justify-between py-2 px-3 rounded bg-secondary/30"
                      >
                        <div>
                          <p className="text-xs font-medium">{u.email || u.user_id.slice(0, 8)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {[u.company_name, u.city].filter(Boolean).join(' · ') || '—'}
                          </p>
                        </div>
                        {assigningUserId === u.user_id ? (
                          <div className="flex items-center gap-2">
                            <Select value={assignCategoryId} onValueChange={setAssignCategoryId}>
                              <SelectTrigger className="w-36 h-7 text-xs">
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
                            <Button
                              size="sm"
                              className="h-7 text-xs"
                              disabled={!assignCategoryId || savingAssign}
                              onClick={() => handleAssignCategory(u.user_id, assignCategoryId)}
                            >
                              {savingAssign && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                              {tc('save')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => {
                                setAssigningUserId(null)
                                setAssignCategoryId('')
                              }}
                            >
                              {tc('cancel')}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setAssigningUserId(u.user_id)}
                          >
                            <Tag className="h-3 w-3 mr-1" />
                            {t('assignCategory')}
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('newCategory')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('categoryName')}</Label>
              <Input
                value={categoryForm.name}
                onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Stråk / Fotograf / Musiklärare"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('sortOrder')}</Label>
              <Input
                type="number"
                value={categoryForm.sort_order}
                onChange={(e) => setCategoryForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleCreateCategory} disabled={savingCategory}>
              {savingCategory && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sponsor Dialog */}
      <Dialog open={sponsorDialogOpen} onOpenChange={setSponsorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('newSponsor')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('name')}</Label>
              <Input
                value={sponsorForm.name}
                onChange={(e) => setSponsorForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Pirastro"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('category')}</Label>
              <Select
                value={sponsorForm.instrument_category_id}
                onValueChange={(v) => setSponsorForm((f) => ({ ...f, instrument_category_id: v }))}
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
                value={sponsorForm.tagline}
                onChange={(e) => setSponsorForm((f) => ({ ...f, tagline: e.target.value }))}
                placeholder="The sound of excellence"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('website')}</Label>
              <Input
                value={sponsorForm.website_url}
                onChange={(e) => setSponsorForm((f) => ({ ...f, website_url: e.target.value }))}
                placeholder="https://pirastro.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('logoUrl')}</Label>
              <Input
                value={sponsorForm.logo_url}
                onChange={(e) => setSponsorForm((f) => ({ ...f, logo_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>
            <div className="space-y-2">
              <Label>{t('displayPrefix')}</Label>
              <Select
                value={sponsorForm.display_prefix}
                onValueChange={(v) => setSponsorForm((f) => ({ ...f, display_prefix: v }))}
              >
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
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSponsorDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleCreateSponsor} disabled={savingSponsor}>
              {savingSponsor && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DashCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string
  value: number
  icon: React.ReactNode
  highlight?: boolean
}) {
  return (
    <Card>
      <CardContent className="py-3">
        <div className="flex items-center gap-2 mb-1 text-muted-foreground">
          {icon}
          <span className="text-[11px]">{label}</span>
        </div>
        <p className={`text-2xl font-bold ${highlight ? 'text-amber-600' : ''}`}>{value}</p>
      </CardContent>
    </Card>
  )
}
