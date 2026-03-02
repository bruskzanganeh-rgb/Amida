import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import { logActivity } from '@/lib/activity'
import { createUserSchema } from '@/lib/schemas/admin'

export async function GET() {
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  // Fetch all data in parallel
  const [
    { data: subscriptions },
    { data: settings },
    { data: members },
    { data: companiesData },
    { data: userCategoriesData },
  ] = await Promise.all([
    supabase
      .from('subscriptions')
      .select(
        'user_id, plan, status, stripe_customer_id, stripe_price_id, current_period_end, cancel_at_period_end, created_at, admin_override',
      )
      .order('created_at', { ascending: false }),
    supabase
      .from('company_settings')
      .select('user_id, company_name, org_number, email, address, phone, instruments_text'),
    supabase.from('company_members').select('user_id, company_id, role'),
    supabase.from('companies').select('id, postal_code, city, country_code'),
    supabase.from('user_categories').select('user_id, category_id, category:instrument_categories(name)'),
  ])

  const settingsMap = new Map((settings || []).map((s) => [s.user_id, s]))

  // Build companies map (company_id -> company data)
  const companiesDataMap = new Map<
    string,
    { postal_code: string | null; city: string | null; country_code: string | null }
  >()
  for (const c of companiesData || []) {
    companiesDataMap.set(c.id, { postal_code: c.postal_code, city: c.city, country_code: c.country_code })
  }

  // Build categories map (user_id -> { id, name }[])
  const categoriesMap = new Map<string, { id: string; name: string }[]>()
  for (const uc of userCategoriesData || []) {
    const category = uc.category as unknown as { name: string } | null
    if (!category) continue
    if (!categoriesMap.has(uc.user_id)) categoriesMap.set(uc.user_id, [])
    const list = categoriesMap.get(uc.user_id)!
    if (!list.some((c) => c.id === uc.category_id)) list.push({ id: uc.category_id, name: category.name })
  }

  // Build membership maps
  const userToMembership = new Map<string, { company_id: string; role: string }>()
  const companyMembers = new Map<string, { user_id: string; role: string; email: string | null }[]>()
  for (const m of members || []) {
    userToMembership.set(m.user_id, { company_id: m.company_id, role: m.role })
    if (!companyMembers.has(m.company_id)) companyMembers.set(m.company_id, [])
    companyMembers.get(m.company_id)!.push({
      user_id: m.user_id,
      role: m.role,
      email: settingsMap.get(m.user_id)?.email || null,
    })
  }

  // Build user -> company data map (via company_members -> companies)
  const companiesMap = new Map<
    string,
    { postal_code: string | null; city: string | null; country_code: string | null }
  >()
  for (const m of members || []) {
    const companyData = companiesDataMap.get(m.company_id)
    if (companyData) {
      companiesMap.set(m.user_id, companyData)
    }
  }

  // Set of user_ids that are non-owner members (they'll be nested under their company's owner)
  const nonOwnerMemberIds = new Set<string>()
  for (const m of members || []) {
    if (m.role !== 'owner') nonOwnerMemberIds.add(m.user_id)
  }

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  // Include ALL user IDs (owners + members) for stats
  const ownerUserIds = (subscriptions || []).map((s) => s.user_id)
  const allUserIds = [...new Set([...ownerUserIds, ...(members || []).map((m) => m.user_id)])]

  type UserStats = {
    user_id: string
    invoice_count: number
    client_count: number
    position_count: number
    gig_type_count: number
    expense_count: number
    gig_count: number
  }

  const [statsData, usageData] = await Promise.all([
    supabase
      .rpc('admin_user_stats' as never, { p_user_ids: allUserIds } as never)
      .then((r: { data: UserStats[] | null }) => r.data),
    supabase
      .from('usage_tracking')
      .select('user_id, invoice_count, receipt_scan_count')
      .in('user_id', allUserIds)
      .eq('year', year)
      .eq('month', month)
      .then((r) => r.data),
  ])

  const statsMap = new Map<
    string,
    {
      invoice_count: number
      client_count: number
      position_count: number
      gig_type_count: number
      expense_count: number
      gig_count: number
    }
  >()
  if (statsData) {
    for (const s of statsData) {
      statsMap.set(s.user_id, s)
    }
  }

  const usageMap = new Map<string, { invoices: number; scans: number }>()
  if (usageData) {
    for (const u of usageData) {
      usageMap.set(u.user_id, {
        invoices: u.invoice_count || 0,
        scans: u.receipt_scan_count || 0,
      })
    }
  }

  // Only show owners and users without a company (legacy/not onboarded)
  // Non-owner members are nested under their company's owner
  const users = (subscriptions || [])
    .filter((sub) => !nonOwnerMemberIds.has(sub.user_id))
    .map((sub) => {
      const stats = statsMap.get(sub.user_id)
      const membership = userToMembership.get(sub.user_id)
      const membersList = membership ? companyMembers.get(membership.company_id) || [] : []

      // Enrich members with per-user stats
      const enrichedMembers = membersList.map((m) => {
        const mStats = statsMap.get(m.user_id)
        return {
          ...m,
          gig_count: mStats?.gig_count || 0,
          invoice_count: mStats?.invoice_count || 0,
          expense_count: mStats?.expense_count || 0,
        }
      })

      return {
        ...sub,
        company_name: settingsMap.get(sub.user_id)?.company_name || null,
        org_number: settingsMap.get(sub.user_id)?.org_number || null,
        email: settingsMap.get(sub.user_id)?.email || null,
        address: settingsMap.get(sub.user_id)?.address || null,
        phone: settingsMap.get(sub.user_id)?.phone || null,
        instruments_text: settingsMap.get(sub.user_id)?.instruments_text || null,
        gig_count: stats?.gig_count || 0,
        invoice_count: stats?.invoice_count || 0,
        client_count: stats?.client_count || 0,
        position_count: stats?.position_count || 0,
        gig_type_count: stats?.gig_type_count || 0,
        expense_count: stats?.expense_count || 0,
        monthly_invoices: usageMap.get(sub.user_id)?.invoices || 0,
        monthly_scans: usageMap.get(sub.user_id)?.scans || 0,
        city: companiesMap.get(sub.user_id)?.city || null,
        postal_code: companiesMap.get(sub.user_id)?.postal_code || null,
        country_code: companiesMap.get(sub.user_id)?.country_code || null,
        categories: categoriesMap.get(sub.user_id) || [],
        members: enrichedMembers,
      }
    })

  return NextResponse.json({ users })
}

