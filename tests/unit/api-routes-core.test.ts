import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 10 })),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))

vi.mock('@/lib/usage', () => ({
  checkStorageQuota: vi.fn(),
  checkUsageLimit: vi.fn(),
  incrementUsage: vi.fn(),
}))

vi.mock('@/lib/activity', () => ({
  logActivity: vi.fn(),
}))

vi.mock('@/lib/subscription-utils', () => ({
  buildTier: vi.fn((plan: string) => ({
    plan,
    invoiceLimit: plan === 'free' ? 5 : 0,
  })),
}))

vi.mock('@/lib/expenses/duplicate-checker', () => ({
  findDuplicateExpense: vi.fn(),
  findDuplicateExpenses: vi.fn(),
}))

vi.mock('@/lib/schemas/expense', () => ({
  checkDuplicateSchema: {
    safeParse: vi.fn(),
  },
  batchCheckDuplicateSchema: {
    safeParse: vi.fn(),
  },
  updateExpenseSchema: {
    safeParse: vi.fn(),
  },
}))

vi.mock('@/lib/schemas/usage', () => ({
  incrementUsageSchema: {
    safeParse: vi.fn(),
  },
}))

vi.mock('@/lib/schemas/onboarding', () => ({
  completeOnboardingSchema: {
    safeParse: vi.fn(),
  },
}))

vi.mock('@/lib/admin', () => ({
  verifyAdmin: vi.fn(),
}))

vi.mock('@/lib/ai/usage-logger', () => ({
  getUsageTypeLabel: vi.fn((type: string) => type),
}))

const mockResendSend = vi.fn()
vi.mock('resend', () => {
  return {
    Resend: class MockResend {
      emails = { send: mockResendSend }
    },
  }
})

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { checkStorageQuota, checkUsageLimit, incrementUsage } from '@/lib/usage'
import { findDuplicateExpense, findDuplicateExpenses } from '@/lib/expenses/duplicate-checker'
import { checkDuplicateSchema, batchCheckDuplicateSchema, updateExpenseSchema } from '@/lib/schemas/expense'
import { incrementUsageSchema } from '@/lib/schemas/usage'
import { completeOnboardingSchema } from '@/lib/schemas/onboarding'
import { verifyAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

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
    storage: { from: vi.fn() },
  }
}

/**
 * Creates a Supabase chain mock. Every method returns `chain` so calls can be
 * chained freely. The chain is also a thenable so `await chain` resolves to
 * `{ data, error }`. `.single()` returns a promise that resolves the same way.
 */
function chainMock(data: unknown = null, error: unknown = null) {
  const result = { data, error }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  const thenFn = (resolve: (v: unknown) => void) => resolve(result)
  const methods = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'neq',
    'in',
    'not',
    'is',
    'gte',
    'lte',
    'lt',
    'or',
    'order',
    'limit',
    'range',
  ]
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.then = thenFn
  return chain
}

// ---------------------------------------------------------------------------
// 1. expenses/check-duplicate POST
// ---------------------------------------------------------------------------

