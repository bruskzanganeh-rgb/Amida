import { createAdminClient } from '@/lib/supabase/admin'

type Plan = 'free' | 'pro' | 'team'

async function getTierLimits(supabaseAdmin: ReturnType<typeof createAdminClient>, plan: Plan) {
  const { data } = await supabaseAdmin
    .from('platform_config')
    .select('key, value')
    .in('key', [
      `${plan}_invoice_limit`,
      `${plan}_receipt_scan_limit`,
      `${plan}_email_send_limit`,
      `${plan}_storage_mb`,
    ])

  const config: Record<string, string> = {}
  data?.forEach((d) => {
    config[d.key] = d.value
  })

  return {
    invoices: parseInt(config[`${plan}_invoice_limit`] || '0'),
    receiptScans: parseInt(config[`${plan}_receipt_scan_limit`] || '0'),
    emailSends: parseInt(config[`${plan}_email_send_limit`] || '0'),
    storageMb: parseInt(config[`${plan}_storage_mb`] || '0'),
  }
}

export async function incrementUsage(userId: string, type: 'invoice' | 'receipt_scan' | 'email_send') {
  const supabaseAdmin = createAdminClient()
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const { data: existing } = await supabaseAdmin
    .from('usage_tracking')
    .select('id, invoice_count, receipt_scan_count, email_send_count')
    .eq('user_id', userId)
    .eq('year', year)
    .eq('month', month)
    .single()

  const fieldMap = {
    invoice: 'invoice_count',
    receipt_scan: 'receipt_scan_count',
    email_send: 'email_send_count',
  } as const

  const countMap = {
    invoice: existing?.invoice_count,
    receipt_scan: existing?.receipt_scan_count,
    email_send: existing?.email_send_count,
  } as const

  if (existing) {
    const field = fieldMap[type]
    const currentCount = countMap[type]
    await supabaseAdmin
      .from('usage_tracking')
      .update({ [field]: (currentCount ?? 0) + 1 })
      .eq('id', existing.id)
  } else {
    await supabaseAdmin.from('usage_tracking').insert({
      user_id: userId,
      year,
      month,
      invoice_count: type === 'invoice' ? 1 : 0,
      receipt_scan_count: type === 'receipt_scan' ? 1 : 0,
      email_send_count: type === 'email_send' ? 1 : 0,
    })
  }
}

export async function checkUsageLimit(
  userId: string,
  type: 'invoice' | 'receipt_scan' | 'email_send',
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const supabaseAdmin = createAdminClient()
  const { data: subscription } = await supabaseAdmin
    .from('subscriptions')
    .select('plan, status')
    .eq('user_id', userId)
    .single()

  const plan: Plan =
    subscription?.status === 'active' && (subscription?.plan === 'pro' || subscription?.plan === 'team')
      ? (subscription.plan as Plan)
      : 'free'

  const tierLimits = await getTierLimits(supabaseAdmin, plan)
  const rawLimitMap = {
    invoice: tierLimits.invoices,
    receipt_scan: tierLimits.receiptScans,
    email_send: tierLimits.emailSends,
  } as const
  const rawLimit = rawLimitMap[type]
  const limit = rawLimit === 0 ? Infinity : rawLimit

  if (limit === Infinity) {
    return { allowed: true, current: 0, limit: Infinity }
  }

  const now = new Date()
  const { data: usage } = await supabaseAdmin
    .from('usage_tracking')
    .select('invoice_count, receipt_scan_count, email_send_count')
    .eq('user_id', userId)
    .eq('year', now.getFullYear())
    .eq('month', now.getMonth() + 1)
    .single()

  const currentMap = {
    invoice: usage?.invoice_count || 0,
    receipt_scan: usage?.receipt_scan_count || 0,
    email_send: usage?.email_send_count || 0,
  } as const
  const current = currentMap[type]

  return { allowed: current < limit, current, limit }
}

export async function checkStorageQuota(userId: string): Promise<{
  allowed: boolean
  usedBytes: number
  limitBytes: number
  plan: string
}> {
  const supabaseAdmin = createAdminClient()
  const { data: sub } = await supabaseAdmin.from('subscriptions').select('plan, status').eq('user_id', userId).single()

  const plan: Plan =
    sub?.status === 'active' && (sub?.plan === 'pro' || sub?.plan === 'team') ? (sub.plan as Plan) : 'free'

  const tierLimits = await getTierLimits(supabaseAdmin, plan)
  const limitBytes = tierLimits.storageMb === 0 ? Infinity : tierLimits.storageMb * 1024 * 1024

  const { data: attRows } = await supabaseAdmin.from('gig_attachments').select('file_size').eq('user_id', userId)

  const attBytes = (attRows || []).reduce((sum, r) => sum + (r.file_size || 0), 0)

  const { data: expRows } = await supabaseAdmin
    .from('expenses')
    .select('file_size')
    .eq('user_id', userId)
    .not('attachment_url', 'is', null)

  const expBytes = (expRows || []).reduce((sum, r) => sum + (r.file_size || 0), 0)

  const usedBytes = attBytes + expBytes

  return { allowed: usedBytes < limitBytes, usedBytes, limitBytes, plan }
}
