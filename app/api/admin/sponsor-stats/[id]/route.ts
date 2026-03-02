import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sponsorId } = await params
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')

  // Fetch raw impressions with user's city/country via company_members → companies
  let query = supabase
    .from('sponsor_impressions')
    .select('impression_type, user_id, created_at')
    .eq('sponsor_id', sponsorId)
    .order('created_at', { ascending: false })

  if (from) query = query.gte('created_at', from)
  if (to) query = query.lt('created_at', to)

  const { data: impressions, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!impressions || impressions.length === 0) {
    return NextResponse.json({
      app: 0,
      pdf: 0,
      click: 0,
      total: 0,
      byCity: [],
    })
  }

  // Get unique user IDs and fetch their city/country
  const userIds = [...new Set(impressions.map((i) => i.user_id))]
  const { data: members } = await supabase.from('company_members').select('user_id, company_id').in('user_id', userIds)

  const companyIds = [...new Set((members || []).map((m) => m.company_id))]
  const { data: companies } = await supabase.from('companies').select('id, city, country_code').in('id', companyIds)

  // Build user → { city, country } map
  const companyMap = new Map<string, { city: string | null; country_code: string | null }>()
  for (const c of companies || []) companyMap.set(c.id, { city: c.city, country_code: c.country_code })

  const userGeoMap = new Map<string, { city: string | null; country: string | null }>()
  for (const m of members || []) {
    const comp = companyMap.get(m.company_id)
    if (comp) userGeoMap.set(m.user_id, { city: comp.city, country: comp.country_code })
  }

  // Aggregate totals
  let app = 0,
    pdf = 0,
    click = 0

  // Aggregate by city
  const cityStats: Record<string, { city: string; country: string; app: number; pdf: number; click: number }> = {}

  for (const imp of impressions) {
    const type = imp.impression_type || 'pdf'
    if (type === 'app') app++
    else if (type === 'click') click++
    else pdf++

    const geo = userGeoMap.get(imp.user_id)
    const city = geo?.city || '—'
    const country = geo?.country || '—'
    const key = `${city}|${country}`

    if (!cityStats[key]) cityStats[key] = { city, country, app: 0, pdf: 0, click: 0 }
    if (type === 'app') cityStats[key].app++
    else if (type === 'click') cityStats[key].click++
    else cityStats[key].pdf++
  }

  const byCity = Object.values(cityStats)
    .map((s) => ({ ...s, total: s.app + s.pdf + s.click }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    app,
    pdf,
    click,
    total: app + pdf + click,
    byCity,
  })
}