describe('POST /api/expenses/check-duplicate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/expenses/check-duplicate/route')
    const req = new Request('http://localhost/api/expenses/check-duplicate', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(res.status).toBe(401)
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 400 for invalid data', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(checkDuplicateSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { date: ['Required'] } }) },
    } as never)

    const { POST } = await import('@/app/api/expenses/check-duplicate/route')
    const req = new Request('http://localhost/api/expenses/check-duplicate', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('returns duplicate check result on happy path', async () => {
    const client = mockAuthClient()
    const expenseChain = chainMock([], null)
    client.from.mockReturnValue(expenseChain)

    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(checkDuplicateSchema.safeParse).mockReturnValue({
      success: true,
      data: { date: '2026-01-01', supplier: 'Test', amount: 100 },
    } as never)
    vi.mocked(findDuplicateExpense).mockReturnValue({
      isDuplicate: false,
      existingExpense: null,
      matchType: null,
    } as never)

    const { POST } = await import('@/app/api/expenses/check-duplicate/route')
    const req = new Request('http://localhost/api/expenses/check-duplicate', {
      method: 'POST',
      body: JSON.stringify({ date: '2026-01-01', supplier: 'Test', amount: 100 }),
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.isDuplicate).toBe(false)
  })

  it('returns 500 on DB error', async () => {
    const client = mockAuthClient()
    const expenseChain = chainMock(null, { message: 'DB error' })
    client.from.mockReturnValue(expenseChain)

    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(checkDuplicateSchema.safeParse).mockReturnValue({
      success: true,
      data: { date: '2026-01-01', supplier: 'Test', amount: 100 },
    } as never)

    const { POST } = await import('@/app/api/expenses/check-duplicate/route')
    const req = new Request('http://localhost/api/expenses/check-duplicate', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 1b. expenses/check-duplicate PUT (batch)
// ---------------------------------------------------------------------------

describe('PUT /api/expenses/check-duplicate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { PUT } = await import('@/app/api/expenses/check-duplicate/route')
    const req = new Request('http://localhost/api/expenses/check-duplicate', {
      method: 'PUT',
      body: JSON.stringify({}),
    })
    const res = await PUT(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(batchCheckDuplicateSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { expenses: ['Required'] } }) },
    } as never)

    const { PUT } = await import('@/app/api/expenses/check-duplicate/route')
    const req = new Request('http://localhost/api/expenses/check-duplicate', {
      method: 'PUT',
      body: JSON.stringify({}),
    })
    const res = await PUT(req as never)
    expect(res.status).toBe(400)
  })

  it('returns batch results on happy path', async () => {
    const client = mockAuthClient()
    const ch = chainMock([], null)
    client.from.mockReturnValue(ch)

    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(batchCheckDuplicateSchema.safeParse).mockReturnValue({
      success: true,
      data: { expenses: [{ date: '2026-01-01', supplier: 'A', amount: 50 }] },
    } as never)
    vi.mocked(findDuplicateExpenses).mockReturnValue([
      { isDuplicate: false, existingExpense: null, matchType: null },
    ] as never)

    const { PUT } = await import('@/app/api/expenses/check-duplicate/route')
    const req = new Request('http://localhost/api/expenses/check-duplicate', {
      method: 'PUT',
      body: JSON.stringify({}),
    })
    const res = await PUT(req as never)
    const body = await res.json()
    expect(body.results).toHaveLength(1)
    expect(body.duplicateCount).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 2. expenses/supplier-categories GET
// ---------------------------------------------------------------------------

describe('GET /api/expenses/supplier-categories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/expenses/supplier-categories/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns mapping on happy path', async () => {
    const client = mockAuthClient()
    const ch = chainMock(
      [
        { supplier: 'Spotify AB', category: 'software', currency: 'SEK' },
        { supplier: 'Spotify AB', category: 'software', currency: 'SEK' },
        { supplier: 'IKEA', category: 'supplies', currency: 'EUR' },
      ],
      null,
    )
    client.from.mockReturnValue(ch)

    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/expenses/supplier-categories/route')
    const res = await GET()
    const body = await res.json()
    expect(body.mapping).toBeDefined()
    expect(body.totalSuppliers).toBeGreaterThanOrEqual(0)
  })

  it('returns 500 on DB error', async () => {
    const client = mockAuthClient()
    const ch = chainMock(null, { message: 'fail' })
    client.from.mockReturnValue(ch)

    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/expenses/supplier-categories/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 2b. findBestMatch (exported utility)
// ---------------------------------------------------------------------------

describe('findBestMatch', () => {
  it('returns exact match', async () => {
    const { findBestMatch } = await import('@/app/api/expenses/supplier-categories/route')
    const mapping = { spotify: { category: 'software', currency: 'SEK', count: 5 } }
    expect(findBestMatch('Spotify', mapping)).toEqual(mapping.spotify)
  })

  it('returns partial match', async () => {
    const { findBestMatch } = await import('@/app/api/expenses/supplier-categories/route')
    const mapping = { spotify: { category: 'software', currency: 'SEK', count: 5 } }
    expect(findBestMatch('Spotify AB', mapping)).toEqual(mapping.spotify)
  })

  it('returns null when no match', async () => {
    const { findBestMatch } = await import('@/app/api/expenses/supplier-categories/route')
    expect(findBestMatch('Unknown', {})).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 3. expenses/[id] PATCH + DELETE
// ---------------------------------------------------------------------------

describe('PATCH /api/expenses/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { PATCH } = await import('@/app/api/expenses/[id]/route')
    const req = new Request('http://localhost/api/expenses/abc', {
      method: 'PATCH',
      body: JSON.stringify({}),
    })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(updateExpenseSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { amount: ['Invalid'] } }) },
    } as never)

    const { PATCH } = await import('@/app/api/expenses/[id]/route')
    const req = new Request('http://localhost/api/expenses/abc', {
      method: 'PATCH',
      body: JSON.stringify({}),
    })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 when no fields to update', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(updateExpenseSchema.safeParse).mockReturnValue({
      success: true,
      data: {},
    } as never)

    const { PATCH } = await import('@/app/api/expenses/[id]/route')
    const req = new Request('http://localhost/api/expenses/abc', {
      method: 'PATCH',
      body: JSON.stringify({}),
    })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(400)
  })

  it('returns success on happy path', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ id: 'abc', amount: 200 })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(updateExpenseSchema.safeParse).mockReturnValue({
      success: true,
      data: { amount: 200 },
    } as never)

    const { PATCH } = await import('@/app/api/expenses/[id]/route')
    const req = new Request('http://localhost/api/expenses/abc', {
      method: 'PATCH',
      body: JSON.stringify({ amount: 200 }),
    })
    const res = await PATCH(req as never, { params: Promise.resolve({ id: 'abc' }) })
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

describe('DELETE /api/expenses/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { DELETE } = await import('@/app/api/expenses/[id]/route')
    const req = new Request('http://localhost/api/expenses/abc', { method: 'DELETE' })
    const res = await DELETE(req as never, { params: Promise.resolve({ id: 'abc' }) })
    expect(res.status).toBe(401)
  })

  it('returns success on happy path', async () => {
    const client = mockAuthClient()
    const ch = chainMock(null, null)
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { DELETE } = await import('@/app/api/expenses/[id]/route')
    const req = new Request('http://localhost/api/expenses/abc', { method: 'DELETE' })
    const res = await DELETE(req as never, { params: Promise.resolve({ id: 'abc' }) })
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. config/tiers GET
// ---------------------------------------------------------------------------

describe('GET /api/config/tiers', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns tier config', async () => {
    const adminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          or: vi.fn().mockResolvedValue({ data: [{ key: 'free_invoice_limit', value: '5' }] }),
        }),
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/config/tiers/route')
    const res = await GET()
    const body = await res.json()
    expect(body.free).toBeDefined()
    expect(body.pro).toBeDefined()
    expect(body.team).toBeDefined()
  })

  it('returns 500 on error', async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error('fail')
    })

    const { GET } = await import('@/app/api/config/tiers/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 5. config/limits GET
// ---------------------------------------------------------------------------

describe('GET /api/config/limits', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns limits from DB', async () => {
    const adminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({
            data: [
              { key: 'free_invoice_limit', value: '10' },
              { key: 'free_receipt_scan_limit', value: '6' },
            ],
          }),
        }),
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/config/limits/route')
    const res = await GET()
    const body = await res.json()
    expect(body.invoices).toBe(10)
    expect(body.receiptScans).toBe(6)
  })

  it('returns defaults when no data', async () => {
    const adminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/config/limits/route')
    const res = await GET()
    const body = await res.json()
    expect(body.invoices).toBe(5)
    expect(body.receiptScans).toBe(3)
  })

  it('returns defaults on exception', async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error('fail')
    })

    const { GET } = await import('@/app/api/config/limits/route')
    const res = await GET()
    const body = await res.json()
    expect(body.invoices).toBe(5)
    expect(body.receiptScans).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// 6. exchange-rate GET
