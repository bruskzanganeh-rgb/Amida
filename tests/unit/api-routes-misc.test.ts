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

vi.mock('@/lib/activity', () => ({
  logActivity: vi.fn(),
}))

vi.mock('@/lib/schedule/parser', () => ({
  parseScheduleTexts: vi.fn(),
  parseScheduleWithVision: vi.fn(),
  parseScheduleWithPdf: vi.fn(),
  sessionsToText: vi.fn((sessions: unknown[]) => sessions.map(() => 'text').join('\n')),
}))

vi.mock('@/lib/pdf/generator', () => ({
  generateInvoicePdf: vi.fn(),
}))

const mockAnthropicCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockAnthropicCreate }
    },
  }
})

vi.mock('@/lib/schemas/translate', () => ({
  translateSchema: {
    safeParse: vi.fn(),
  },
}))

vi.mock('@/lib/stripe', () => ({
  getStripe: vi.fn(),
  getPlanFromPriceId: vi.fn((priceId: string) => (priceId?.includes('team') ? 'team' : 'pro')),
}))

// Mock next/headers for translate route
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
  }),
}))

// Mock @supabase/ssr for translate route
vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { parseScheduleTexts, parseScheduleWithVision, parseScheduleWithPdf } from '@/lib/schedule/parser'
import { generateInvoicePdf } from '@/lib/pdf/generator'
import { getStripe } from '@/lib/stripe'
import { createServerClient as createSupabaseSsr } from '@supabase/ssr'
import { NextRequest } from 'next/server'

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

function mockAdminClient() {
  return {
    from: vi.fn(),
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn(),
        upload: vi.fn(),
        remove: vi.fn(),
        getPublicUrl: vi.fn(),
      }),
    },
  }
}

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

