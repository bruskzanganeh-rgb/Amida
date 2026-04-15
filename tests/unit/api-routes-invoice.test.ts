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

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn(() => ({ success: true, remaining: 10 })),
  rateLimitResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })),
}))

vi.mock('@/lib/usage', () => ({
  checkUsageLimit: vi.fn(),
  incrementUsage: vi.fn(),
}))

vi.mock('@/lib/activity', () => ({
  logActivity: vi.fn(),
}))

vi.mock('@/lib/pdf/generator', () => ({
  generateInvoicePdf: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
}))

vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = { send: vi.fn().mockResolvedValue({ id: 'email-1' }) }
  },
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { checkUsageLimit, incrementUsage } from '@/lib/usage'

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
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'in', 'order', 'limit']
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.then = thenFn
  return chain
}

// ---------------------------------------------------------------------------
// 40. invoices/send-email POST
// ---------------------------------------------------------------------------

describe('POST /api/invoices/send-email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 5 })
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321'
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 })

    const { POST } = await import('@/app/api/invoices/send-email/route')
    const req = new Request('http://localhost/api/invoices/send-email', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(429)
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/invoices/send-email/route')
    const req = new Request('http://localhost/api/invoices/send-email', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/invoices/send-email/route')
    const req = new Request('http://localhost/api/invoices/send-email', {
      method: 'POST',
      body: JSON.stringify({ invoiceId: 'inv1' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('returns 403 when email limit reached', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: false,
      current: 2,
      limit: 2,
    } as never)

    const { POST } = await import('@/app/api/invoices/send-email/route')
    const req = new Request('http://localhost/api/invoices/send-email', {
      method: 'POST',
      body: JSON.stringify({ invoiceId: 'inv1', to: 'client@test.com', subject: 'Invoice' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(403)
  })

  it('returns 404 when invoice not found', async () => {
    const client = mockAuthClient()
    client.from.mockReturnValue(chainMock(null, { message: 'not found' }))
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(checkUsageLimit).mockResolvedValue({ allowed: true } as never)
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn() } as never)

    const { POST } = await import('@/app/api/invoices/send-email/route')
    const req = new Request('http://localhost/api/invoices/send-email', {
      method: 'POST',
      body: JSON.stringify({ invoiceId: 'inv1', to: 'client@test.com', subject: 'Invoice' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(404)
  })

  it('sends email on happy path', async () => {
    const invoiceData = {
      id: 'inv1',
      invoice_number: 42,
      invoice_date: '2026-01-01',
      due_date: '2026-01-31',
      subtotal: 1000,
      vat_rate: 25,
      vat_amount: 250,
      total: 1250,
      status: 'draft',
      notes: null,
      reverse_charge: false,
      customer_vat_number: null,
      reference_person_override: null,
      currency: 'SEK',
      sent_date: null,
      client: {
        name: 'Client A',
        email: 'client@test.com',
        org_number: null,
        address: null,
        payment_terms: 30,
        reference_person: null,
        invoice_language: 'sv',
      },
    }

    const companyData = {
      company_name: 'Test AB',
      org_number: '123',
      address: 'Test St',
      email: 'company@test.com',
      phone: '123',
      bank_account: '1234',
    }

    const client = mockAuthClient()
    let callCount = 0
    client.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return chainMock(invoiceData) // invoice
      if (callCount === 2) return chainMock({ plan: 'pro', status: 'active' }) // subscription
      if (callCount === 3) return chainMock({ company_id: 'c1' }) // membership
      if (callCount === 4) return chainMock(companyData) // company
      if (callCount === 5) return chainMock([{ description: 'Service', amount: 1000, vat_rate: 25 }]) // lines
      if (callCount === 6) return chainMock({ value: 'Amida' }) // branding
      return chainMock(null, null) // remaining
    })
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(checkUsageLimit).mockResolvedValue({ allowed: true } as never)
    vi.mocked(incrementUsage).mockResolvedValue(undefined)

    const adminCh = chainMock([{ key: 'resend_api_key', value: 'test-key' }], null)
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(adminCh),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    } as never)

    const { POST } = await import('@/app/api/invoices/send-email/route')
    const req = new Request('http://localhost/api/invoices/send-email', {
      method: 'POST',
      body: JSON.stringify({ invoiceId: 'inv1', to: 'client@test.com', subject: 'Invoice #42' }),
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(incrementUsage).toHaveBeenCalledWith('user-1', 'email_send')
  })
})

// ---------------------------------------------------------------------------
// 41. invoices/send-reminder POST
// ---------------------------------------------------------------------------

describe('POST /api/invoices/send-reminder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 5 })
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 })

    const { POST } = await import('@/app/api/invoices/send-reminder/route')
    const req = new Request('http://localhost/api/invoices/send-reminder', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(429)
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/invoices/send-reminder/route')
    const req = new Request('http://localhost/api/invoices/send-reminder', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 when required fields are missing', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/invoices/send-reminder/route')
    const req = new Request('http://localhost/api/invoices/send-reminder', {
      method: 'POST',
      body: JSON.stringify({ invoiceId: 'inv1' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('returns 403 when email limit reached', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(checkUsageLimit).mockResolvedValue({
      allowed: false,
      current: 5,
      limit: 5,
    } as never)

    const { POST } = await import('@/app/api/invoices/send-reminder/route')
    const req = new Request('http://localhost/api/invoices/send-reminder', {
      method: 'POST',
      body: JSON.stringify({ invoiceId: 'inv1', to: 'client@test.com', subject: 'Reminder' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(403)
  })

  it('returns 404 when invoice not found', async () => {
    const client = mockAuthClient()
    client.from.mockReturnValue(chainMock(null, { message: 'not found' }))
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(checkUsageLimit).mockResolvedValue({ allowed: true } as never)
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn() } as never)

    const { POST } = await import('@/app/api/invoices/send-reminder/route')
    const req = new Request('http://localhost/api/invoices/send-reminder', {
      method: 'POST',
      body: JSON.stringify({ invoiceId: 'inv1', to: 'client@test.com', subject: 'Reminder' }),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(404)
  })

  it('sends reminder on happy path', async () => {
    const invoiceData = {
      id: 'inv1',
      invoice_number: 42,
      invoice_date: '2026-01-01',
      due_date: '2026-01-31',
      subtotal: 1000,
      vat_rate: 25,
      vat_amount: 250,
      total: 1250,
      status: 'sent',
      notes: null,
      reverse_charge: false,
      customer_vat_number: null,
      reference_person_override: null,
      currency: 'SEK',
      client: {
        name: 'Client A',
        org_number: null,
        address: null,
        payment_terms: 30,
        reference_person: null,
        invoice_language: 'sv',
      },
    }

    const companyData = {
      company_name: 'Test AB',
      org_number: '123',
      address: 'Test St',
      email: 'company@test.com',
      phone: '123',
      bank_account: '1234',
    }

    const client = mockAuthClient()
    let callCount = 0
    client.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return chainMock(invoiceData) // invoice
      if (callCount === 2) return chainMock({ plan: 'free', status: 'active' }) // subscription
      if (callCount === 3) return chainMock({ company_id: 'c1' }) // membership
      if (callCount === 4) return chainMock(companyData) // company
      if (callCount === 5) return chainMock([{ description: 'Service', amount: 1000, vat_rate: 25 }]) // lines
      if (callCount === 6) return chainMock({ value: 'Amida' }) // branding
      if (callCount === 7) return chainMock({ reminder_number: 0 }) // max reminder
      return chainMock(null, null) // remaining (insert, etc.)
    })
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(checkUsageLimit).mockResolvedValue({ allowed: true } as never)
    vi.mocked(incrementUsage).mockResolvedValue(undefined)

    let adminCallCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        adminCallCount++
        if (adminCallCount === 1) {
          // platform_config for resend keys
          return chainMock([{ key: 'resend_api_key', value: 'test-key' }], null)
        }
        // existing pdf_url check, invoices update, etc.
        return chainMock({ pdf_url: null }, null)
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    } as never)

    const { POST } = await import('@/app/api/invoices/send-reminder/route')
    const req = new Request('http://localhost/api/invoices/send-reminder', {
      method: 'POST',
      body: JSON.stringify({
        invoiceId: 'inv1',
        to: 'client@test.com',
        subject: 'Reminder: Invoice #42',
        message: 'Please pay',
      }),
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.reminderNumber).toBeDefined()
    expect(incrementUsage).toHaveBeenCalledWith('user-1', 'email_send')
  })
})