// ---------------------------------------------------------------------------

describe('GET /api/exchange-rate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 })

    const { GET } = await import('@/app/api/exchange-rate/route')
    const req = new Request('http://localhost/api/exchange-rate?from=EUR&to=SEK&date=2026-01-01')
    const res = await GET(req as never)
    expect(res.status).toBe(429)
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/exchange-rate/route')
    const req = new Request('http://localhost/api/exchange-rate?from=EUR&to=SEK&date=2026-01-01')
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for missing params', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/exchange-rate/route')
    const req = new Request('http://localhost/api/exchange-rate?from=EUR')
    const res = await GET(req as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for unsupported currency', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/exchange-rate/route')
    const req = new Request('http://localhost/api/exchange-rate?from=XYZ&to=SEK&date=2026-01-01')
    const res = await GET(req as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid date format', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/exchange-rate/route')
    const req = new Request('http://localhost/api/exchange-rate?from=EUR&to=SEK&date=01-01-2026')
    const res = await GET(req as never)
    expect(res.status).toBe(400)
  })

  it('returns rate 1.0 when from === to', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/exchange-rate/route')
    const req = new Request('http://localhost/api/exchange-rate?from=SEK&to=SEK&date=2026-01-01')
    const res = await GET(req as never)
    const body = await res.json()
    expect(body.rate).toBe(1.0)
  })

  it('returns rate from Frankfurter API on happy path', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rates: { SEK: 11.5 } }),
    } as never)

    const { GET } = await import('@/app/api/exchange-rate/route')
    const req = new Request('http://localhost/api/exchange-rate?from=EUR&to=SEK&date=2026-01-01')
    const res = await GET(req as never)
    const body = await res.json()
    expect(body.rate).toBe(11.5)
  })

  it('returns 502 when Frankfurter API fails', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Service Unavailable',
    } as never)

    const { GET } = await import('@/app/api/exchange-rate/route')
    const req = new Request('http://localhost/api/exchange-rate?from=EUR&to=SEK&date=2026-01-01')
    const res = await GET(req as never)
    expect(res.status).toBe(502)
  })
})