export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, supabase } = auth

  const body = await request.json()
  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })
  }
  const { email, password, company_name, full_name, mode } = parsed.data

  let newUserId: string

  if (mode === 'create') {
    const { data: newUser, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: full_name ? { full_name } : undefined,
    })
    if (error || !newUser.user) {
      return NextResponse.json({ error: error?.message || 'Failed to create user' }, { status: 500 })
    }
    newUserId = newUser.user.id
  } else {
    const { data: invited, error } = await supabase.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://amida.babalisk.com'}/auth/confirm`,
      data: full_name ? { full_name } : undefined,
    })
    if (error || !invited.user) {
      return NextResponse.json({ error: error?.message || 'Failed to invite user' }, { status: 500 })
    }
    newUserId = invited.user.id
  }

  // Create company_settings (all NOT NULL text columns need empty-string defaults)
  await supabase.from('company_settings').insert({
    user_id: newUserId,
    company_name: company_name || '',
    org_number: '',
    address: '',
    email,
    phone: '',
    bank_account: '',
    base_currency: 'SEK',
    onboarding_completed: false,
  })

  // Create subscription (free plan)
  await supabase.from('subscriptions').insert({
    user_id: newUserId,
    plan: 'free',
    status: 'active',
  })

  await logActivity({
    userId,
    eventType: 'user_created',
    entityType: 'user',
    entityId: newUserId,
    metadata: { mode, email, created_by: userId },
  })

  return NextResponse.json({ success: true, userId: newUserId, mode })
}
