import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/api-auth', () => ({
  validateApiKey: vi.fn(),
  requireScope: vi.fn(),
}))

vi.mock('@/lib/api-response', () => ({
  apiSuccess: vi.fn((data: unknown, status = 200) => {
    return Response.json({ success: true, data }, { status })
  }),
  apiError: vi.fn((error: string, status = 400) => {
    return Response.json({ success: false, error }, { status })
  }),
  apiValidationError: vi.fn((fieldErrors: unknown) => {
    return Response.json({ success: false, error: 'Validation failed', fieldErrors }, { status: 400 })
  }),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 10 })),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/schemas/gig', () => ({
  createGigSchema: { safeParse: vi.fn() },
}))

vi.mock('@/lib/schemas/client', () => ({
  createClientSchema: { safeParse: vi.fn() },
}))

vi.mock('@/lib/schemas/invoice', () => ({
  createInvoiceSchema: { safeParse: vi.fn() },
}))

vi.mock('@/lib/expenses/categories', () => ({
  EXPENSE_CATEGORIES: ['transport', 'software', 'supplies', 'other'],
}))

import { validateApiKey, requireScope } from '@/lib/api-auth'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createGigSchema } from '@/lib/schemas/gig'
import { createClientSchema } from '@/lib/schemas/client'
import { createInvoiceSchema } from '@/lib/schemas/invoice'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chainMock(data: unknown = null, error: unknown = null, count = 0) {
  const result = { data, error, count }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {}
  const thenFn = (resolve: (v: unknown) => void) => resolve(result)
  const methods = [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'neq',
    'in',
    'gte',
    'lte',
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

function mockAuthSuccess() {
  vi.mocked(validateApiKey).mockResolvedValue({
    success: true,
    userId: 'user-1',
    scopes: [
      'read:gigs',
      'write:gigs',
      'read:clients',
      'write:clients',
      'read:invoices',
      'write:invoices',
      'read:expenses',
      'write:expenses',
    ],
    keyId: 'key-1',
  })
  vi.mocked(requireScope).mockReturnValue({ success: true })
}

function mockAuthFail() {
  vi.mocked(validateApiKey).mockResolvedValue({
    success: false,
    error: 'Invalid API key',
    status: 401,
  })
}

function mockScopeFail() {
  vi.mocked(validateApiKey).mockResolvedValue({
    success: true,
    userId: 'user-1',
    scopes: [],
    keyId: 'key-1',
  })
  vi.mocked(requireScope).mockReturnValue({
    success: false,
    error: 'Insufficient permissions',
    status: 403,
  })
}

// ---------------------------------------------------------------------------
// 26. v1/gigs GET + POST
// ---------------------------------------------------------------------------

describe('GET /api/v1/gigs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 })

    const { GET } = await import('@/app/api/v1/gigs/route')
    const req = new Request('http://localhost/api/v1/gigs', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(429)
  })

  it('returns 401 when API key is invalid', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/gigs/route')
    const req = new Request('http://localhost/api/v1/gigs', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 403 when scope is missing', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockScopeFail()

    const { GET } = await import('@/app/api/v1/gigs/route')
    const req = new Request('http://localhost/api/v1/gigs', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(403)
  })

  it('returns gigs on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock([{ id: 'g1', project_name: 'Concert' }], null, 1)

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/gigs/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/v1/gigs?limit=10'), {
      headers: { authorization: 'Bearer ak_test123456789012345678901234567890123456789012345678901234567890' },
    })
    const res = await GET(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.gigs).toHaveLength(1)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    // Make the chain throw when awaited
    const ch = chainMock()
    ch.then = (_resolve: unknown, reject: (e: Error) => void) => reject(new Error('DB failure'))

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/gigs/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/v1/gigs'), {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req)
    expect(res.status).toBe(500)
  })
})

describe('POST /api/v1/gigs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when API key is invalid', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { POST } = await import('@/app/api/v1/gigs/route')
    const req = new Request('http://localhost/api/v1/gigs', {
      method: 'POST',
      headers: { authorization: 'Bearer invalid' },
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()
    vi.mocked(createGigSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { dates: ['Required'] } }) },
    } as never)

    const { POST } = await import('@/app/api/v1/gigs/route')
    const req = new Request('http://localhost/api/v1/gigs', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('creates gig on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()
    vi.mocked(createGigSchema.safeParse).mockReturnValue({
      success: true,
      data: { gig_type_id: 'gt1', dates: ['2026-01-01'], fee: 1000, status: 'tentative' },
    } as never)

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return chainMock({ company_id: 'c1' }) // membership
        if (callCount === 2) return chainMock({ id: 'gig-1' }) // gig insert
        if (callCount === 3) {
          // gig_dates insert
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }
        return chainMock({ id: 'gig-1', project_name: 'Test' }) // full gig fetch
      }),
    } as never)

    const { POST } = await import('@/app/api/v1/gigs/route')
    const req = new Request('http://localhost/api/v1/gigs', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
// 27. v1/clients GET + POST
// ---------------------------------------------------------------------------

describe('GET /api/v1/clients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
  })

  it('returns 401 when API key is invalid', async () => {
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/clients/route')
    const req = new Request('http://localhost/api/v1/clients', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns clients on happy path', async () => {
    mockAuthSuccess()

    const ch = chainMock([{ id: 'cl1', name: 'Client A' }], null, 1)
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/clients/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/v1/clients'), {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.clients).toHaveLength(1)
  })
})