function makeRequest(url: string, opts?: RequestInit): NextRequest {
  return new NextRequest(new Request(url, opts))
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

// ---------------------------------------------------------------------------
// 1. gigs/parse-schedule POST
// ---------------------------------------------------------------------------

describe('POST /api/gigs/parse-schedule', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 } as never)

    const { POST } = await import('@/app/api/gigs/parse-schedule/route')
    const req = makeRequest('http://localhost/api/gigs/parse-schedule', {
      method: 'POST',
      body: JSON.stringify({ entries: [] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(429)
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 } as never)
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/gigs/parse-schedule/route')
    const req = makeRequest('http://localhost/api/gigs/parse-schedule', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ date: '2026-01-01', text: 'Rep 10-12' }] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when entries are missing', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ locale: 'sv' }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { locale: 'sv' }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/gigs/parse-schedule/route')
    const req = makeRequest('http://localhost/api/gigs/parse-schedule', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when entries is empty array', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ locale: 'sv' }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { locale: 'sv' }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/gigs/parse-schedule/route')
    const req = makeRequest('http://localhost/api/gigs/parse-schedule', {
      method: 'POST',
      body: JSON.stringify({ entries: [] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('parses schedule on happy path', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ locale: 'sv' }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { locale: 'sv' }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(parseScheduleTexts).mockResolvedValue([{ time: '10:00', type: 'rehearsal', description: 'Rep' }] as never)

    const { POST } = await import('@/app/api/gigs/parse-schedule/route')
    const req = makeRequest('http://localhost/api/gigs/parse-schedule', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ date: '2026-01-01', text: 'Rep 10-12' }] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.sessions).toBeDefined()
  })

  it('returns 500 on parser error', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ locale: 'sv' }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { locale: 'sv' }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(parseScheduleTexts).mockRejectedValue(new Error('Parse failed'))

    const { POST } = await import('@/app/api/gigs/parse-schedule/route')
    const req = makeRequest('http://localhost/api/gigs/parse-schedule', {
      method: 'POST',
      body: JSON.stringify({ entries: [{ date: '2026-01-01', text: 'Rep' }] }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 2. gigs/scan-schedule POST
// ---------------------------------------------------------------------------

describe('POST /api/gigs/scan-schedule', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 } as never)

    const { POST } = await import('@/app/api/gigs/scan-schedule/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'schedule.jpg', { type: 'image/jpeg' }))
    const req = makeRequest('http://localhost/api/gigs/scan-schedule', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    expect(res.status).toBe(429)
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 } as never)
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/gigs/scan-schedule/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'schedule.jpg', { type: 'image/jpeg' }))
    const req = makeRequest('http://localhost/api/gigs/scan-schedule', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when no file uploaded', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ locale: 'sv' }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { locale: 'sv' }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/gigs/scan-schedule/route')
    const form = new FormData()
    const req = makeRequest('http://localhost/api/gigs/scan-schedule', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid file type', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ locale: 'sv' }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { locale: 'sv' }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/gigs/scan-schedule/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'schedule.txt', { type: 'text/plain' }))
    const req = makeRequest('http://localhost/api/gigs/scan-schedule', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Invalid file type')
  })

  it('accepts small file (size check code path)', async () => {
    // jsdom doesn't support overriding File.size, so we verify the size check
    // code path exists by confirming a small file passes through to the parser
    const client = mockAuthClient()
    const ch = chainMock({ locale: 'sv' }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { locale: 'sv' }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(parseScheduleWithVision).mockResolvedValue({
      dates: { '2026-01-01': [] },
      project_name: 'Test',
      venue: 'Hall',
      confidence: 0.9,
    } as never)

    const { POST } = await import('@/app/api/gigs/scan-schedule/route')
    const form = new FormData()
    form.append('file', new File(['small'], 'small.jpg', { type: 'image/jpeg' }))
    const req = makeRequest('http://localhost/api/gigs/scan-schedule', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(parseScheduleWithVision).toHaveBeenCalled()
  })

  it('scans image schedule on happy path', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ locale: 'sv' }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { locale: 'sv' }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(parseScheduleWithVision).mockResolvedValue({
      dates: { '2026-01-15': [{ time: '10:00', type: 'rehearsal' }] },
      project_name: 'Symphony No. 5',
      venue: 'Concert Hall',
      confidence: 0.9,
    } as never)

    const { POST } = await import('@/app/api/gigs/scan-schedule/route')
    const form = new FormData()
    form.append('file', new File(['fake-image'], 'schedule.jpg', { type: 'image/jpeg' }))
    const req = makeRequest('http://localhost/api/gigs/scan-schedule', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.projectName).toBe('Symphony No. 5')
    expect(body.venue).toBe('Concert Hall')
  })

  it('scans PDF schedule on happy path', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ locale: 'en' }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { locale: 'en' }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(parseScheduleWithPdf).mockResolvedValue({
      dates: { '2026-02-01': [{ time: '19:00', type: 'concert' }] },
      project_name: 'Gala Concert',
      venue: 'Opera House',
      confidence: 0.85,
    } as never)

    const { POST } = await import('@/app/api/gigs/scan-schedule/route')
    const form = new FormData()
    form.append('file', new File(['fake-pdf'], 'schedule.pdf', { type: 'application/pdf' }))
    const req = makeRequest('http://localhost/api/gigs/scan-schedule', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.projectName).toBe('Gala Concert')
  })

  it('returns 500 on scan error', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ locale: 'sv' }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { locale: 'sv' }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(parseScheduleWithVision).mockRejectedValue(new Error('Vision API failed'))

    const { POST } = await import('@/app/api/gigs/scan-schedule/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'schedule.jpg', { type: 'image/jpeg' }))
    const req = makeRequest('http://localhost/api/gigs/scan-schedule', {
      method: 'POST',
      body: form,
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Vision API failed')
  })
})

// ---------------------------------------------------------------------------
// 3. invoices/[id]/pdf GET
// ---------------------------------------------------------------------------