// ---------------------------------------------------------------------------
// 7. health GET
// ---------------------------------------------------------------------------

describe('GET /api/health', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns ok when DB is healthy', async () => {
    const adminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/health/route')
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('ok')
    expect(body.db).toBe(true)
    expect(body.timestamp).toBeDefined()
  })

  it('returns degraded when DB fails', async () => {
    const adminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ error: { message: 'fail' } }),
        }),
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/health/route')
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('degraded')
    expect(body.db).toBe(false)
  })

  it('returns degraded when createAdminClient throws', async () => {
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error('fail')
    })

    const { GET } = await import('@/app/api/health/route')
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('degraded')
    expect(body.db).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 8. client-error POST
// ---------------------------------------------------------------------------

describe('POST /api/client-error', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 5 })
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 })

    const { POST } = await import('@/app/api/client-error/route')
    const req = new Request('http://localhost/api/client-error', {
      method: 'POST',
      body: JSON.stringify({ message: 'test' }),
      headers: { 'x-forwarded-for': '1.2.3.4' },
    })
    const res = await POST(req as never)
    expect(res.status).toBe(429)
  })

  it('returns 400 when message is missing', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn() } as never)

    const { POST } = await import('@/app/api/client-error/route')
    const req = new Request('http://localhost/api/client-error', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('logs error and returns ok', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const mockInsert = vi.fn().mockResolvedValue({})
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as never)

    const { POST } = await import('@/app/api/client-error/route')
    const req = new Request('http://localhost/api/client-error', {
      method: 'POST',
      body: JSON.stringify({ message: 'Something broke', stack: 'at line 1' }),
      headers: { 'user-agent': 'TestBrowser' },
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(mockInsert).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 9. account DELETE
// ---------------------------------------------------------------------------

describe('DELETE /api/account', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { DELETE } = await import('@/app/api/account/route')
    const res = await DELETE()
    expect(res.status).toBe(401)
  })

  it('deletes user data and auth user on happy path (no company)', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const adminDeleteUser = vi.fn().mockResolvedValue({})
    // Every from() call returns a chainMock that resolves to { data: null/[] }
    const adminClient = {
      from: vi.fn().mockReturnValue(chainMock(null, null)),
      auth: { admin: { deleteUser: adminDeleteUser } },
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { DELETE } = await import('@/app/api/account/route')
    const res = await DELETE()
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(adminDeleteUser).toHaveBeenCalledWith('user-1')
  })
})

// ---------------------------------------------------------------------------
// 10. storage/quota GET
// ---------------------------------------------------------------------------

describe('GET /api/storage/quota', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/storage/quota/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns quota on happy path', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(checkStorageQuota).mockResolvedValue({
      allowed: true,
      usedBytes: 5000,
      limitBytes: 50 * 1024 * 1024,
      plan: 'free',
    } as never)

    const { GET } = await import('@/app/api/storage/quota/route')
    const res = await GET()
    const body = await res.json()
    expect(body.usedBytes).toBe(5000)
    expect(body.plan).toBe('free')
  })
})

// ---------------------------------------------------------------------------
// 11. session/heartbeat POST
// ---------------------------------------------------------------------------