describe('POST /api/v1/clients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
  })

  it('returns 400 for invalid data', async () => {
    mockAuthSuccess()
    vi.mocked(createClientSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { name: ['Required'] } }) },
    } as never)

    const { POST } = await import('@/app/api/v1/clients/route')
    const req = new Request('http://localhost/api/v1/clients', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('creates client on happy path', async () => {
    mockAuthSuccess()
    vi.mocked(createClientSchema.safeParse).mockReturnValue({
      success: true,
      data: { name: 'New Client' },
    } as never)

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return chainMock({ company_id: 'c1' }) // membership
        return chainMock({ id: 'cl-new', name: 'New Client' }) // insert
      }),
    } as never)

    const { POST } = await import('@/app/api/v1/clients/route')
    const req = new Request('http://localhost/api/v1/clients', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
// 28. v1/invoices GET + POST
// ---------------------------------------------------------------------------

describe('GET /api/v1/invoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
  })

  it('returns 401 when API key is invalid', async () => {
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/invoices/route')
    const req = new Request('http://localhost/api/v1/invoices', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns invoices on happy path', async () => {
    mockAuthSuccess()

    const ch = chainMock([{ id: 'inv1', invoice_number: 1 }], null, 1)
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/invoices/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/v1/invoices'), {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.invoices).toHaveLength(1)
  })
})

describe('POST /api/v1/invoices', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
  })

  it('returns 400 for invalid data', async () => {
    mockAuthSuccess()
    vi.mocked(createInvoiceSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { client_id: ['Required'] } }) },
    } as never)

    const { POST } = await import('@/app/api/v1/invoices/route')
    const req = new Request('http://localhost/api/v1/invoices', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('creates invoice on happy path', async () => {
    mockAuthSuccess()
    vi.mocked(createInvoiceSchema.safeParse).mockReturnValue({
      success: true,
      data: {
        client_id: 'cl1',
        vat_rate: 25,
        payment_terms: 30,
        lines: [{ description: 'Service', quantity: 1, unit_price: 1000, vat_rate: 25 }],
      },
    } as never)

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // last invoice number
          return chainMock({ invoice_number: 42 })
        }
        if (callCount === 2) {
          // insert invoice
          return chainMock({ id: 'inv-new', invoice_number: 43 })
        }
        if (callCount === 3) {
          // insert lines
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }
        // full invoice fetch
        return chainMock({ id: 'inv-new', total: 1250 })
      }),
    } as never)

    const { POST } = await import('@/app/api/v1/invoices/route')
    const req = new Request('http://localhost/api/v1/invoices', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
// 29. v1/expenses GET + POST
// ---------------------------------------------------------------------------

describe('GET /api/v1/expenses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
  })

  it('returns 401 when API key is invalid', async () => {
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/expenses/route')
    const req = new Request('http://localhost/api/v1/expenses', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns expenses on happy path', async () => {
    mockAuthSuccess()

    const ch = chainMock([{ id: 'e1', supplier: 'Store', amount: 100 }], null, 1)
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/expenses/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/v1/expenses'), {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.expenses).toHaveLength(1)
  })
})

describe('POST /api/v1/expenses', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
  })

  it('creates expense on happy path', async () => {
    mockAuthSuccess()

    // The route uses a local zod schema, so we need to provide valid data
    // that would pass the real schema. We'll mock at the DB level.
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(chainMock({ id: 'e-new', supplier: 'Test', amount: 50 })),
    } as never)

    const { POST } = await import('@/app/api/v1/expenses/route')
    const req = new Request('http://localhost/api/v1/expenses', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: JSON.stringify({ date: '2026-01-01', supplier: 'Test', amount: 50 }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(201)
  })

  it('returns 400 for invalid expense data', async () => {
    mockAuthSuccess()

    const { POST } = await import('@/app/api/v1/expenses/route')
    const req = new Request('http://localhost/api/v1/expenses', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: JSON.stringify({}), // missing required fields
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })
})
