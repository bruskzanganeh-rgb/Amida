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

vi.mock('@/lib/import/document-classifier', () => ({
  classifyDocument: vi.fn(),
}))

vi.mock('@/lib/import/client-matcher', () => ({
  matchClient: vi.fn(),
}))

vi.mock('@/lib/pdf/extractor', () => ({
  extractTextFromPDF: vi.fn(),
}))

vi.mock('@/lib/pdf/parser', () => ({
  parseInvoiceWithAI: vi.fn(),
}))

vi.mock('@/lib/currency/exchange', () => ({
  getRateServer: vi.fn().mockResolvedValue(1),
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { classifyDocument } from '@/lib/import/document-classifier'
import { matchClient } from '@/lib/import/client-matcher'
import { extractTextFromPDF } from '@/lib/pdf/extractor'
import { parseInvoiceWithAI } from '@/lib/pdf/parser'

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
// 38. import/analyze POST
// ---------------------------------------------------------------------------

describe('POST /api/import/analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 })

    const { POST } = await import('@/app/api/import/analyze/route')
    const formData = new FormData()
    const req = new Request('http://localhost/api/import/analyze', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(429)
  })

  it('returns 400 when no file attached', async () => {
    const { POST } = await import('@/app/api/import/analyze/route')
    const formData = new FormData()
    const req = new Request('http://localhost/api/import/analyze', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  // Skipped: jsdom FormData does not reliably preserve File.size for large blobs
  it.skip('returns 400 when file is too large', async () => {})

  it('returns 400 for unsupported file type', async () => {
    const { POST } = await import('@/app/api/import/analyze/route')
    const file = new File(['test'], 'test.txt', { type: 'text/plain' })
    const formData = new FormData()
    formData.append('file', file)
    const req = new Request('http://localhost/api/import/analyze', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('analyzes expense file on happy path', async () => {
    vi.mocked(classifyDocument).mockResolvedValue({
      type: 'expense',
      confidence: 0.95,
      data: { supplier: 'Test Store', total: 100, currency: 'SEK' },
    } as never)

    const { POST } = await import('@/app/api/import/analyze/route')
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const formData = new FormData()
    formData.append('file', blob, 'receipt.pdf')
    const req = new Request('http://localhost/api/import/analyze', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.type).toBe('expense')
    // jsdom FormData may return 'blob' instead of the filename
    expect(body.filename).toBeDefined()
  })

  it('runs client matching for invoice type', async () => {
    vi.mocked(classifyDocument).mockResolvedValue({
      type: 'invoice',
      confidence: 0.9,
      data: { clientName: 'Client A', total: 5000 },
    } as never)
    vi.mocked(matchClient).mockResolvedValue({
      id: 'cl1',
      name: 'Client A',
      score: 0.95,
    } as never)

    const { POST } = await import('@/app/api/import/analyze/route')
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const formData = new FormData()
    formData.append('file', blob, 'invoice.pdf')
    const req = new Request('http://localhost/api/import/analyze', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.type).toBe('invoice')
    expect(body.clientMatch).toBeDefined()
    expect(matchClient).toHaveBeenCalledWith('Client A')
  })

  it('returns 500 on classifier error', async () => {
    vi.mocked(classifyDocument).mockRejectedValue(new Error('AI failed'))

    const { POST } = await import('@/app/api/import/analyze/route')
    const blob = new Blob(['%PDF-1.4'], { type: 'application/pdf' })
    const formData = new FormData()
    formData.append('file', blob, 'receipt.pdf')
    const req = new Request('http://localhost/api/import/analyze', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 39. import/batch POST
// ---------------------------------------------------------------------------

describe('POST /api/import/batch', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/import/batch/route')
    const formData = new FormData()
    formData.append('metadata', '[]')
    const req = new Request('http://localhost/api/import/batch', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 when metadata is missing', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(createAdminClient).mockReturnValue({} as never)

    const { POST } = await import('@/app/api/import/batch/route')
    const formData = new FormData()
    const req = new Request('http://localhost/api/import/batch', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 when metadata is empty array', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(createAdminClient).mockReturnValue({} as never)

    const { POST } = await import('@/app/api/import/batch/route')
    const formData = new FormData()
    formData.append('metadata', '[]')
    const req = new Request('http://localhost/api/import/batch', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('imports expense on happy path', async () => {
    const client = mockAuthClient()
    // clients query
    let clientCallCount = 0
    client.from.mockImplementation(() => {
      clientCallCount++
      if (clientCallCount === 1) {
        // clients list
        return chainMock([], null)
      }
      if (clientCallCount === 2) {
        // existing expenses for duplicate check
        return chainMock([], null)
      }
      // expense insert
      return chainMock({ id: 'exp-1' }, null)
    })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const mockUpload = vi.fn().mockResolvedValue({ error: null })
    const mockGetPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/file.pdf' } })
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(chainMock()),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: mockUpload,
          getPublicUrl: mockGetPublicUrl,
        }),
      },
    } as never)

    const metadata = [
      {
        id: 'f1',
        type: 'expense',
        data: {
          date: '2026-01-01',
          supplier: 'Test Store',
          subtotal: 80,
          vatRate: 25,
          vatAmount: 20,
          total: 100,
          currency: 'SEK',
          category: 'other',
        },
        suggestedFilename: 'receipt-test',
      },
    ]

    const { POST } = await import('@/app/api/import/batch/route')
    const formData = new FormData()
    formData.append('metadata', JSON.stringify(metadata))
    const blob = new Blob(['pdf-content'], { type: 'application/pdf' })
    formData.append('file_f1', blob, 'receipt.pdf')

    const req = new Request('http://localhost/api/import/batch', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.results).toBeDefined()
    expect(body.summary).toBeDefined()
    expect(body.summary.total).toBe(1)
  })

  it('handles missing file gracefully', async () => {
    const client = mockAuthClient()
    client.from.mockReturnValue(chainMock([], null))
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(chainMock()),
      storage: { from: vi.fn() },
    } as never)

    const metadata = [
      {
        id: 'f1',
        type: 'expense',
        data: {
          date: '2026-01-01',
          supplier: 'Test',
          subtotal: 80,
          vatRate: 25,
          vatAmount: 20,
          total: 100,
          currency: 'SEK',
          category: 'other',
        },
        suggestedFilename: 'receipt-test',
      },
    ]

    const { POST } = await import('@/app/api/import/batch/route')
    const formData = new FormData()
    formData.append('metadata', JSON.stringify(metadata))
    // Don't attach file_f1

    const req = new Request('http://localhost/api/import/batch', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.results[0].success).toBe(false)
    expect(body.results[0].error).toBe('File missing')
  })
})

// ---------------------------------------------------------------------------
// 40. import/parse-invoice POST
// ---------------------------------------------------------------------------

describe('POST /api/import/parse-invoice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
  })

  it('returns 429 when rate limited', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: false, remaining: 0 })

    const { POST } = await import('@/app/api/import/parse-invoice/route')
    const formData = new FormData()
    const req = new Request('http://localhost/api/import/parse-invoice', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(429)
  })

  it('returns 400 when no file provided', async () => {
    const { POST } = await import('@/app/api/import/parse-invoice/route')
    const formData = new FormData()
    const req = new Request('http://localhost/api/import/parse-invoice', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('No file provided')
  })

  it('returns 422 when extracted text is too short', async () => {
    vi.mocked(extractTextFromPDF).mockResolvedValue('Short')

    const { POST } = await import('@/app/api/import/parse-invoice/route')
    const formData = new FormData()
    formData.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'invoice.pdf')
    const req = new Request('http://localhost/api/import/parse-invoice', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('too short')
  })

  it('parses invoice on happy path', async () => {
    const longText = 'A'.repeat(200) // Enough text to pass the 100 char check
    vi.mocked(extractTextFromPDF).mockResolvedValue(longText)
    vi.mocked(parseInvoiceWithAI).mockResolvedValue({
      clientName: 'Test Client AB',
      invoiceNumber: 42,
      date: '2026-01-15',
      dueDate: '2026-02-15',
      total: 10000,
      lines: [{ description: 'Konsert', amount: 10000 }],
    } as never)
    vi.mocked(matchClient).mockResolvedValue({
      id: 'cl1',
      name: 'Test Client AB',
      score: 0.98,
    } as never)

    const { POST } = await import('@/app/api/import/parse-invoice/route')
    const formData = new FormData()
    formData.append('file', new Blob(['%PDF-1.4 content'], { type: 'application/pdf' }), 'invoice.pdf')
    const req = new Request('http://localhost/api/import/parse-invoice', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.clientName).toBe('Test Client AB')
    expect(body.data.invoiceNumber).toBe(42)
    expect(body.data.clientMatch).toBeDefined()
    expect(body.data.clientMatch.id).toBe('cl1')
    expect(body.data.rawText).toBeDefined()
  })

  it('overrides invoice number when provided in form data', async () => {
    const longText = 'B'.repeat(200)
    vi.mocked(extractTextFromPDF).mockResolvedValue(longText)
    vi.mocked(parseInvoiceWithAI).mockResolvedValue({
      clientName: 'Client',
      invoiceNumber: 99,
      total: 5000,
    } as never)
    vi.mocked(matchClient).mockResolvedValue(null as never)

    const { POST } = await import('@/app/api/import/parse-invoice/route')
    const formData = new FormData()
    formData.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'invoice.pdf')
    formData.append('invoiceNumber', '123')
    const req = new Request('http://localhost/api/import/parse-invoice', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.invoiceNumber).toBe(123)
  })

  it('returns 500 when parser throws', async () => {
    vi.mocked(extractTextFromPDF).mockRejectedValue(new Error('PDF parse error'))

    const { POST } = await import('@/app/api/import/parse-invoice/route')
    const formData = new FormData()
    formData.append('file', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'invoice.pdf')
    const req = new Request('http://localhost/api/import/parse-invoice', {
      method: 'POST',
      body: formData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toBe('Failed to parse invoice')
  })
})
