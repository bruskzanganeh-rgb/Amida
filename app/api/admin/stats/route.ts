import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'

export async function GET(request: NextRequest) {
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  // Count all users
  const { count: totalUsers } = await supabase.from('subscriptions').select('*', { count: 'exact', head: true })

  // Fetch active pro subscriptions with price_id for MRR calculation
  const { data: proSubs } = await supabase
    .from('subscriptions')
    .select('stripe_price_id')
    .eq('plan', 'pro')
    .eq('status', 'active')

  const proUsers = proSubs?.length || 0
  const freeUsers = (totalUsers || 0) - proUsers

  // Calculate accurate MRR based on plan type
  const monthlyPriceId = process.env.STRIPE_PRO_MONTHLY_PRICE_ID
  const yearlyPriceId = process.env.STRIPE_PRO_YEARLY_PRICE_ID

  const monthlySubscribers = proSubs?.filter((s) => s.stripe_price_id === monthlyPriceId).length || 0
  const yearlySubscribers = proSubs?.filter((s) => s.stripe_price_id === yearlyPriceId).length || 0
  const adminSetPro = proUsers - monthlySubscribers - yearlySubscribers

  const mrr = monthlySubscribers * 49 + yearlySubscribers * Math.round(499 / 12)
  const arr = mrr * 12

  // Sponsor impression time filtering
  const from = request.nextUrl.searchParams.get('from')
  const to = request.nextUrl.searchParams.get('to')

  // Total sponsor impressions (filtered)
  let totalQuery = supabase.from('sponsor_impressions').select('*', { count: 'exact', head: true })
  if (from) totalQuery = totalQuery.gte('created_at', from)
  if (to) totalQuery = totalQuery.lt('created_at', to)
  const { count: totalImpressions } = await totalQuery

  // Per-sponsor impression breakdown with type
  let impressionQuery = supabase
    .from('sponsor_impressions')
    .select('sponsor_id, impression_type, created_at, sponsor:sponsors(name)')
    .order('created_at', { ascending: false })
  if (from) impressionQuery = impressionQuery.gte('created_at', from)
  if (to) impressionQuery = impressionQuery.lt('created_at', to)
  const { data: impressionRows } = await impressionQuery

  const sponsorStats: Record<
    string,
    { name: string; app: number; pdf: number; click: number; total: number; latest: string }
  > = {}
  for (const row of impressionRows || []) {
    const id = row.sponsor_id
    const name = (row.sponsor as unknown as { name: string } | null)?.name || 'Unknown'
    const type = row.impression_type || 'pdf'
    if (!sponsorStats[id]) {
      sponsorStats[id] = { name, app: 0, pdf: 0, click: 0, total: 0, latest: row.created_at || '' }
    }
    if (type === 'app') sponsorStats[id].app++
    else if (type === 'click') sponsorStats[id].click++
    else sponsorStats[id].pdf++
    sponsorStats[id].total++
  }
  const sponsorImpressionBreakdown = Object.entries(sponsorStats)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => b.total - a.total)

  return NextResponse.json({
    totalUsers: totalUsers || 0,
    proUsers,
    freeUsers,
    mrr,
    arr,
    monthlySubscribers,
    yearlySubscribers,
    adminSetPro,
    totalImpressions: totalImpressions || 0,
    sponsorImpressionBreakdown,
  })
}
