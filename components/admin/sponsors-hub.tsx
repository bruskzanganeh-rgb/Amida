'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Award,
  Plus,
  Trash2,
  Loader2,
  Sparkles,
  Users,
  Tag,
  Target,
  ChevronDown,
  ChevronRight,
  Pencil,
  Info,
  X,
  Upload,
  ImageIcon,
  BarChart3,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'

type InstrumentCategory = {
  id: string
  name: string
  name_en?: string | null
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
  target_city: string | null
  target_country: string | null
  target_cities: string[] | null
  category_name?: string
}

type User = {
  user_id: string
  plan: string
  email: string | null
  company_name: string | null
  city: string | null
  postal_code: string | null
  country_code: string | null
  categories: { id: string; name: string }[]
  instruments_text: string | null
}

type Props = {
  sponsors: Sponsor[]
  setSponsors: React.Dispatch<React.SetStateAction<Sponsor[]>>
  categories: InstrumentCategory[]
  setCategories: React.Dispatch<React.SetStateAction<InstrumentCategory[]>>
  users: User[]
  onUpdateUserCategories: (userId: string, categories: { id: string; name: string }[]) => void
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

export function SponsorsHub({
  sponsors,
  setSponsors,
  categories,
  setCategories,
  users,
  onUpdateUserCategories,
  onReload,
}: Props) {
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
  const [categoryForm, setCategoryForm] = useState({ name: '', name_en: '', sort_order: 0 })
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null)
  const [savingCategory, setSavingCategory] = useState(false)

  // Auto-suggest after category create
  const [suggestMatches, setSuggestMatches] = useState<
    { user_id: string; email: string | null; company_name: string | null; selected: boolean }[]
  >([])
  const [suggestCategoryId, setSuggestCategoryId] = useState<string | null>(null)
  const [suggestCategoryName, setSuggestCategoryName] = useState('')
  const [suggestDialogOpen, setSuggestDialogOpen] = useState(false)
  const [applyingSuggestions, setApplyingSuggestions] = useState(false)

  // Sponsor dialog
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false)
  const [editingSponsorId, setEditingSponsorId] = useState<string | null>(null)
  const [sponsorForm, setSponsorForm] = useState({
    name: '',
    logo_url: '',
    tagline: '',
    website_url: '',
    instrument_category_id: '',
    priority: 0,
    display_prefix: 'Sponsored by',
    target_country: '',
    target_cities: [] as string[],
  })
  const [savingSponsor, setSavingSponsor] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  // AI analysis state
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResults, setAnalysisResults] = useState<AnalysisMatch[]>([])
  const [applying, setApplying] = useState(false)

  // Manual assignment state
  const [assigningUserId, setAssigningUserId] = useState<string | null>(null)
  const [assignCategoryId, setAssignCategoryId] = useState('')
  const [savingAssign, setSavingAssign] = useState(false)

  // Inline category edit
  const [addingCategoryForUser, setAddingCategoryForUser] = useState<string | null>(null)
  const [addCategoryId, setAddCategoryId] = useState('')

  // Global tier filter for dashboard + categories
  const [tierFilter, setTierFilter] = useState('')

  // Sponsor coverage stats
  type CoverageData = {
    totalFreeUsers: number
    withSponsor: number
    withoutSponsor: number
    byCity: { city: string; country: string; freeUsers: number; withSponsor: number }[]
  }
  const [coverage, setCoverage] = useState<CoverageData | null>(null)
  const [coverageExpanded, setCoverageExpanded] = useState(false)

  useEffect(() => {
    fetch('/api/admin/sponsor-stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setCoverage(data)
      })
      .catch(() => {})
  }, [])

  // Sponsor stats expand
  const [expandedSponsorId, setExpandedSponsorId] = useState<string | null>(null)
  const [sponsorStats, setSponsorStats] = useState<{
    app: number
    pdf: number
    click: number
    total: number
    byCity: { city: string; country: string; app: number; pdf: number; click: number; total: number }[]
  } | null>(null)
  const [sponsorStatsPeriod, setSponsorStatsPeriod] = useState('all')
  const [loadingSponsorStats, setLoadingSponsorStats] = useState(false)

  // --- Computed values ---
  // Unique cities with user counts (for sponsor geo targeting)
  const cityCounts = users.reduce(
    (acc, u) => {
      if (u.city) acc[u.city] = (acc[u.city] || 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )
  const uniqueCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1])

  const tierUsers = tierFilter && tierFilter !== 'all' ? users.filter((u) => u.plan === tierFilter) : users
  const categorizedUsers = tierUsers.filter((u) => u.categories.length > 0)
  const uncategorizedUsers = tierUsers.filter((u) => u.categories.length === 0)

  function getCategoryUserCount(categoryName: string) {
    return tierUsers.filter((u) => u.categories.some((c) => c.name === categoryName)).length
  }

  function getCategorySponsor(categoryId: string) {
    return sponsors.find((s) => s.instrument_category_id === categoryId && s.active)
  }

  // --- Filtered users for "All" view ---
  const filteredUsers = users.filter((u) => {
    if (cityFilter && !u.city?.toLowerCase().includes(cityFilter.toLowerCase())) return false
    if (categoryFilter && categoryFilter !== 'all' && !u.categories.some((c) => c.name === categoryFilter)) return false
    if (planFilter && planFilter !== 'all' && u.plan !== planFilter) return false
    return true
  })

  // --- Category CRUD ---
  async function handleSaveCategory() {
    if (!categoryForm.name) return
    setSavingCategory(true)

    if (editingCategoryId) {
      // Update existing
      const slug = categoryForm.name.toLowerCase().replace(/[^a-zåäö0-9]+/g, '-')
      const { error } = await supabase
        .from('instrument_categories')
        .update({
          name: categoryForm.name,
          name_en: categoryForm.name_en || null,
          slug,
          sort_order: categoryForm.sort_order,
        } as never)
        .eq('id', editingCategoryId)
      if (error) {
        toast.error(error.message)
      } else {
        toast.success(t('categorySaved'))
        setCategoryDialogOpen(false)
        setEditingCategoryId(null)
        setCategoryForm({ name: '', name_en: '', sort_order: 0 })
        onReload()
      }
    } else {
      // Create new
      const slug = categoryForm.name.toLowerCase().replace(/[^a-zåäö0-9]+/g, '-')
      const { data: inserted, error } = await supabase
        .from('instrument_categories')
        .insert({
          name: categoryForm.name,
          name_en: categoryForm.name_en || null,
          slug,
          sort_order: categoryForm.sort_order,
        } as never)
        .select('id')
        .single()
      if (error) {
        toast.error(error.message)
      } else {
        toast.success(t('categorySaved'))
        setCategoryDialogOpen(false)
        const newName = categoryForm.name
        const newId = inserted.id
        setCategoryForm({ name: '', name_en: '', sort_order: 0 })
        onReload()

        // Auto-suggest: find users whose instruments_text mentions this category name
        const matches = users.filter(
          (u) => u.instruments_text && u.instruments_text.toLowerCase().includes(newName.toLowerCase()),
        )
        if (matches.length > 0) {
          setSuggestCategoryId(newId)
          setSuggestCategoryName(newName)
          setSuggestMatches(
            matches.map((u) => ({ user_id: u.user_id, email: u.email, company_name: u.company_name, selected: true })),
          )
          setSuggestDialogOpen(true)
        }
      }
    }
    setSavingCategory(false)
  }

  function openEditCategory(cat: InstrumentCategory) {
    setEditingCategoryId(cat.id)
    setCategoryForm({ name: cat.name, name_en: cat.name_en || '', sort_order: cat.sort_order || 0 })
    setCategoryDialogOpen(true)
  }

  async function handleDeleteCategory(id: string) {
    const { error } = await supabase.from('instrument_categories').delete().eq('id', id)
    if (error) {
      toast.error(error.message)
    } else {
      setCategories((prev) => prev.filter((c) => c.id !== id))
    }
  }

  async function handleRemoveUserCategory(userId: string, categoryId: string) {
    const user = users.find((u) => u.user_id === userId)
    if (!user) return
    const res = await fetch('/api/admin/assign-categories', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, category_id: categoryId }),
    })
    if (res.ok) {
      onUpdateUserCategories(
        userId,
        user.categories.filter((c) => c.id !== categoryId),
      )
    } else {
      toast.error('Could not remove category')
    }
  }

  async function handleAddUserCategory(userId: string, categoryId: string) {
    const user = users.find((u) => u.user_id === userId)
    if (!user) return
    const res = await fetch('/api/admin/assign-categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, category_ids: [categoryId] }),
    })
    if (res.ok) {
      const cat = categories.find((c) => c.id === categoryId)
      if (cat) {
        onUpdateUserCategories(userId, [...user.categories, { id: cat.id, name: cat.name }])
      }
      setAddingCategoryForUser(null)
      setAddCategoryId('')
    } else {
      toast.error('Could not add category')
    }
  }

  async function handleApplySuggestions() {
    const selected = suggestMatches.filter((m) => m.selected)
    if (selected.length === 0 || !suggestCategoryId) return
    setApplyingSuggestions(true)
    try {
      for (const m of selected) {
        await fetch('/api/admin/assign-categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: m.user_id, category_ids: [suggestCategoryId] }),
        })
      }
      toast.success(`${t('categoryAssigned')} (${selected.length})`)
      setSuggestDialogOpen(false)
      setSuggestMatches([])
      onReload()
    } catch {
      toast.error('Failed to assign')
    }
    setApplyingSuggestions(false)
  }

  // --- Sponsor CRUD ---
  const defaultSponsorForm = {
    name: '',
    logo_url: '',
    tagline: '',
    website_url: '',
    instrument_category_id: '',
    priority: 0,
    display_prefix: 'Sponsored by',
    target_country: '',
    target_cities: [] as string[],
  }

  function openEditSponsor(s: Sponsor) {
    setSponsorForm({
      name: s.name,
      logo_url: s.logo_url || '',
      tagline: s.tagline || '',
      website_url: s.website_url || '',
      instrument_category_id: s.instrument_category_id,
      priority: s.priority || 0,
      display_prefix: s.display_prefix || 'Sponsored by',
      target_country: s.target_country || '',
      target_cities: s.target_cities || [],
    })
    setEditingSponsorId(s.id)
    setSponsorDialogOpen(true)
  }

  function openNewSponsor() {
    setSponsorForm({ ...defaultSponsorForm })
    setEditingSponsorId(null)
    setSponsorDialogOpen(true)
  }

  async function handleSaveSponsor() {
    if (!sponsorForm.name || !sponsorForm.instrument_category_id) {
      toast.error(t('nameAndCategoryRequired'))
      return
    }
    setSavingSponsor(true)
    const data = {
      name: sponsorForm.name,
      logo_url: sponsorForm.logo_url || null,
      tagline: sponsorForm.tagline || null,
      website_url: sponsorForm.website_url || null,
      instrument_category_id: sponsorForm.instrument_category_id,
      priority: sponsorForm.priority,
      display_prefix: sponsorForm.display_prefix || 'Sponsored by',
      target_city: sponsorForm.target_cities[0] || null,
      target_country: sponsorForm.target_country || null,
      target_cities: sponsorForm.target_cities.length > 0 ? sponsorForm.target_cities : null,
    }

    const { error } = editingSponsorId
      ? await supabase
          .from('sponsors')
          .update(data as never)
          .eq('id', editingSponsorId)
      : await supabase.from('sponsors').insert({ ...data, active: true } as never)

    if (error) {
      toast.error(tToast('sponsorCreateError'))
    } else {
      toast.success(editingSponsorId ? tToast('sponsorUpdated') : tToast('sponsorCreated'))
      setSponsorDialogOpen(false)
      setSponsorForm({ ...defaultSponsorForm })
      setEditingSponsorId(null)
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

  // Month options for period filter (last 6 months)
  // Year options (current year + previous years back to 2024)
  const currentYear = new Date().getFullYear()
  const sponsorYearOptions = Array.from({ length: currentYear - 2023 }, (_, i) => {
    const year = currentYear - i
    const from = new Date(year, 0, 1).toISOString()
    const to = new Date(year, 11, 31, 23, 59, 59).toISOString()
    return { value: `${from}|${to}`, label: `${year}` }
  })

  // Month options (last 6 months)
  const sponsorMonthOptions = Array.from({ length: 6 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
    const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString()
    const label = d.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' })
    return { value: `${from}|${to}`, label }
  })

  // --- Sponsor Stats ---
  async function fetchSponsorStats(sponsorId: string, periodValue?: string) {
    setLoadingSponsorStats(true)
    const params = new URLSearchParams()
    const p = periodValue ?? sponsorStatsPeriod
    if (p !== 'all') {
      const [from, to] = p.split('|')
      if (from) params.set('from', from)
      if (to) params.set('to', to)
    }
    const res = await fetch(`/api/admin/sponsor-stats/${sponsorId}?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      setSponsorStats(data)
    }
    setLoadingSponsorStats(false)
  }

  function handleToggleSponsorStats(sponsorId: string) {
    if (expandedSponsorId === sponsorId) {
      setExpandedSponsorId(null)
      setSponsorStats(null)
    } else {
      setExpandedSponsorId(sponsorId)
      setSponsorStatsPeriod('all')
      fetchSponsorStats(sponsorId, 'all')
    }
  }

  function handleSponsorStatsPeriodChange(value: string, sponsorId: string) {
    setSponsorStatsPeriod(value)
    fetchSponsorStats(sponsorId, value)
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
      {/* Tier filter */}
      <div className="flex items-center gap-1.5">
        {['all', 'free', 'pro', 'team'].map((tier) => (
          <button
            key={tier}
            onClick={() => setTierFilter(tier)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              (tierFilter || 'all') === tier
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {tier === 'all' ? t('allPlans') : tier.charAt(0).toUpperCase() + tier.slice(1)}
            <span className="ml-1 opacity-70">
              ({tier === 'all' ? users.length : users.filter((u) => u.plan === tier).length})
            </span>
          </button>
        ))}
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <DashCard label={t('totalFreelancers')} value={tierUsers.length} icon={<Users className="h-4 w-4" />} />
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

      {/* Sponsor Coverage */}
      {coverage && (
        <Card>
          <CardContent className="py-4">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => setCoverageExpanded(!coverageExpanded)}
            >
              <div className="flex items-center gap-2">
                {coverageExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <h3 className="text-sm font-semibold">{t('sponsorCoverage')}</h3>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  {coverage.withSponsor}/{coverage.totalFreeUsers} {t('freeUsers')}
                </span>
                {coverage.withoutSponsor > 0 && (
                  <Badge variant="outline" className="text-amber-600 border-amber-300">
                    {coverage.withoutSponsor} {t('withoutSponsor')}
                  </Badge>
                )}
              </div>
            </div>
            {coverageExpanded && coverage.byCity.length > 0 && (
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">{t('city')}</TableHead>
                    <TableHead className="text-xs">{t('country')}</TableHead>
                    <TableHead className="text-xs text-right">{t('freeUsers')}</TableHead>
                    <TableHead className="text-xs text-right">{t('withSponsor')}</TableHead>
                    <TableHead className="text-xs text-right">{t('withoutSponsor')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coverage.byCity.map((row) => {
                    const without = row.freeUsers - row.withSponsor
                    return (
                      <TableRow
                        key={`${row.city}|${row.country}`}
                        className={without > 0 ? 'bg-amber-50 dark:bg-amber-950/20' : ''}
                      >
                        <TableCell className="text-xs">{row.city || t('noCitySet')}</TableCell>
                        <TableCell className="text-xs">{row.country || '—'}</TableCell>
                        <TableCell className="text-xs text-right">{row.freeUsers}</TableCell>
                        <TableCell className="text-xs text-right">{row.withSponsor}</TableCell>
                        <TableCell className="text-xs text-right font-medium">
                          {without > 0 ? <span className="text-amber-600">{without}</span> : '0'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

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
                setEditingCategoryId(null)
                setCategoryForm({ name: '', name_en: '', sort_order: 0 })
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
                        <p className="text-sm font-medium">
                          {c.name}
                          {c.name_en && <span className="text-muted-foreground font-normal"> / {c.name_en}</span>}
                        </p>
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
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditCategory(c)} className="h-7 w-7 p-0">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteCategory(c.id)}
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
                openNewSponsor()
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
                  const isExpanded = expandedSponsorId === s.id
                  return (
                    <div key={s.id} className="rounded bg-secondary/30 overflow-hidden">
                      <div className="flex items-center justify-between py-2 px-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => handleToggleSponsorStats(s.id)}
                              className="text-sm font-medium hover:underline flex items-center gap-1"
                            >
                              <BarChart3 className="h-3 w-3" />
                              {s.name}
                            </button>
                            <Badge variant="secondary" className="text-[10px]">
                              {s.category_name}
                            </Badge>
                            {s.target_country && (
                              <Badge variant="outline" className="text-[10px]">
                                {s.target_country}
                              </Badge>
                            )}
                            {s.target_cities && s.target_cities.length > 0 ? (
                              s.target_cities.map((city) => (
                                <Badge key={city} variant="outline" className="text-[10px]">
                                  {city}
                                </Badge>
                              ))
                            ) : s.target_city ? (
                              <Badge variant="outline" className="text-[10px]">
                                {s.target_city}
                              </Badge>
                            ) : null}
                            <span className="text-xs text-muted-foreground">
                              {reach} {t('freelancers')}
                            </span>
                            {!s.active && (
                              <Badge variant="destructive" className="text-[10px]">
                                {t('inactive')}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {s.display_prefix} {s.name}
                            {s.target_cities && s.target_cities.length > 0
                              ? ` (${s.target_cities.join(', ')})`
                              : s.target_country
                                ? ` (${s.target_country})`
                                : ` (${t('allCities')})`}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleToggleSponsorStats(s.id)}
                            title={t('sponsorStats')}
                          >
                            <BarChart3 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => openEditSponsor(s)}
                            title={t('editSponsor')}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
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

                      {/* Expanded sponsor stats panel */}
                      {isExpanded && (
                        <div className="border-t px-3 py-3 space-y-3 bg-background/50">
                          {loadingSponsorStats ? (
                            <div className="flex items-center gap-2 py-4 justify-center">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-xs text-muted-foreground">{tc('loading')}</span>
                            </div>
                          ) : sponsorStats ? (
                            <>
                              <div className="flex items-center justify-between">
                                <div className="grid grid-cols-3 gap-3">
                                  <div className="text-center px-4 py-2 rounded bg-secondary/50">
                                    <p className="text-lg font-bold">{sponsorStats.app}</p>
                                    <p className="text-[10px] text-muted-foreground">{t('appImpressions')}</p>
                                  </div>
                                  <div className="text-center px-4 py-2 rounded bg-secondary/50">
                                    <p className="text-lg font-bold">{sponsorStats.pdf}</p>
                                    <p className="text-[10px] text-muted-foreground">{t('pdfImpressions')}</p>
                                  </div>
                                  <div className="text-center px-4 py-2 rounded bg-secondary/50">
                                    <p className="text-lg font-bold">{sponsorStats.click}</p>
                                    <p className="text-[10px] text-muted-foreground">{t('clicks')}</p>
                                  </div>
                                </div>
                                <Select
                                  value={sponsorStatsPeriod}
                                  onValueChange={(v) => handleSponsorStatsPeriodChange(v, s.id)}
                                >
                                  <SelectTrigger className="w-[160px] h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="all">{t('allTime')}</SelectItem>
                                    {sponsorYearOptions.map((y) => (
                                      <SelectItem key={y.value} value={y.value}>
                                        {y.label}
                                      </SelectItem>
                                    ))}
                                    {sponsorMonthOptions.map((m) => (
                                      <SelectItem key={m.value} value={m.value}>
                                        {m.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {sponsorStats.byCity.length > 0 ? (
                                <div>
                                  <p className="text-xs font-medium mb-1">{t('perCity')}</p>
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">{t('city')}</TableHead>
                                        <TableHead className="text-xs">{t('country')}</TableHead>
                                        <TableHead className="text-xs text-right">{t('appImpressions')}</TableHead>
                                        <TableHead className="text-xs text-right">{t('pdfImpressions')}</TableHead>
                                        <TableHead className="text-xs text-right">{t('clicks')}</TableHead>
                                        <TableHead className="text-xs text-right">{t('total')}</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {sponsorStats.byCity.map((row) => (
                                        <TableRow key={`${row.city}-${row.country}`}>
                                          <TableCell className="text-xs">{row.city}</TableCell>
                                          <TableCell className="text-xs">{row.country}</TableCell>
                                          <TableCell className="text-xs text-right">{row.app}</TableCell>
                                          <TableCell className="text-xs text-right">{row.pdf}</TableCell>
                                          <TableCell className="text-xs text-right">{row.click}</TableCell>
                                          <TableCell className="text-xs text-right font-medium">{row.total}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground text-center py-2">{t('noImpressions')}</p>
                              )}
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground text-center py-2">{t('noImpressions')}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{t('sponsorPriorityInfo')}</span>
          </div>
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
                          <th className="p-2 text-left hidden sm:table-cell">{t('freeText')}</th>
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
                              <div className="flex flex-wrap gap-1 items-center">
                                {u.categories.map((c) => (
                                  <Badge key={c.id} variant="outline" className="text-[10px] gap-0.5 pr-0.5">
                                    {c.name}
                                    <button
                                      onClick={() => handleRemoveUserCategory(u.user_id, c.id)}
                                      className="ml-0.5 hover:text-destructive rounded-full"
                                    >
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  </Badge>
                                ))}
                                {addingCategoryForUser === u.user_id ? (
                                  <Select
                                    value={addCategoryId}
                                    onValueChange={(v) => {
                                      handleAddUserCategory(u.user_id, v)
                                    }}
                                  >
                                    <SelectTrigger className="h-5 w-24 text-[10px]">
                                      <SelectValue placeholder={t('category')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {categories
                                        .filter((cat) => !u.categories.some((uc) => uc.id === cat.id))
                                        .map((cat) => (
                                          <SelectItem key={cat.id} value={cat.id} className="text-xs">
                                            {cat.name}
                                          </SelectItem>
                                        ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <button
                                    onClick={() => setAddingCategoryForUser(u.user_id)}
                                    className="h-4 w-4 flex items-center justify-center rounded-full border border-dashed text-muted-foreground hover:text-foreground hover:border-foreground"
                                  >
                                    <Plus className="h-2.5 w-2.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="p-2 hidden sm:table-cell text-muted-foreground max-w-[200px] truncate">
                              {u.instruments_text || '—'}
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

      {/* Category Dialog (Create / Edit) */}
      <Dialog
        open={categoryDialogOpen}
        onOpenChange={(open) => {
          setCategoryDialogOpen(open)
          if (!open) {
            setEditingCategoryId(null)
            setCategoryForm({ name: '', name_en: '', sort_order: 0 })
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategoryId ? t('editCategory') : t('newCategory')}</DialogTitle>
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
              <Label>{t('categoryNameEn')}</Label>
              <Input
                value={categoryForm.name_en}
                onChange={(e) => setCategoryForm((f) => ({ ...f, name_en: e.target.value }))}
                placeholder="Strings / Photographer / Music teacher"
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
            <Button onClick={handleSaveCategory} disabled={savingCategory}>
              {savingCategory && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingCategoryId ? tc('save') : tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-suggest Dialog */}
      <Dialog open={suggestDialogOpen} onOpenChange={setSuggestDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('suggestAssignTitle')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('suggestAssignDesc', { count: suggestMatches.length, category: suggestCategoryName })}
          </p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {suggestMatches.map((m) => (
              <label key={m.user_id} className="flex items-center gap-2 py-1">
                <Checkbox
                  checked={m.selected}
                  onCheckedChange={(checked) =>
                    setSuggestMatches((prev) =>
                      prev.map((p) => (p.user_id === m.user_id ? { ...p, selected: !!checked } : p)),
                    )
                  }
                />
                <span className="text-sm">{m.email || m.user_id}</span>
                {m.company_name && <span className="text-xs text-muted-foreground">({m.company_name})</span>}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuggestDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleApplySuggestions} disabled={applyingSuggestions}>
              {applyingSuggestions && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('assignCategory')} ({suggestMatches.filter((m) => m.selected).length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sponsor Dialog */}
      <Dialog open={sponsorDialogOpen} onOpenChange={setSponsorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSponsorId ? t('editSponsor') : t('newSponsor')}</DialogTitle>
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
              <Label>{t('logo')}</Label>
              <div className="flex items-center gap-3">
                <div className="w-20 h-14 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50 shrink-0">
                  {sponsorForm.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin preview of externally hosted sponsor logo
                    <img src={sponsorForm.logo_url} alt="Logo" className="max-w-full max-h-full object-contain p-1" />
                  ) : (
                    <ImageIcon className="h-5 w-5 text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex flex-col gap-1">
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 500 * 1024) {
                        toast.error('Max 500 KB')
                        return
                      }
                      const reader = new FileReader()
                      reader.onloadend = () => {
                        setSponsorForm((f) => ({ ...f, logo_url: reader.result as string }))
                      }
                      reader.readAsDataURL(file)
                    }}
                  />
                  <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                    {t('uploadLogo')}
                  </Button>
                  {sponsorForm.logo_url && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-7"
                      onClick={() => {
                        setSponsorForm((f) => ({ ...f, logo_url: '' }))
                        if (logoInputRef.current) logoInputRef.current.value = ''
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      {tc('delete')}
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('targetCountry')}</Label>
              <Select
                value={sponsorForm.target_country || 'all'}
                onValueChange={(v) => setSponsorForm((f) => ({ ...f, target_country: v === 'all' ? '' : v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('allCountries')}</SelectItem>
                  <SelectItem value="SE">Sverige (SE)</SelectItem>
                  <SelectItem value="NO">Norge (NO)</SelectItem>
                  <SelectItem value="DK">Danmark (DK)</SelectItem>
                  <SelectItem value="FI">Finland (FI)</SelectItem>
                  <SelectItem value="DE">Tyskland (DE)</SelectItem>
                  <SelectItem value="GB">Storbritannien (GB)</SelectItem>
                  <SelectItem value="US">USA (US)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('targetCities')}</Label>
              <p className="text-[11px] text-muted-foreground">{t('targetCitiesHint')}</p>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {uniqueCities.map(([city, count]) => {
                  const selected = sponsorForm.target_cities.includes(city)
                  return (
                    <button
                      key={city}
                      type="button"
                      onClick={() =>
                        setSponsorForm((f) => ({
                          ...f,
                          target_cities: selected
                            ? f.target_cities.filter((c) => c !== city)
                            : [...f.target_cities, city],
                        }))
                      }
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                        selected
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {city}
                      <span className="opacity-70">({count})</span>
                    </button>
                  )
                })}
                {uniqueCities.length === 0 && (
                  <span className="text-xs text-muted-foreground">{t('noCitiesFound')}</span>
                )}
              </div>
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
            <Button onClick={handleSaveSponsor} disabled={savingSponsor}>
              {savingSponsor && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingSponsorId ? tc('save') : tc('create')}
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
