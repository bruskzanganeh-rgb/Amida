import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 10 })),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))

vi.mock('@/lib/schemas/stripe', () => ({
  createCheckoutSchema: { safeParse: vi.fn() },
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { rateLimit } from '@/lib/rate-limit'
import { createCheckoutSchema } from '@/lib/schemas/stripe'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockUser(id = 'user-1', email = 'test@test.com') {
  return { id, email }
}

function mockAuthClient(user: ReturnType<typeof mockUser> | null = mockUser()) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn(),
  }
}

function chainMock(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  const thenFn = (resolve: (v: unknown) => void) => resolve(result)
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'limit']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.then = thenFn
  return chain
}

// ---------------------------------------------------------------------------
// 35. stripe/create-checkout POST
// ---------------------------------------------------------------------------

describe('POST /api/stripe/create-checkout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 5 })
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000'
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 })

    const { POST } = await import('@/app/api/stripe/create-checkout/route')
    const req = new Request('http://localhost/api/stripe/create-checkout', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(429)
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/create-checkout/route')
    const req = new Request('http://localhost/api/stripe/create-checkout', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(createCheckoutSchema.safeParse).mockReturnValue({ success: false } as never)

    const { POST } = await import('@/app/api/stripe/create-checkout/route')
    const req = new Request('http://localhost/api/stripe/create-checkout', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates checkout session on happy path (existing customer)', async () => {
    const client = mockAuthClient()
    client.from.mockReturnValue(chainMock({ stripe_customer_id: 'cus_existing' }))
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(createCheckoutSchema.safeParse).mockReturnValue({
      success: true,
      data: { priceId: 'price_pro', plan: 'pro' },
    } as never)

    vi.mocked(getStripe).mockReturnValue({
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/test' }),
        },
      },
    } as never)

    const { POST } = await import('@/app/api/stripe/create-checkout/route')
    const req = new Request('http://localhost/api/stripe/create-checkout', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.url).toBe('https://checkout.stripe.com/test')
  })

  it('creates Stripe customer when none exists', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ stripe_customer_id: null })
    const updateCh = chainMock()
    let callCount = 0
    client.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return ch // subscription lookup
      return updateCh // subscription update
    })
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(createCheckoutSchema.safeParse).mockReturnValue({
      success: true,
      data: { priceId: 'price_pro', plan: 'pro' },
    } as never)

    const mockCustomersCreate = vi.fn().mockResolvedValue({ id: 'cus_new' })
    vi.mocked(getStripe).mockReturnValue({
      customers: { create: mockCustomersCreate },
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/new' }),
        },
      },
    } as never)

    const { POST } = await import('@/app/api/stripe/create-checkout/route')
    const req = new Request('http://localhost/api/stripe/create-checkout', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.url).toBe('https://checkout.stripe.com/new')
    expect(mockCustomersCreate).toHaveBeenCalled()
  })

  it('returns 403 for team plan when user is not owner', async () => {
    const client = mockAuthClient()
    let callCount = 0
    client.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return chainMock({ stripe_customer_id: 'cus_1' }) // subscription
      return chainMock({ company_id: 'c1', role: 'member' }) // membership
    })
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(createCheckoutSchema.safeParse).mockReturnValue({
      success: true,
      data: { priceId: 'price_team', plan: 'team' },
    } as never)

    const { POST } = await import('@/app/api/stripe/create-checkout/route')
    const req = new Request('http://localhost/api/stripe/create-checkout', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// 37. iap/validate POST
// ---------------------------------------------------------------------------

describe('POST /api/iap/validate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Clear Apple env vars so dev mode fallback is used
    delete process.env.APPLE_IAP_KEY_ID
    delete process.env.APPLE_IAP_ISSUER_ID
    delete process.env.APPLE_IAP_PRIVATE_KEY
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/iap/validate/route')
    const req = new Request('http://localhost/api/iap/validate', {
      method: 'POST',
      body: JSON.stringify({ transactionId: 'tx1', productId: 'amida_pro_monthly' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when transactionId or productId missing', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/iap/validate/route')
    const req = new Request('http://localhost/api/iap/validate', {
      method: 'POST',
      body: JSON.stringify({ transactionId: 'tx1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for unknown product ID', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/iap/validate/route')
    const req = new Request('http://localhost/api/iap/validate', {
      method: 'POST',
      body: JSON.stringify({ transactionId: 'tx1', productId: 'invalid_product' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('validates IAP and updates subscription on happy path (dev mode)', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const ch = chainMock()
    ch.eq.mockResolvedValue({ error: null })
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { POST } = await import('@/app/api/iap/validate/route')
    const req = new Request('http://localhost/api/iap/validate', {
      method: 'POST',
      body: JSON.stringify({ transactionId: 'tx1', productId: 'amida_pro_monthly' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.plan).toBe('pro')
  })

  it('handles team product IDs', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const ch = chainMock()
    ch.eq.mockResolvedValue({ error: null })
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { POST } = await import('@/app/api/iap/validate/route')
    const req = new Request('http://localhost/api/iap/validate', {
      method: 'POST',
      body: JSON.stringify({ transactionId: 'tx2', productId: 'amida_team_yearly' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.plan).toBe('team')
  })

  it('validates with Apple API when credentials are configured', async () => {
    // Set up Apple credentials - generate a real EC key for crypto.createSign
    const crypto = await import('crypto')
    const { privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      privateKeyEncoding: { type: 'sec1', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })

    process.env.APPLE_IAP_KEY_ID = 'key123'
    process.env.APPLE_IAP_ISSUER_ID = 'issuer123'
    process.env.APPLE_IAP_PRIVATE_KEY = privateKey

    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const ch = chainMock()
    ch.eq.mockResolvedValue({ error: null })
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    // Mock fetch for Apple API
    const jwtPayload = Buffer.from(
      JSON.stringify({
        expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        originalTransactionId: 'orig_tx1',
      }),
    ).toString('base64url')
    const fakeJWS = `header.${jwtPayload}.signature`

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ signedTransactionInfo: fakeJWS }),
    } as never)

    const { POST } = await import('@/app/api/iap/validate/route')
    const req = new Request('http://localhost/api/iap/validate', {
      method: 'POST',
      body: JSON.stringify({ transactionId: 'tx3', productId: 'amida_pro_yearly' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.plan).toBe('pro')
  })

  it('returns 400 when Apple API returns non-ok response', async () => {
    const crypto = await import('crypto')
    const { privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      privateKeyEncoding: { type: 'sec1', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })

    process.env.APPLE_IAP_KEY_ID = 'key123'
    process.env.APPLE_IAP_ISSUER_ID = 'issuer123'
    process.env.APPLE_IAP_PRIVATE_KEY = privateKey

    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('Not found'),
    } as never)

    const { POST } = await import('@/app/api/iap/validate/route')
    const req = new Request('http://localhost/api/iap/validate', {
      method: 'POST',
      body: JSON.stringify({ transactionId: 'tx4', productId: 'amida_pro_monthly' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid transaction')
  })

  it('returns 400 when Apple API returns no signedTransactionInfo', async () => {
    const crypto = await import('crypto')
    const { privateKey } = crypto.generateKeyPairSync('ec', {
      namedCurve: 'P-256',
      privateKeyEncoding: { type: 'sec1', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    })

    process.env.APPLE_IAP_KEY_ID = 'key123'
    process.env.APPLE_IAP_ISSUER_ID = 'issuer123'
    process.env.APPLE_IAP_PRIVATE_KEY = privateKey

    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    } as never)

    const { POST } = await import('@/app/api/iap/validate/route')
    const req = new Request('http://localhost/api/iap/validate', {
      method: 'POST',
      body: JSON.stringify({ transactionId: 'tx5', productId: 'amida_pro_monthly' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid transaction')
  })

  it('returns 500 when an unexpected error occurs', async () => {
    const client = mockAuthClient()
    // Make request.json() throw
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/iap/validate/route')
    // Send invalid JSON
    const req = new Request('http://localhost/api/iap/validate', {
      method: 'POST',
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Internal server error')
  })
})
