import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'

export async function GET() {
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  // 1. Subscription overview (exclude E2E test company)
  const { data: subs } = await supabase
    .from('subscriptions')
    .select('plan, status, stripe_price_id, cancel_at_period_end, stripe_customer_id, company_id')
    .neq('company_id', '11111111-1111-1111-1111-111111111111')

  const allSubs = subs || []
  const proSubs = allSubs.filter((s) => s.plan === 'pro')

  const monthlyPriceId = process.env.STRIPE_PRO_MONTHLY_PRICE_ID
  const yearlyPriceId = process.env.STRIPE_PRO_YEARLY_PRICE_ID

  const monthlyCount = proSubs.filter((s) => s.stripe_price_id === monthlyPriceId).length
  const yearlyCount = proSubs.filter((s) => s.stripe_price_id === yearlyPriceId).length
  const adminSetCount = proSubs.length - monthlyCount - yearlyCount
  const cancelingCount = proSubs.filter((s) => s.cancel_at_period_end).length
  const pastDueCount = allSubs.filter((s) => s.status === 'past_due').length

  const mrr = monthlyCount * 99 + yearlyCount * Math.round(719 / 12)
  const arr = mrr * 12

  // 2. Recent webhook events from audit_logs (exclude E2E test company)
  const TEST_COMPANY_ID = '11111111-1111-1111-1111-111111111111'
  const { data: events } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('table_name', 'subscriptions')
    .not('new_data->>company_id', 'eq', TEST_COMPANY_ID)
    .order('created_at', { ascending: false })
    .limit(20)

  // 3. Webhook config
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/stripe/webhook`
  const webhookConfigured = !!process.env.STRIPE_WEBHOOK_SECRET

  return NextResponse.json({
    metrics: {
      mrr,
      arr,
      monthlyCount,
      yearlyCount,
      adminSetCount,
      activePro: proSubs.length,
      cancelingCount,
      pastDueCount,
    },
    events: events || [],
    webhookUrl,
    webhookConfigured,
  })
}