describe('POST /api/session/heartbeat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(createAdminClient).mockReturnValue({} as never)

    const { POST } = await import('@/app/api/session/heartbeat/route')
    const req = new Request('http://localhost/api/session/heartbeat', { method: 'POST' })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('updates existing session', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const ch = chainMock({ id: 'session-1', last_active_at: new Date().toISOString() })
    const adminClient = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { POST } = await import('@/app/api/session/heartbeat/route')
    const req = new Request('http://localhost/api/session/heartbeat', { method: 'POST' })
    const res = await POST(req)
    const body = await res.json()
    expect(body.session_id).toBe('session-1')
    expect(body.status).toBe('updated')
  })

  it('creates new session when none active', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // Active session lookup
          return chainMock(null)
        }
        if (callCount === 2) {
          // End stale sessions
          const ch = chainMock()
          ch.is.mockResolvedValue({})
          return ch
        }
        // Insert new session
        return chainMock({ id: 'new-session' })
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { POST } = await import('@/app/api/session/heartbeat/route')
    const req = new Request('http://localhost/api/session/heartbeat', { method: 'POST' })
    const res = await POST(req)
    const body = await res.json()
    expect(body.status).toBe('created')
  })
})

// ---------------------------------------------------------------------------
// 12. sponsor-impression POST
// ---------------------------------------------------------------------------