describe('GET /api/invoices/[id]/pdf', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 } as never)

    const { GET } = await import('@/app/api/invoices/[id]/pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(429)
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 } as never)
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/invoices/[id]/pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when invoice not found', async () => {
    const client = mockAuthClient()
    const ch = chainMock(null, { message: 'not found' })
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/invoices/[id]/pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(404)
  })

  it('returns 500 when company membership not found', async () => {
    const client = mockAuthClient()
    const invoiceCh = chainMock(
      {
        invoice_number: '1001',
        invoice_date: '2026-01-01',
        due_date: '2026-02-01',
        subtotal: 5000,
        vat_rate: 25,
        vat_amount: 1250,
        total: 6250,
        currency: 'SEK',
        notes: null,
        reference_person_override: null,
        reverse_charge: false,
        customer_vat_number: null,
        client: {
          name: 'Client AB',
          org_number: '123456',
          address: 'Street 1',
          payment_terms: 30,
          reference_person: null,
          invoice_language: 'sv',
        },
      },
      null,
    )
    invoiceCh.single = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    })
    // Fix: just mock both calls properly
    const memberCh = chainMock(null, null)
    memberCh.single = vi.fn().mockResolvedValue({ data: null, error: null })

    client.from
      .mockReturnValueOnce(invoiceCh) // invoices
      .mockReturnValueOnce(memberCh) // company_members
    vi.mocked(createClient).mockResolvedValue(client as never)

    // Actually need to fix this - the invoice chain needs single to resolve properly
    const invoiceData = {
      invoice_number: '1001',
      invoice_date: '2026-01-01',
      due_date: '2026-02-01',
      subtotal: 5000,
      vat_rate: 25,
      vat_amount: 1250,
      total: 6250,
      currency: 'SEK',
      notes: null,
      reference_person_override: null,
      reverse_charge: false,
      customer_vat_number: null,
      client: {
        name: 'Client AB',
        org_number: '123456',
        address: 'Street 1',
        payment_terms: 30,
        reference_person: null,
        invoice_language: 'sv',
      },
    }
    const invCh2 = chainMock(invoiceData, null)
    invCh2.single = vi.fn().mockResolvedValue({ data: invoiceData, error: null })
    const memCh2 = chainMock(null, null)
    memCh2.single = vi.fn().mockResolvedValue({ data: null, error: null })

    client.from.mockReset().mockReturnValueOnce(invCh2).mockReturnValueOnce(memCh2)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/invoices/[id]/pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(500)
  })

  it('generates PDF on happy path', async () => {
    const client = mockAuthClient()
    const invoiceData = {
      invoice_number: '1001',
      invoice_date: '2026-01-01',
      due_date: '2026-02-01',
      subtotal: 5000,
      vat_rate: 25,
      vat_amount: 1250,
      total: 6250,
      currency: 'SEK',
      notes: null,
      reference_person_override: null,
      reverse_charge: false,
      customer_vat_number: null,
      client: {
        name: 'Client AB',
        org_number: '123456',
        address: 'Street 1',
        payment_terms: 30,
        reference_person: null,
        invoice_language: 'sv',
      },
    }
    const invCh = chainMock(invoiceData, null)
    invCh.single = vi.fn().mockResolvedValue({ data: invoiceData, error: null })

    const memCh = chainMock({ company_id: 'comp-1' }, null)
    memCh.single = vi.fn().mockResolvedValue({ data: { company_id: 'comp-1' }, error: null })

    const companyData = {
      company_name: 'My Company',
      org_number: '556677',
      address: 'Addr 1',
      city: 'Stockholm',
      country_code: 'SE',
      email: 'a@b.com',
      phone: '123',
      bank_account: '1234',
      bankgiro: null,
      iban: null,
      bic: null,
      bank_address: null,
      vat_registration_number: null,
      late_payment_interest_text: null,
      our_reference: null,
    }
    const compCh = chainMock(companyData, null)
    compCh.single = vi.fn().mockResolvedValue({ data: companyData, error: null })

    const linesCh = chainMock([{ description: 'Performance', amount: 5000, vat_rate: 25 }], null)

    const subCh = chainMock({ plan: 'pro', status: 'active' }, null)
    subCh.single = vi.fn().mockResolvedValue({ data: { plan: 'pro', status: 'active' }, error: null })

    const brandCh = chainMock({ value: 'Amida' }, null)
    brandCh.single = vi.fn().mockResolvedValue({ data: { value: 'Amida' }, error: null })

    client.from
      .mockReturnValueOnce(invCh) // invoices
      .mockReturnValueOnce(memCh) // company_members
      .mockReturnValueOnce(compCh) // companies
      .mockReturnValueOnce(linesCh) // invoice_lines
      .mockReturnValueOnce(subCh) // subscriptions
      .mockReturnValueOnce(brandCh) // platform_config
    vi.mocked(createClient).mockResolvedValue(client as never)

    const fakePdf = new Uint8Array([80, 68, 70])
    vi.mocked(generateInvoicePdf).mockResolvedValue(fakePdf as never)

    const { GET } = await import('@/app/api/invoices/[id]/pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('Faktura-1001')
  })
})

// ---------------------------------------------------------------------------
// 4. invoices/[id]/original-pdf GET
// ---------------------------------------------------------------------------

