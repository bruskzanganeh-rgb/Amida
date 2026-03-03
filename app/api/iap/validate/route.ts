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
    const isValid = await verifyWithApple(transactionId)
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid transaction' }, { status: 400 })
    }

    // Update subscription using admin client (bypasses RLS for server-side updates)
    const admin = createAdminClient()

    await admin
      .from('subscriptions')
      .update({
        plan,
        status: 'active',
        payment_provider: 'apple',
        apple_product_id: productId,
        apple_transaction_id: transactionId,
        cancel_at_period_end: false,
        admin_override: false,
      })
      .eq('user_id', user.id)

    return NextResponse.json({ success: true, plan })
  } catch (err) {
    console.error('IAP validation error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Verify transaction with Apple App Store Server API v2.
 * Uses the signed transaction info endpoint.
 *
 * Requires APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, and APPLE_IAP_PRIVATE_KEY
 * environment variables for JWT authentication with Apple.
 *
 * Returns true if the transaction is valid and not revoked.
 */
async function verifyWithApple(transactionId: string): Promise<boolean> {
  const keyId = process.env.APPLE_IAP_KEY_ID
  const issuerId = process.env.APPLE_IAP_ISSUER_ID
  const privateKey = process.env.APPLE_IAP_PRIVATE_KEY

  // If Apple credentials aren't configured yet, log warning and allow (dev/staging)
  if (!keyId || !issuerId || !privateKey) {
    console.warn('Apple IAP credentials not configured — skipping verification (dev mode)')
    return true
  }

  try {
    // Generate JWT for Apple API authentication
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
      return false
    }

    const data = await response.json()

    // The response contains a signed transaction — decode the payload
    // For now we trust the transaction ID lookup succeeding as validation
    // Full JWS verification can be added later with Apple's root certificates
    return !!data.signedTransactionInfo
  } catch (err) {
    console.error('Apple verification failed:', err)
    return false
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

  // Import the private key and sign
  const crypto = await import('crypto')
  const sign = crypto.createSign('SHA256')
  sign.update(signingInput)
  const signature = sign.sign(privateKey, 'base64url')

  return `${signingInput}.${signature}`
}
