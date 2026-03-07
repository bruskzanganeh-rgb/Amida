import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Apple App Store Server Notifications V2
 *
 * Apple sends signed JWS notifications for subscription lifecycle events.
 * Configure this URL in App Store Connect:
 *   https://amida.babalisk.com/api/iap/webhook
 *
 * Reference: https://developer.apple.com/documentation/appstoreservernotifications
 */

// Map Apple product IDs to Amida plan names
const PRODUCT_TO_PLAN: Record<string, 'pro' | 'team'> = {
  amida_pro_monthly: 'pro',
  amida_pro_yearly: 'pro',
  amida_team_monthly: 'team',
  amida_team_yearly: 'team',
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { signedPayload } = body

    if (!signedPayload) {
      return NextResponse.json({ error: 'Missing signedPayload' }, { status: 400 })
    }

    // Decode the JWS payload (header.payload.signature)
    const notification = decodeJWS(signedPayload)
    if (!notification) {
      return NextResponse.json({ error: 'Invalid JWS' }, { status: 400 })
    }

    const notificationType = notification.notificationType as string
    const subtype = notification.subtype as string | undefined
    const data = notification.data as Record<string, unknown> | undefined

    // The transaction info is also a signed JWS
    const transactionInfo =
      typeof data?.signedTransactionInfo === 'string' ? decodeJWS(data.signedTransactionInfo) : null
    const renewalInfo = typeof data?.signedRenewalInfo === 'string' ? decodeJWS(data.signedRenewalInfo) : null

    if (!transactionInfo) {
      console.error('Apple webhook: no transaction info in notification', notificationType)
      return NextResponse.json({ received: true })
    }

    const appAccountToken = transactionInfo.appAccountToken as string | undefined
    const productId = transactionInfo.productId as string
    const originalTransactionId = transactionInfo.originalTransactionId as string
    const expiresDate = transactionInfo.expiresDate as number | undefined

    // appAccountToken is set to user_id during purchase (if configured)
    // Fall back to looking up by apple_transaction_id
    const admin = createAdminClient()
    let userId: string | null = appAccountToken || null

    if (!userId) {
      // Look up user by their Apple transaction ID
      const { data: sub } = await admin
        .from('subscriptions')
        .select('user_id')
        .eq('apple_transaction_id', originalTransactionId)
        .single()

      userId = sub?.user_id || null
    }

    if (!userId) {
      console.error('Apple webhook: cannot find user for transaction', originalTransactionId)
      return NextResponse.json({ received: true })
    }

    console.log(`Apple webhook: ${notificationType}${subtype ? ` (${subtype})` : ''} for user ${userId}`)

    switch (notificationType) {
      case 'DID_RENEW':
        await handleRenewal(admin, userId, productId, originalTransactionId, expiresDate)
        break

      case 'EXPIRED':
        await handleExpired(admin, userId)
        break

      case 'DID_CHANGE_RENEWAL_STATUS':
        await handleRenewalStatusChange(admin, userId, subtype, renewalInfo)
        break

      case 'DID_CHANGE_RENEWAL_INFO':
        // User changed their auto-renew product (upgrade/downgrade in iOS Settings)
        if (renewalInfo?.autoRenewProductId) {
          const newPlan = PRODUCT_TO_PLAN[renewalInfo.autoRenewProductId as string]
          if (newPlan) {
            await admin.from('subscriptions').update({ pending_plan: newPlan }).eq('user_id', userId)
          }
        }
        break

      case 'SUBSCRIBED':
        // Initial subscription — already handled by /api/iap/validate
        // but handle it here too in case validate response was lost
        await handleRenewal(admin, userId, productId, originalTransactionId, expiresDate)
        break

      case 'REVOKE':
        // Apple revoked the purchase (refund granted)
        await handleExpired(admin, userId)
        break

      case 'GRACE_PERIOD_EXPIRED':
        // Billing grace period ended without payment
        await handleExpired(admin, userId)
        break

      case 'DID_FAIL_TO_RENEW':
        // Payment failed — mark as past_due but keep access during grace period
        await admin.from('subscriptions').update({ status: 'past_due' }).eq('user_id', userId)
        break

      case 'REFUND':
        await handleExpired(admin, userId)
        break
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error('Apple webhook error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// --- Handlers ---

async function handleRenewal(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  productId: string,
  transactionId: string,
  expiresDate?: number,
) {
  const plan = PRODUCT_TO_PLAN[productId]
  if (!plan) return

  const update: Record<string, unknown> = {
    plan,
    status: 'active',
    payment_provider: 'apple',
    apple_product_id: productId,
    apple_transaction_id: transactionId,
    cancel_at_period_end: false,
    pending_plan: null,
    admin_override: false,
  }

  if (expiresDate) {
    update.current_period_end = new Date(expiresDate).toISOString()
  }

  await admin.from('subscriptions').update(update).eq('user_id', userId)
}

async function handleExpired(admin: ReturnType<typeof createAdminClient>, userId: string) {
  await admin
    .from('subscriptions')
    .update({
      plan: 'free',
      status: 'canceled',
      cancel_at_period_end: false,
      pending_plan: null,
      admin_override: false,
    })
    .eq('user_id', userId)
}

async function handleRenewalStatusChange(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  subtype?: string,
  renewalInfo?: Record<string, unknown> | null,
) {
  if (subtype === 'AUTO_RENEW_DISABLED') {
    // User turned off auto-renew (will expire at period end)
    await admin.from('subscriptions').update({ cancel_at_period_end: true }).eq('user_id', userId)
  } else if (subtype === 'AUTO_RENEW_ENABLED') {
    // User re-enabled auto-renew
    const update: Record<string, unknown> = {
      cancel_at_period_end: false,
    }

    // If they changed product during re-enable
    if (renewalInfo?.autoRenewProductId) {
      const newPlan = PRODUCT_TO_PLAN[renewalInfo.autoRenewProductId as string]
      if (newPlan) {
        update.pending_plan = null
        update.plan = newPlan
      }
    }

    await admin.from('subscriptions').update(update).eq('user_id', userId)
  }
}

// --- JWS Decoding ---

/**
 * Decode a JWS (JSON Web Signature) payload without full verification.
 * In production, you should verify the signature against Apple's root certificate chain.
 *
 * Apple JWS uses x5c certificate chain in the header.
 */
function decodeJWS(jws: string): Record<string, unknown> | null {
  try {
    const parts = jws.split('.')
    if (parts.length !== 3) return null

    const payload = Buffer.from(parts[1], 'base64url').toString('utf-8')
    return JSON.parse(payload)
  } catch {
    return null
  }
}