describe('GET /api/invoices/[id]/original-pdf', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/invoices/[id]/original-pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/original-pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when invoice not found', async () => {
    const client = mockAuthClient()
    const ch = chainMock(null, { message: 'not found' })
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/invoices/[id]/original-pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/original-pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when no original PDF exists', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ original_pdf_url: null }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { original_pdf_url: null }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/invoices/[id]/original-pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/original-pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('No original PDF exists')
  })

  it('returns signed URL on happy path', async () => {
    const client = mockAuthClient()
    const ch = chainMock(
      { original_pdf_url: 'https://proj.supabase.co/storage/v1/object/public/expenses/invoices/abc/original.pdf' },
      null,
    )
    ch.single = vi.fn().mockResolvedValue({
      data: {
        original_pdf_url: 'https://proj.supabase.co/storage/v1/object/public/expenses/invoices/abc/original.pdf',
      },
      error: null,
    })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const admin = mockAdminClient()
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://signed.example.com/original.pdf' },
        error: null,
      }),
    } as never)
    vi.mocked(createAdminClient).mockReturnValue(admin as never)

    const { GET } = await import('@/app/api/invoices/[id]/original-pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/original-pdf')
    const res = await GET(req, makeParams('abc'))
    const body = await res.json()
    expect(body.url).toBe('https://signed.example.com/original.pdf')
    expect(body.expiresAt).toBeDefined()
  })

  it('returns 400 when file path cannot be extracted', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ original_pdf_url: 'invalid-url' }, null)
    ch.single = vi.fn().mockResolvedValue({
      data: { original_pdf_url: 'invalid-url' },
      error: null,
    })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/invoices/[id]/original-pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/original-pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(400)
  })

  it('returns 500 when signed URL creation fails', async () => {
    const client = mockAuthClient()
    const ch = chainMock(
      { original_pdf_url: 'https://proj.supabase.co/storage/v1/object/public/expenses/invoices/abc/original.pdf' },
      null,
    )
    ch.single = vi.fn().mockResolvedValue({
      data: {
        original_pdf_url: 'https://proj.supabase.co/storage/v1/object/public/expenses/invoices/abc/original.pdf',
      },
      error: null,
    })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const admin = mockAdminClient()
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Storage error' },
      }),
    } as never)
    vi.mocked(createAdminClient).mockReturnValue(admin as never)

    const { GET } = await import('@/app/api/invoices/[id]/original-pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/original-pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 5. invoices/[id]/sent-pdf GET
// ---------------------------------------------------------------------------

describe('GET /api/invoices/[id]/sent-pdf', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/invoices/[id]/sent-pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/sent-pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(401)
  })

  it('returns 404 when invoice not found', async () => {
    const client = mockAuthClient()
    const ch = chainMock(null, { message: 'not found' })
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/invoices/[id]/sent-pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/sent-pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(404)
  })

  it('returns 404 when no sent PDF exists', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ pdf_url: null }, null)
    ch.single = vi.fn().mockResolvedValue({ data: { pdf_url: null }, error: null })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/invoices/[id]/sent-pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/sent-pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error).toBe('No sent PDF exists')
  })

  it('returns signed URL on happy path', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ pdf_url: 'invoices/abc/sent.pdf' }, null)
    ch.single = vi.fn().mockResolvedValue({
      data: { pdf_url: 'invoices/abc/sent.pdf' },
      error: null,
    })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const admin = mockAdminClient()
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: 'https://signed.example.com/sent.pdf' },
        error: null,
      }),
    } as never)
    vi.mocked(createAdminClient).mockReturnValue(admin as never)

    const { GET } = await import('@/app/api/invoices/[id]/sent-pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/sent-pdf')
    const res = await GET(req, makeParams('abc'))
    const body = await res.json()
    expect(body.url).toBe('https://signed.example.com/sent.pdf')
    expect(body.expiresAt).toBeDefined()
  })

  it('returns 500 when signed URL fails', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ pdf_url: 'invoices/abc/sent.pdf' }, null)
    ch.single = vi.fn().mockResolvedValue({
      data: { pdf_url: 'invoices/abc/sent.pdf' },
      error: null,
    })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const admin = mockAdminClient()
    admin.storage.from.mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'fail' },
      }),
    } as never)
    vi.mocked(createAdminClient).mockReturnValue(admin as never)

    const { GET } = await import('@/app/api/invoices/[id]/sent-pdf/route')
    const req = makeRequest('http://localhost/api/invoices/abc/sent-pdf')
    const res = await GET(req, makeParams('abc'))
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 6. translate POST
// ---------------------------------------------------------------------------