describe('POST /api/sponsor-impression', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/sponsor-impression/route')
    const req = new Request('http://localhost/api/sponsor-impression', {
      method: 'POST',
      body: JSON.stringify({ sponsor_id: 'sp1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when sponsor_id is missing', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/sponsor-impression/route')
    const req = new Request('http://localhost/api/sponsor-impression', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('logs impression on happy path', async () => {
    const client = mockAuthClient()
    const ch = chainMock()
    ch.insert.mockResolvedValue({ error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/sponsor-impression/route')
    const req = new Request('http://localhost/api/sponsor-impression', {
      method: 'POST',
      body: JSON.stringify({ sponsor_id: 'sp1', type: 'click' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 500 on DB error', async () => {
    const client = mockAuthClient()
    const ch = chainMock()
    ch.insert.mockResolvedValue({ error: { message: 'fail' } })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/sponsor-impression/route')
    const req = new Request('http://localhost/api/sponsor-impression', {
      method: 'POST',
      body: JSON.stringify({ sponsor_id: 'sp1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 13. usage/increment POST
// ---------------------------------------------------------------------------

describe('POST /api/usage/increment', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/usage/increment/route')
    const req = new Request('http://localhost/api/usage/increment', {
      method: 'POST',
      body: JSON.stringify({ type: 'invoice' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid type', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(incrementUsageSchema.safeParse).mockReturnValue({
      success: false,
    } as never)

    const { POST } = await import('@/app/api/usage/increment/route')
    const req = new Request('http://localhost/api/usage/increment', {
      method: 'POST',
      body: JSON.stringify({ type: 'invalid' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 when limit reached', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(incrementUsageSchema.safeParse).mockReturnValue({
      success: true,
      data: { type: 'invoice' },
    } as never)
    vi.mocked(checkUsageLimit).mockResolvedValue({ allowed: false, current: 5, limit: 5 } as never)

    const { POST } = await import('@/app/api/usage/increment/route')
    const req = new Request('http://localhost/api/usage/increment', {
      method: 'POST',
      body: JSON.stringify({ type: 'invoice' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('increments usage on happy path', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(incrementUsageSchema.safeParse).mockReturnValue({
      success: true,
      data: { type: 'invoice' },
    } as never)
    vi.mocked(checkUsageLimit).mockResolvedValue({ allowed: true } as never)
    vi.mocked(incrementUsage).mockResolvedValue(undefined)

    const { POST } = await import('@/app/api/usage/increment/route')
    const req = new Request('http://localhost/api/usage/increment', {
      method: 'POST',
      body: JSON.stringify({ type: 'invoice' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(incrementUsage).toHaveBeenCalledWith('user-1', 'invoice')
  })
})

// ---------------------------------------------------------------------------
// 14. onboarding/complete POST
// ---------------------------------------------------------------------------

describe('POST /api/onboarding/complete', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/onboarding/complete/route')
    const req = new Request('http://localhost/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(completeOnboardingSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: {} }) },
    } as never)

    const { POST } = await import('@/app/api/onboarding/complete/route')
    const req = new Request('http://localhost/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates company and settings on happy path (new user)', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(completeOnboardingSchema.safeParse).mockReturnValue({
      success: true,
      data: {
        full_name: 'Test User',
        locale: 'sv',
        company_info: { company_name: 'Test AB' },
      },
    } as never)

    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // existingMembership lookup -> null (no existing)
          return chainMock(null, null)
        }
        if (callCount === 2) {
          // company insert -> returns new company
          return chainMock({ id: 'comp-1' }, null)
        }
        if (callCount === 3) {
          // company_members insert
          return chainMock(null, null)
        }
        if (callCount === 4) {
          // company_members update (full_name)
          return chainMock(null, null)
        }
        if (callCount === 5) {
          // company_settings upsert
          const ch = chainMock(null, null)
          ch.upsert = vi.fn().mockResolvedValue({ error: null })
          return ch
        }
        if (callCount === 6) {
          // subscription lookup -> null (no existing)
          return chainMock(null, null)
        }
        // subscription insert + any remaining calls
        return chainMock(null, null)
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { POST } = await import('@/app/api/onboarding/complete/route')
    const req = new Request('http://localhost/api/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 15. calendar/feed GET
// ---------------------------------------------------------------------------

describe('GET /api/calendar/feed', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when user/token params are missing', async () => {
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn() } as never)

    const { GET } = await import('@/app/api/calendar/feed/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/calendar/feed'))
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 when token is invalid', async () => {
    const ch = chainMock({ calendar_token: 'correct-token', locale: 'sv', timezone: 'Europe/Stockholm' })
    const adminClient = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/calendar/feed/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/calendar/feed?user=u1&token=wrong-token'))
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('returns ICS content on happy path', async () => {
    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // settings lookup
          return chainMock({ calendar_token: 'tok', locale: 'sv', timezone: 'Europe/Stockholm' })
        }
        if (callCount === 2) {
          // membership
          return chainMock({ company_id: 'c1' })
        }
        if (callCount === 3) {
          // company base_currency
          return chainMock({ base_currency: 'SEK' })
        }
        // gigs query - returns empty array
        return chainMock([], null)
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/calendar/feed/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/calendar/feed?user=u1&token=tok'))
    const res = await GET(req)
    expect(res.headers.get('content-type')).toContain('text/calendar')
  })

  it('generates ICS with all-day gig events', async () => {
    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return chainMock({ calendar_token: 'tok', locale: 'sv', timezone: 'Europe/Stockholm' })
        }
        if (callCount === 2) {
          return chainMock({ company_id: 'c1' })
        }
        if (callCount === 3) {
          return chainMock({ base_currency: 'SEK' })
        }
        // gigs with dates
        return chainMock(
          [
            {
              id: 'g1',
              project_name: 'Konsert',
              venue: 'Konserthuset',
              fee: 5000,
              status: 'accepted',
              notes: 'Bring music',
              user_id: 'u1',
              client: { name: 'Orkestern' },
              gig_type: { name: 'Konsert' },
              gig_dates: [{ date: '2026-03-15', sessions: [], venue: null }],
            },
          ],
          null,
        )
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/calendar/feed/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/calendar/feed?user=u1&token=tok'))
    const res = await GET(req)
    const text = await res.text()
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).toContain('END:VCALENDAR')
    expect(text).toContain('BEGIN:VEVENT')
    expect(text).toContain('Konsert (Orkestern)')
    expect(text).toContain('DTSTART;VALUE=DATE:20260315')
    expect(text).toContain('DTEND;VALUE=DATE:20260316')
    expect(text).toContain('STATUS:CONFIRMED')
    expect(text).toContain('Konserthuset')
  })

  it('generates ICS with timed sessions', async () => {
    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return chainMock({ calendar_token: 'tok', locale: 'en', timezone: 'Europe/London' })
        }
        if (callCount === 2) {
          return chainMock({ company_id: 'c1' })
        }
        if (callCount === 3) {
          return chainMock({ base_currency: 'EUR' })
        }
        return chainMock(
          [
            {
              id: 'g2',
              project_name: null,
              venue: 'Hall A',
              fee: null,
              status: 'tentative',
              notes: null,
              user_id: 'u1',
              client: null,
              gig_type: { name: 'Rehearsal' },
              gig_dates: [
                {
                  date: '2026-04-10',
                  sessions: [
                    { start: '10:00', end: '12:00', label: 'Morning' },
                    { start: '14:00', end: null },
                  ],
                  venue: 'Room B',
                },
              ],
            },
          ],
          null,
        )
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/calendar/feed/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/calendar/feed?user=u1&token=tok'))
    const res = await GET(req)
    const text = await res.text()
    expect(text).toContain('DTSTART;TZID=Europe/London:20260410T100000')
    expect(text).toContain('DTEND;TZID=Europe/London:20260410T120000')
    // Second session has no end, defaults to start + 2h
    expect(text).toContain('DTSTART;TZID=Europe/London:20260410T140000')
    expect(text).toContain('DTEND;TZID=Europe/London:20260410T160000')
    expect(text).toContain('Morning: Rehearsal (Unknown client)')
    expect(text).toContain('Room B')
    expect(text).toContain('STATUS:TENTATIVE')
    // English labels
    expect(text).toContain('Amida')
  })

  it('generates ICS with shared scope showing all company gigs', async () => {
    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return chainMock({ calendar_token: 'tok', locale: 'en', timezone: 'Europe/Stockholm' })
        }
        if (callCount === 2) {
          return chainMock({ company_id: 'c1' })
        }
        if (callCount === 3) {
          return chainMock({ base_currency: 'USD' })
        }
        return chainMock([], null)
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/calendar/feed/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/calendar/feed?user=u1&token=tok&scope=shared'))
    const res = await GET(req)
    const text = await res.text()
    expect(text).toContain('Team events')
  })

  it('uses fallback timezone when unknown tz is provided', async () => {
    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return chainMock({ calendar_token: 'tok', locale: 'sv', timezone: 'Unknown/Zone' })
        }
        if (callCount === 2) return chainMock(null) // no membership
        // gigs
        return chainMock([], null)
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/calendar/feed/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/calendar/feed?user=u1&token=tok'))
    const res = await GET(req)
    const text = await res.text()
    // Fallback to Europe/Stockholm VTIMEZONE
    expect(text).toContain('TZID:Europe/Stockholm')
  })

  it('generates multi-date gig events', async () => {
    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return chainMock({ calendar_token: 'tok', locale: 'sv', timezone: 'Europe/Stockholm' })
        }
        if (callCount === 2) return chainMock({ company_id: 'c1' })
        if (callCount === 3) return chainMock({ base_currency: 'SEK' })
        return chainMock(
          [
            {
              id: 'g3',
              project_name: 'Festival',
              venue: 'Park',
              fee: 10000,
              status: 'accepted',
              notes: null,
              user_id: 'u1',
              client: { name: 'Arrangör' },
              gig_type: { name: 'Konsert' },
              gig_dates: [
                { date: '2026-06-01', sessions: [], venue: null },
                { date: '2026-06-02', sessions: [], venue: 'Stage B' },
              ],
            },
          ],
          null,
        )
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/calendar/feed/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/calendar/feed?user=u1&token=tok'))
    const res = await GET(req)
    const text = await res.text()
    // Two all-day events
    expect(text).toContain('DTSTART;VALUE=DATE:20260601')
    expect(text).toContain('DTSTART;VALUE=DATE:20260602')
    // Second date has venue override
    expect(text).toContain('Stage B')
    // Fee displayed
    expect(text).toContain('10')
  })

  it('returns 500 when gig query fails', async () => {
    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return chainMock({ calendar_token: 'tok', locale: 'sv', timezone: 'Europe/Stockholm' })
        }
        if (callCount === 2) return chainMock({ company_id: 'c1' })
        if (callCount === 3) return chainMock({ base_currency: 'SEK' })
        // gigs query error
        return chainMock(null, { message: 'DB fail' })
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/calendar/feed/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/calendar/feed?user=u1&token=tok'))
    const res = await GET(req)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 16. gigs/draft POST + DELETE
// ---------------------------------------------------------------------------

describe('POST /api/gigs/draft', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/gigs/draft/route')
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 400 when no gig types configured', async () => {
    const client = mockAuthClient()
    const ch = chainMock(null)
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/gigs/draft/route')
    const res = await POST()
    expect(res.status).toBe(400)
  })

  it('creates draft on happy path', async () => {
    const client = mockAuthClient()
    let callCount = 0
    client.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // gig_types lookup
        return chainMock({ id: 'gt-1' })
      }
      // gigs insert
      return chainMock({ id: 'draft-1' })
    })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/gigs/draft/route')
    const res = await POST()
    const body = await res.json()
    expect(body.id).toBe('draft-1')
  })
})

describe('DELETE /api/gigs/draft', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { DELETE } = await import('@/app/api/gigs/draft/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/gigs/draft?id=abc'))
    const res = await DELETE(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when id is missing', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { DELETE } = await import('@/app/api/gigs/draft/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/gigs/draft'))
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when gig is not a draft', async () => {
    const client = mockAuthClient()
    client.from.mockReturnValue(chainMock({ id: 'abc', status: 'accepted' }))
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { DELETE } = await import('@/app/api/gigs/draft/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/gigs/draft?id=abc'))
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('deletes draft on happy path', async () => {
    const client = mockAuthClient()
    let callCount = 0
    client.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // gig lookup
        return chainMock({ id: 'abc', status: 'draft' })
      }
      if (callCount === 2) {
        // attachments lookup - returns empty array via thenable chain
        return chainMock([], null)
      }
      // gigs delete - returns no error
      return chainMock(null, null)
    })
    client.storage.from.mockReturnValue({ remove: vi.fn() })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { DELETE } = await import('@/app/api/gigs/draft/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/gigs/draft?id=abc'))
    const res = await DELETE(req)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 17. settings/test-email POST
// ---------------------------------------------------------------------------

describe('POST /api/settings/test-email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 5 })
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 })

    const { POST } = await import('@/app/api/settings/test-email/route')
    const req = new Request('http://localhost/api/settings/test-email', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(429)
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/settings/test-email/route')
    const req = new Request('http://localhost/api/settings/test-email', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid email data', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/settings/test-email/route')
    const req = new Request('http://localhost/api/settings/test-email', {
      method: 'POST',
      body: JSON.stringify({ to_email: 'not-an-email' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when resend API key is not configured', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const adminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [] }),
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { POST } = await import('@/app/api/settings/test-email/route')
    const req = new Request('http://localhost/api/settings/test-email', {
      method: 'POST',
      body: JSON.stringify({ to_email: 'test@example.com' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('not configured')
  })

  it('sends email successfully with Resend on happy path', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const adminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [
            { key: 'resend_api_key', value: 're_test_key' },
            { key: 'resend_from_email', value: 'noreply@test.com' },
          ],
        }),
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)
    mockResendSend.mockResolvedValue({ id: 'msg-1' })

    const { POST } = await import('@/app/api/settings/test-email/route')
    const req = new Request('http://localhost/api/settings/test-email', {
      method: 'POST',
      body: JSON.stringify({ to_email: 'recipient@example.com' }),
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.message).toBe('Test email sent!')
    expect(mockResendSend).toHaveBeenCalled()
  })

  it('uses default from email when not configured', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const adminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [{ key: 'resend_api_key', value: 're_test_key' }],
        }),
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)
    mockResendSend.mockResolvedValue({ id: 'msg-2' })

    const { POST } = await import('@/app/api/settings/test-email/route')
    const req = new Request('http://localhost/api/settings/test-email', {
      method: 'POST',
      body: JSON.stringify({ to_email: 'recipient@example.com' }),
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 500 when Resend throws', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const adminClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({
          data: [{ key: 'resend_api_key', value: 're_test_key' }],
        }),
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)
    mockResendSend.mockRejectedValue(new Error('Resend API error'))

    const { POST } = await import('@/app/api/settings/test-email/route')
    const req = new Request('http://localhost/api/settings/test-email', {
      method: 'POST',
      body: JSON.stringify({ to_email: 'recipient@example.com' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Resend API error')
  })
})

// ---------------------------------------------------------------------------
// 18. settings/ai-usage GET
// ---------------------------------------------------------------------------

describe('GET /api/settings/ai-usage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401/403 when not admin', async () => {
    vi.mocked(verifyAdmin).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    const { GET } = await import('@/app/api/settings/ai-usage/route')
    const req = new Request('http://localhost/api/settings/ai-usage')
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns usage stats on happy path', async () => {
    const logsData = [
      {
        id: 'l1',
        created_at: '2026-01-01T00:00:00Z',
        usage_type: 'receipt_scan',
        model: 'gpt-4',
        input_tokens: 100,
        output_tokens: 50,
        estimated_cost_usd: 0.01,
      },
    ]
    // The chain needs to resolve via thenable: the route does
    // `await auth.supabase.from('ai_usage_logs').select('*').gte(...).order(...)`
    const ch = chainMock(logsData, null)
    vi.mocked(verifyAdmin).mockResolvedValue({
      userId: 'admin-1',
      supabase: { from: vi.fn().mockReturnValue(ch) },
    } as never)

    const { GET } = await import('@/app/api/settings/ai-usage/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/settings/ai-usage?period=7d'))
    const res = await GET(req)
    const body = await res.json()
    expect(body.totalCalls).toBe(1)
    expect(body.period).toBe('7d')
  })
})
