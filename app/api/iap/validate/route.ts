import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// Map Apple product IDs to Amida plan names
const PRODUCT_TO_PLAN: Record<string, 'pro' | 'team'> = {
  amida_pro_monthly: 'pro',
  amida_pro_yearly: 'pro',
  amida_team_monthly: 'team',
  amida_team_yearly: 'team',
}

/**
 * POST /api/iap/validate
 *
 * Validates an Apple In-App Purchase transaction and updates the user's subscription.
 * Called from the iOS app after a successful StoreKit purchase.
 *
 * Body: { transactionId: string, productId: string }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { transactionId, productId } = await request.json()

    if (!transactionId || !productId) {
      return NextResponse.json({ error: 'Missing transactionId or productId' }, { status: 400 })
    }

    const plan = PRODUCT_TO_PLAN[productId]
    if (!plan) {
      return NextResponse.json({ error: 'Unknown product ID' }, { status: 400 })
    }

    // Validate the transaction with Apple's App Store Server API v2
    const txnInfo = await verifyWithApple(transactionId)
    if (!txnInfo) {
      return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
    }

    // Update subscription using admin client (bypasses RLS for server-side updates)
    const admin = createAdminClient()

    const update: Record<string, unknown> = {
      plan,
      status: 'active',
      payment_provider: 'apple',
      apple_product_id: productId,
      apple_transaction_id: transactionId,
      cancel_at_period_end: false,
      pending_plan: null,
      admin_override: false,
      current_period_start: new Date().toISOString(),
    }

    // Set period end from Apple's transaction data if available
    if (txnInfo.expiresDate) {
      update.current_period_end = new Date(txnInfo.expiresDate).toISOString()
    }

    await admin.from('subscriptions').update(update).eq('user_id', user.id)

    return NextResponse.json({ success: true, plan })
  } catch (err) {
    console.error('IAP validation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

type TransactionInfo = {
  expiresDate?: number
  originalTransactionId?: string
}

/**
 * Verify transaction with Apple App Store Server API v2.
 * Returns transaction info if valid, null if invalid.
 */
async function verifyWithApple(transactionId: string): Promise<TransactionInfo | null> {
  const keyId = process.env.APPLE_IAP_KEY_ID
  const issuerId = process.env.APPLE_IAP_ISSUER_ID
  const privateKey = process.env.APPLE_IAP_PRIVATE_KEY

  // If Apple credentials aren't configured yet, allow in dev mode
  if (!keyId || !issuerId || !privateKey) {
    console.warn('Apple IAP credentials not configured — skipping verification (dev mode)')
    return {}
  }

  try {
    const token = await generateAppleJWT(keyId, issuerId, privateKey)

    const isSandbox = process.env.NODE_ENV !== 'production'
    const baseUrl = isSandbox
      ? 'https://api.storekit-sandbox.itunes.apple.com'
      : 'https://api.storekit.itunes.apple.com'

    const response = await fetch(`${baseUrl}/inApps/v1/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!response.ok) {
      console.error('Apple API error:', response.status, await response.text())
      return null
    }

    const data = await response.json()

    if (!data.signedTransactionInfo) return null

    // Decode the signed transaction JWS to extract period info
    const decoded = decodeJWSPayload(data.signedTransactionInfo)

    return {
      expiresDate: decoded?.expiresDate as number | undefined,
      originalTransactionId: decoded?.originalTransactionId as string | undefined,
    }
  } catch (err) {
    console.error('Apple verification failed:', err)
    return null
  }
}

/**
 * Decode a JWS payload (without full signature verification).
 * Full JWS verification with Apple's root certificate can be added later.
 */
function decodeJWSPayload(jws: string): Record<string, unknown> | null {
  try {
    const parts = jws.split('.')
    if (parts.length !== 3) return null
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'))
  } catch {
    return null
  }
}

/**
 * Generate a JWT for Apple App Store Server API authentication.
 * Uses ES256 algorithm with Apple's private key.
 */
async function generateAppleJWT(keyId: string, issuerId: string, privateKey: string): Promise<string> {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 3600,
    aud: 'appstoreconnect-v1',
    bid: 'com.babalisk.amida',
  }

  const enc = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url')

  const headerB64 = enc(header)
  const payloadB64 = enc(payload)
  const signingInput = `${headerB64}.${payloadB64}`

  const crypto = await import('crypto')
  const sign = crypto.createSign('SHA256')
  sign.update(signingInput)
  const signature = sign.sign(privateKey, 'base64url')

  return `${signingInput}.${signature}`
}