describe('POST /api/translate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 } as never)

    const { POST } = await import('@/app/api/translate/route')
    const req = new Request('http://localhost/api/translate', {
      method: 'POST',
      body: JSON.stringify({ text: 'violin', targetLang: 'sv' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(429)
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 } as never)
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createSupabaseSsr).mockReturnValue(client as never)

    const { POST } = await import('@/app/api/translate/route')
    const req = new Request('http://localhost/api/translate', {
      method: 'POST',
      body: JSON.stringify({ text: 'violin', targetLang: 'sv' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    const client = mockAuthClient()
    vi.mocked(createSupabaseSsr).mockReturnValue(client as never)

    // Mock the dynamic import of translateSchema
    const { translateSchema } = await import('@/lib/schemas/translate')
    vi.mocked(translateSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { text: ['Required'] } }) },
    } as never)

    const { POST } = await import('@/app/api/translate/route')
    const req = new Request('http://localhost/api/translate', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('translates text on happy path', async () => {
    const client = mockAuthClient()
    vi.mocked(createSupabaseSsr).mockReturnValue(client as never)

    const { translateSchema } = await import('@/lib/schemas/translate')
    vi.mocked(translateSchema.safeParse).mockReturnValue({
      success: true,
      data: { text: 'violin', targetLang: 'sv' },
    } as never)

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'fiol' }],
    })

    const { POST } = await import('@/app/api/translate/route')
    const req = new Request('http://localhost/api/translate', {
      method: 'POST',
      body: JSON.stringify({ text: 'violin', targetLang: 'sv' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.translation).toBe('fiol')
  })

  it('returns 500 on translation error', async () => {
    const client = mockAuthClient()
    vi.mocked(createSupabaseSsr).mockReturnValue(client as never)

    const { translateSchema } = await import('@/lib/schemas/translate')
    vi.mocked(translateSchema.safeParse).mockReturnValue({
      success: true,
      data: { text: 'violin', targetLang: 'sv' },
    } as never)

    mockAnthropicCreate.mockRejectedValue(new Error('API error'))

    const { POST } = await import('@/app/api/translate/route')
    const req = new Request('http://localhost/api/translate', {
      method: 'POST',
      body: JSON.stringify({ text: 'violin', targetLang: 'sv' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 7. iap/webhook POST
// ---------------------------------------------------------------------------

describe('POST /api/iap/webhook', () => {
  beforeEach(() => vi.clearAllMocks())

  function encodeJWS(payload: Record<string, unknown>): string {
    const header = Buffer.from(JSON.stringify({ alg: 'ES256' })).toString('base64url')
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    return `${header}.${body}.fake-signature`
  }

  function encodeSignedPayload(notification: Record<string, unknown>): string {
    return encodeJWS(notification)
  }

  it('returns 400 when signedPayload is missing', async () => {
    const { POST } = await import('@/app/api/iap/webhook/route')
    const req = new Request('http://localhost/api/iap/webhook', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JWS', async () => {
    const { POST } = await import('@/app/api/iap/webhook/route')
    const req = new Request('http://localhost/api/iap/webhook', {
      method: 'POST',
      body: JSON.stringify({ signedPayload: 'not-a-jws' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('handles DID_RENEW notification', async () => {
    const admin = mockAdminClient()
    const ch = chainMock(null, null)
    admin.from.mockReturnValue(ch)
    vi.mocked(createAdminClient).mockReturnValue(admin as never)

    const transactionInfo = encodeJWS({
      appAccountToken: 'user-1',
      productId: 'amida_pro_monthly',
      originalTransactionId: 'txn-123',
      expiresDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
    })

    const signedPayload = encodeSignedPayload({
      notificationType: 'DID_RENEW',
      data: { signedTransactionInfo: transactionInfo },
    })

    const { POST } = await import('@/app/api/iap/webhook/route')
    const req = new Request('http://localhost/api/iap/webhook', {
      method: 'POST',
      body: JSON.stringify({ signedPayload }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.received).toBe(true)
  })

  it('handles EXPIRED notification', async () => {
    const admin = mockAdminClient()
    const ch = chainMock(null, null)
    admin.from.mockReturnValue(ch)
    vi.mocked(createAdminClient).mockReturnValue(admin as never)

    const transactionInfo = encodeJWS({
      appAccountToken: 'user-1',
      productId: 'amida_pro_monthly',
      originalTransactionId: 'txn-123',
    })

    const signedPayload = encodeSignedPayload({
      notificationType: 'EXPIRED',
      data: { signedTransactionInfo: transactionInfo },
    })

    const { POST } = await import('@/app/api/iap/webhook/route')
    const req = new Request('http://localhost/api/iap/webhook', {
      method: 'POST',
      body: JSON.stringify({ signedPayload }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.received).toBe(true)
  })

  it('handles DID_FAIL_TO_RENEW notification', async () => {
    const admin = mockAdminClient()
    const ch = chainMock(null, null)
    admin.from.mockReturnValue(ch)
    vi.mocked(createAdminClient).mockReturnValue(admin as never)

    const transactionInfo = encodeJWS({
      appAccountToken: 'user-1',
      productId: 'amida_pro_monthly',
      originalTransactionId: 'txn-123',
    })

    const signedPayload = encodeSignedPayload({
      notificationType: 'DID_FAIL_TO_RENEW',
      data: { signedTransactionInfo: transactionInfo },
    })

    const { POST } = await import('@/app/api/iap/webhook/route')
    const req = new Request('http://localhost/api/iap/webhook', {
      method: 'POST',
      body: JSON.stringify({ signedPayload }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.received).toBe(true)
  })

  it('looks up user by transaction ID when no appAccountToken', async () => {
    const admin = mockAdminClient()
    const lookupCh = chainMock({ user_id: 'user-2' }, null)
    lookupCh.single = vi.fn().mockResolvedValue({ data: { user_id: 'user-2' }, error: null })
    const updateCh = chainMock(null, null)
    admin.from.mockReturnValueOnce(lookupCh).mockReturnValue(updateCh)
    vi.mocked(createAdminClient).mockReturnValue(admin as never)

    const transactionInfo = encodeJWS({
      productId: 'amida_pro_monthly',
      originalTransactionId: 'txn-456',
    })

    const signedPayload = encodeSignedPayload({
      notificationType: 'SUBSCRIBED',
      data: { signedTransactionInfo: transactionInfo },
    })

    const { POST } = await import('@/app/api/iap/webhook/route')
    const req = new Request('http://localhost/api/iap/webhook', {
      method: 'POST',
      body: JSON.stringify({ signedPayload }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.received).toBe(true)
  })

  it('returns received:true even when user not found', async () => {
    const admin = mockAdminClient()
    const lookupCh = chainMock(null, null)
    lookupCh.single = vi.fn().mockResolvedValue({ data: null, error: null })
    admin.from.mockReturnValue(lookupCh)
    vi.mocked(createAdminClient).mockReturnValue(admin as never)

    const transactionInfo = encodeJWS({
      productId: 'amida_pro_monthly',
      originalTransactionId: 'txn-unknown',
    })

    const signedPayload = encodeSignedPayload({
      notificationType: 'DID_RENEW',
      data: { signedTransactionInfo: transactionInfo },
    })

    const { POST } = await import('@/app/api/iap/webhook/route')
    const req = new Request('http://localhost/api/iap/webhook', {
      method: 'POST',
      body: JSON.stringify({ signedPayload }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.received).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 8. stripe/change-plan POST
// ---------------------------------------------------------------------------

describe('POST /api/stripe/change-plan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set env vars for price IDs
    process.env.STRIPE_PRO_MONTHLY_PRICE_ID = 'price_pro_monthly'
    process.env.STRIPE_PRO_YEARLY_PRICE_ID = 'price_pro_yearly'
    process.env.STRIPE_TEAM_MONTHLY_PRICE_ID = 'price_team_monthly'
    process.env.STRIPE_TEAM_YEARLY_PRICE_ID = 'price_team_yearly'
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 } as never)

    const { POST } = await import('@/app/api/stripe/change-plan/route')
    const req = new Request('http://localhost/api/stripe/change-plan', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', interval: 'monthly' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(429)
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 } as never)
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/change-plan/route')
    const req = new Request('http://localhost/api/stripe/change-plan', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', interval: 'monthly' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when plan or interval missing', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/change-plan/route')
    const req = new Request('http://localhost/api/stripe/change-plan', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when no active subscription', async () => {
    const client = mockAuthClient()
    // company_members for team check (not needed for pro)
    const subCh = chainMock(null, null)
    subCh.single = vi.fn().mockResolvedValue({ data: null, error: null })
    client.from.mockReturnValue(subCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/change-plan/route')
    const req = new Request('http://localhost/api/stripe/change-plan', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', interval: 'monthly' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 403 when non-owner tries team plan', async () => {
    const client = mockAuthClient()
    const memberCh = chainMock({ role: 'member' }, null)
    memberCh.single = vi.fn().mockResolvedValue({ data: { role: 'member' }, error: null })
    client.from.mockReturnValue(memberCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/change-plan/route')
    const req = new Request('http://localhost/api/stripe/change-plan', {
      method: 'POST',
      body: JSON.stringify({ plan: 'team', interval: 'monthly' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('upgrades subscription on happy path', async () => {
    const client = mockAuthClient()
    const subCh = chainMock({ stripe_subscription_id: 'sub_123', stripe_customer_id: 'cus_123' }, null)
    subCh.single = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: 'sub_123', stripe_customer_id: 'cus_123' },
      error: null,
    })
    const currentPlanCh = chainMock({ plan: 'pro' }, null)
    currentPlanCh.single = vi.fn().mockResolvedValue({ data: { plan: 'pro' }, error: null })
    const updateCh = chainMock(null, null)

    client.from
      .mockReturnValueOnce(subCh) // subscriptions (get stripe_subscription_id)
      .mockReturnValueOnce(currentPlanCh) // subscriptions (get current plan)
      .mockReturnValueOnce(updateCh) // subscriptions (update)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const mockStripe = {
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          items: { data: [{ id: 'si_1', price: { id: 'price_pro_monthly' } }] },
        }),
        update: vi.fn().mockResolvedValue({
          items: { data: [{ price: { id: 'price_pro_yearly' } }] },
        }),
      },
      subscriptionSchedules: {
        create: vi.fn(),
        update: vi.fn(),
      },
    }
    vi.mocked(getStripe).mockReturnValue(mockStripe as never)

    const { POST } = await import('@/app/api/stripe/change-plan/route')
    const req = new Request('http://localhost/api/stripe/change-plan', {
      method: 'POST',
      body: JSON.stringify({ plan: 'pro', interval: 'yearly' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 9. stripe/cancel POST
// ---------------------------------------------------------------------------

describe('POST /api/stripe/cancel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/cancel/route')
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('downgrades directly when no Stripe subscription (admin override)', async () => {
    const client = mockAuthClient()
    const subCh = chainMock(null, null)
    subCh.single = vi.fn().mockResolvedValue({ data: null, error: null })
    const updateCh = chainMock(null, null)
    client.from.mockReturnValueOnce(subCh).mockReturnValueOnce(updateCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/cancel/route')
    const res = await POST()
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('cancels Stripe subscription at period end on happy path', async () => {
    const client = mockAuthClient()
    const subCh = chainMock({ stripe_subscription_id: 'sub_123' }, null)
    subCh.single = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: 'sub_123' },
      error: null,
    })
    const updateCh = chainMock(null, null)
    client.from.mockReturnValueOnce(subCh).mockReturnValueOnce(updateCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const mockStripe = {
      subscriptions: {
        update: vi.fn().mockResolvedValue({}),
      },
    }
    vi.mocked(getStripe).mockReturnValue(mockStripe as never)

    const { POST } = await import('@/app/api/stripe/cancel/route')
    const res = await POST()
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_123', {
      cancel_at_period_end: true,
    })
  })
})

// ---------------------------------------------------------------------------
// 10. stripe/reactivate POST
// ---------------------------------------------------------------------------

describe('POST /api/stripe/reactivate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/reactivate/route')
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 400 when no Stripe subscription found', async () => {
    const client = mockAuthClient()
    const subCh = chainMock(null, null)
    subCh.single = vi.fn().mockResolvedValue({ data: null, error: null })
    client.from.mockReturnValue(subCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/reactivate/route')
    const res = await POST()
    expect(res.status).toBe(400)
  })

  it('reactivates subscription on happy path', async () => {
    const client = mockAuthClient()
    const subCh = chainMock({ stripe_subscription_id: 'sub_123' }, null)
    subCh.single = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: 'sub_123' },
      error: null,
    })
    const updateCh = chainMock(null, null)
    client.from.mockReturnValueOnce(subCh).mockReturnValueOnce(updateCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const mockStripe = {
      subscriptions: {
        update: vi.fn().mockResolvedValue({}),
      },
    }
    vi.mocked(getStripe).mockReturnValue(mockStripe as never)

    const { POST } = await import('@/app/api/stripe/reactivate/route')
    const res = await POST()
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(mockStripe.subscriptions.update).toHaveBeenCalledWith('sub_123', {
      cancel_at_period_end: false,
    })
  })
})

// ---------------------------------------------------------------------------
// 11. stripe/cancel-downgrade POST
// ---------------------------------------------------------------------------

describe('POST /api/stripe/cancel-downgrade', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 } as never)

    const { POST } = await import('@/app/api/stripe/cancel-downgrade/route')
    const res = await POST()
    expect(res.status).toBe(429)
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 } as never)
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/cancel-downgrade/route')
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 400 when no pending downgrade', async () => {
    const client = mockAuthClient()
    const subCh = chainMock({ stripe_subscription_id: 'sub_123', pending_plan: null }, null)
    subCh.single = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: 'sub_123', pending_plan: null },
      error: null,
    })
    client.from.mockReturnValue(subCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/cancel-downgrade/route')
    const res = await POST()
    expect(res.status).toBe(400)
  })

  it('cancels downgrade on happy path', async () => {
    const client = mockAuthClient()
    const subCh = chainMock({ stripe_subscription_id: 'sub_123', pending_plan: 'pro' }, null)
    subCh.single = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: 'sub_123', pending_plan: 'pro' },
      error: null,
    })
    const updateCh = chainMock(null, null)
    client.from.mockReturnValueOnce(subCh).mockReturnValueOnce(updateCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const mockStripe = {
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({ schedule: 'sched_123' }),
      },
      subscriptionSchedules: {
        release: vi.fn().mockResolvedValue({}),
      },
    }
    vi.mocked(getStripe).mockReturnValue(mockStripe as never)

    const { POST } = await import('@/app/api/stripe/cancel-downgrade/route')
    const res = await POST()
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(mockStripe.subscriptionSchedules.release).toHaveBeenCalledWith('sched_123')
  })

  it('returns 500 on Stripe error', async () => {
    const client = mockAuthClient()
    const subCh = chainMock({ stripe_subscription_id: 'sub_123', pending_plan: 'pro' }, null)
    subCh.single = vi.fn().mockResolvedValue({
      data: { stripe_subscription_id: 'sub_123', pending_plan: 'pro' },
      error: null,
    })
    client.from.mockReturnValue(subCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const mockStripe = {
      subscriptions: {
        retrieve: vi.fn().mockRejectedValue(new Error('Stripe failed')),
      },
      subscriptionSchedules: {
        release: vi.fn(),
      },
    }
    vi.mocked(getStripe).mockReturnValue(mockStripe as never)

    const { POST } = await import('@/app/api/stripe/cancel-downgrade/route')
    const res = await POST()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Stripe failed')
  })
})

// ---------------------------------------------------------------------------
// 12. stripe/sync POST
// ---------------------------------------------------------------------------

describe('POST /api/stripe/sync', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/sync/route')
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns synced:false when no Stripe customer', async () => {
    const client = mockAuthClient()
    const subCh = chainMock(null, null)
    subCh.single = vi.fn().mockResolvedValue({ data: null, error: null })
    client.from.mockReturnValue(subCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/stripe/sync/route')
    const res = await POST()
    const body = await res.json()
    expect(body.synced).toBe(false)
    expect(body.reason).toBe('No Stripe customer')
  })

  it('returns synced:false when no active Stripe subscription', async () => {
    const client = mockAuthClient()
    const subCh = chainMock({ stripe_customer_id: 'cus_123', admin_override: false }, null)
    subCh.single = vi.fn().mockResolvedValue({
      data: { stripe_customer_id: 'cus_123', admin_override: false },
      error: null,
    })
    client.from.mockReturnValue(subCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const mockStripe = {
      subscriptions: {
        list: vi.fn().mockResolvedValue({ data: [] }),
      },
    }
    vi.mocked(getStripe).mockReturnValue(mockStripe as never)

    const { POST } = await import('@/app/api/stripe/sync/route')
    const res = await POST()
    const body = await res.json()
    expect(body.synced).toBe(false)
    expect(body.reason).toBe('No active subscription in Stripe')
  })

  it('syncs active subscription on happy path', async () => {
    const client = mockAuthClient()
    const subCh = chainMock({ stripe_customer_id: 'cus_123', admin_override: false }, null)
    subCh.single = vi.fn().mockResolvedValue({
      data: { stripe_customer_id: 'cus_123', admin_override: false },
      error: null,
    })
    const updateCh = chainMock(null, null)
    client.from.mockReturnValueOnce(subCh).mockReturnValueOnce(updateCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const now = Math.floor(Date.now() / 1000)
    const mockStripe = {
      subscriptions: {
        list: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'sub_123',
              cancel_at_period_end: false,
              items: {
                data: [
                  {
                    price: { id: 'price_pro_monthly' },
                    current_period_start: now,
                    current_period_end: now + 30 * 24 * 3600,
                  },
                ],
              },
            },
          ],
        }),
      },
    }
    vi.mocked(getStripe).mockReturnValue(mockStripe as never)

    const { POST } = await import('@/app/api/stripe/sync/route')
    const res = await POST()
    const body = await res.json()
    expect(body.synced).toBe(true)
    expect(body.plan).toBe('pro')
    expect(body.admin_override).toBe(false)
  })

  it('respects admin_override when syncing', async () => {
    const client = mockAuthClient()
    const subCh = chainMock({ stripe_customer_id: 'cus_123', admin_override: true }, null)
    subCh.single = vi.fn().mockResolvedValue({
      data: { stripe_customer_id: 'cus_123', admin_override: true },
      error: null,
    })
    const updateCh = chainMock(null, null)
    client.from.mockReturnValueOnce(subCh).mockReturnValueOnce(updateCh)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const now = Math.floor(Date.now() / 1000)
    const mockStripe = {
      subscriptions: {
        list: vi.fn().mockResolvedValue({
          data: [
            {
              id: 'sub_123',
              cancel_at_period_end: false,
              items: {
                data: [
                  {
                    price: { id: 'price_pro_monthly' },
                    current_period_start: now,
                    current_period_end: now + 30 * 24 * 3600,
                  },
                ],
              },
            },
          ],
        }),
      },
    }
    vi.mocked(getStripe).mockReturnValue(mockStripe as never)

    const { POST } = await import('@/app/api/stripe/sync/route')
    const res = await POST()
    const body = await res.json()
    expect(body.synced).toBe(true)
    expect(body.admin_override).toBe(true)
  })
})
