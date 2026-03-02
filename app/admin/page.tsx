'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageTransition } from '@/components/ui/page-transition'
import {
  Shield,
  Award,
  TrendingUp,
  Settings,
  Building2,
  ScrollText,
  Activity,
  CreditCard,
  Ticket,
  PenLine,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'

import { SponsorsHub } from '@/components/admin/sponsors-hub'
import { StatsTab } from '@/components/admin/stats-tab'
import { ConfigTab } from '@/components/admin/config-tab'
import { OrganizationsTab } from '@/components/admin/organizations-tab'
import { AuditTab } from '@/components/admin/audit-tab'
import { SessionsTab } from '@/components/admin/sessions-tab'
import { StripeTab } from '@/components/admin/stripe-tab'
import { InvitationsTab } from '@/components/admin/invitations-tab'
import { ContractsTab } from '@/components/admin/contracts-tab'

type User = {
  user_id: string
  plan: string
  status: string
  stripe_customer_id: string | null
  stripe_price_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  admin_override: boolean
  created_at: string
  company_name: string | null
  org_number: string | null
  email: string | null
  address: string | null
  phone: string | null
  gig_count: number
  invoice_count: number
  client_count: number
  position_count: number
  gig_type_count: number
  expense_count: number
  monthly_invoices: number
  monthly_scans: number
  city: string | null
  postal_code: string | null
  country_code: string | null
  categories: string[]
  last_active?: string | null
  recent_activity_count?: number
  members?: {
    user_id: string
    role: string
    email: string | null
    gig_count: number
    invoice_count: number
    expense_count: number
  }[]
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
  category_name?: string
}

type Stats = {
  totalUsers: number
  proUsers: number
  freeUsers: number
  mrr: number
  arr: number
  monthlySubscribers: number
  yearlySubscribers: number
  adminSetPro: number
  totalImpressions: number
}

type InstrumentCategory = {
  id: string
  name: string
  slug?: string
  sort_order?: number
  instrument_count?: number
}

type ConfigEntry = {
  key: string
  value: string
}

export default function AdminPage() {
  const t = useTranslations('admin')

  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()

  const currentTab = searchParams.get('tab') || 'organizations'

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  // Data
  const [users, setUsers] = useState<User[]>([])
  const [sponsors, setSponsors] = useState<Sponsor[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [categories, setCategories] = useState<InstrumentCategory[]>([])
  const [stripeData, setStripeData] = useState<{
    metrics: {
      mrr: number
      arr: number
      monthlyCount: number
      yearlyCount: number
      adminSetCount: number
      activePro: number
      cancelingCount: number
      pastDueCount: number
    }
    events: {
      id: number
      table_name: string
      record_id: string
      action: string
      old_data: Record<string, unknown> | null
      new_data: Record<string, unknown> | null
      changed_fields: string[] | null
      user_id: string | null
      created_at: string
    }[]
    webhookUrl: string
    webhookConfigured: boolean
  } | null>(null)

  // Config
  const [configValues, setConfigValues] = useState<Record<string, string>>({})
  const [savingConfig, setSavingConfig] = useState(false)

  async function checkAdmin() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/dashboard')
      return
    }

    const { data } = await (
      supabase.rpc as unknown as (fn: string, params: Record<string, string>) => Promise<{ data: unknown }>
    )('is_admin', { uid: user.id })
    if (!data) {
      router.push('/dashboard')
      return
    }

    setIsAdmin(true)
    setLoading(false)
    loadData()
  }

  async function loadData() {
    // Categories
    const { data: cats } = await supabase
      .from('instrument_categories')
      .select('id, name, slug, sort_order, instruments(count)')
      .order('sort_order')
    if (cats)
      setCategories(
        cats.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          sort_order: c.sort_order,
          instrument_count: (c.instruments as unknown as { count: number }[])?.[0]?.count || 0,
        })),
      )

    // Users
    const usersRes = await fetch('/api/admin/users')
    if (usersRes.ok) {
      const { users: userData } = await usersRes.json()
      setUsers(userData || [])
    }

    // Sponsors
    const { data: sponsorData } = await supabase
      .from('sponsors')
      .select(
        'id, name, logo_url, tagline, website_url, instrument_category_id, active, priority, display_prefix, target_city, category:instrument_categories(name)',
      )
      .order('priority', { ascending: false })
    if (sponsorData) {
      setSponsors(
        sponsorData.map((s) => ({
          id: s.id,
          name: s.name,
          logo_url: s.logo_url,
          tagline: s.tagline,
          website_url: s.website_url,
          instrument_category_id: s.instrument_category_id,
          active: s.active,
          priority: s.priority,
          display_prefix: s.display_prefix,
          target_city: s.target_city,
          category_name: (s.category as unknown as { name: string } | null)?.name,
        })),
      )
    }

    // Stats
    const statsRes = await fetch('/api/admin/stats')
    if (statsRes.ok) {
      const statsData = await statsRes.json()
      setStats(statsData)
    }

    // Config
    const configRes = await fetch('/api/admin/config')
    if (configRes.ok) {
      const { config } = await configRes.json()
      if (config) {
        const map: Record<string, string> = {}
        config.forEach((c: ConfigEntry) => {
          map[c.key] = c.value
        })
        setConfigValues(map)
      }
    }

    // Stripe
    const stripeRes = await fetch('/api/admin/stripe')
    if (stripeRes.ok) {
      const stripeJson = await stripeRes.json()
      setStripeData(stripeJson)
    }
  }

  useEffect(() => {
    checkAdmin()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: checkAdmin loads initial data once
  }, [])

  async function handleSaveConfig() {
    setSavingConfig(true)
    for (const [key, value] of Object.entries(configValues)) {
      await fetch('/api/admin/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
    }
    toast.success(t('savedConfig'))
    setSavingConfig(false)
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-red-600" />
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">{t('title')}</h1>
            <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>

        <Tabs value={currentTab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="organizations" className="gap-1.5">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t('companies')}</span>
            </TabsTrigger>
            <TabsTrigger value="sponsors" className="gap-1.5">
              <Award className="h-4 w-4" />
              <span className="hidden sm:inline">{t('sponsors')}</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">{t('statistics')}</span>
            </TabsTrigger>
            <TabsTrigger value="stripe" className="gap-1.5">
              <CreditCard className="h-4 w-4" />
              <span className="hidden sm:inline">{t('stripe')}</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <ScrollText className="h-4 w-4" />
              <span className="hidden sm:inline">{t('audit')}</span>
            </TabsTrigger>
            <TabsTrigger value="sessions" className="gap-1.5">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">{t('sessions')}</span>
            </TabsTrigger>
            <TabsTrigger value="invitations" className="gap-1.5">
              <Ticket className="h-4 w-4" />
              <span className="hidden sm:inline">{t('invitations')}</span>
            </TabsTrigger>
            <TabsTrigger value="contracts" className="gap-1.5">
              <PenLine className="h-4 w-4" />
              <span className="hidden sm:inline">Contracts</span>
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-1.5">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">{t('config')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organizations" className="mt-4">
            <OrganizationsTab users={users} setUsers={setUsers} onReload={() => loadData()} />
          </TabsContent>
          <TabsContent value="sponsors" className="mt-4">
            <SponsorsHub
              sponsors={sponsors}
              setSponsors={setSponsors}
              categories={categories}
              setCategories={setCategories}
              users={users}
              onReload={() => loadData()}
            />
          </TabsContent>
          <TabsContent value="stats" className="mt-4">
            <StatsTab stats={stats} />
          </TabsContent>
          <TabsContent value="stripe" className="mt-4">
            <StripeTab data={stripeData} />
          </TabsContent>
          <TabsContent value="audit" className="mt-4">
            <AuditTab users={users} />
          </TabsContent>
          <TabsContent value="sessions" className="mt-4">
            <SessionsTab users={users} />
          </TabsContent>
          <TabsContent value="invitations" className="mt-4">
            <InvitationsTab />
          </TabsContent>
          <TabsContent value="contracts" className="mt-4">
            <ContractsTab />
          </TabsContent>
          <TabsContent value="config" className="mt-4">
            <ConfigTab
              configValues={configValues}
              setConfigValues={setConfigValues}
              savingConfig={savingConfig}
              onSave={handleSaveConfig}
            />
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  )
}
