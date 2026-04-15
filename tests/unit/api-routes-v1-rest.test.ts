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
  createGigSchema: {
    safeParse: vi.fn(),
    partial: vi.fn().mockReturnValue({ safeParse: vi.fn() }),
  },
}))

vi.mock('@/lib/schemas/client', () => ({
  createClientSchema: {
    safeParse: vi.fn(),
    partial: vi.fn().mockReturnValue({ safeParse: vi.fn() }),
  },
}))

vi.mock('@/lib/schemas/invoice', () => ({
  createInvoiceSchema: { safeParse: vi.fn() },
}))

vi.mock('@/lib/schemas/expense', () => ({
  updateExpenseSchema: { safeParse: vi.fn() },
}))

vi.mock('@/lib/expenses/categories', () => ({
  EXPENSE_CATEGORIES: ['transport', 'software', 'supplies', 'other'],
}))

vi.mock('@/lib/upload/file-validation', () => ({
  ALLOWED_RECEIPT_TYPES: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  MAX_FILE_SIZE: 10 * 1024 * 1024,
}))

vi.mock('@/lib/usage', () => ({
  checkStorageQuota: vi.fn(() => Promise.resolve({ allowed: true, used: 0, limit: 100 })),
}))

vi.mock('@/lib/receipt/parser', () => ({
  parseReceiptWithVision: vi.fn(),
  parseReceiptWithText: vi.fn(),
}))

vi.mock('unpdf', () => ({
  extractText: vi.fn(),
  renderPageAsImage: vi.fn(),
}))

import { validateApiKey, requireScope } from '@/lib/api-auth'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createGigSchema } from '@/lib/schemas/gig'
import { createClientSchema } from '@/lib/schemas/client'
import { updateExpenseSchema } from '@/lib/schemas/expense'
import { parseReceiptWithVision } from '@/lib/receipt/parser'

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

function makeParams(obj: Record<string, string>) {
  return { params: Promise.resolve(obj) }
}

function mockSupabaseFrom(fromImpl: (...args: unknown[]) => unknown) {
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn().mockImplementation(fromImpl),
    storage: {
      from: vi.fn().mockReturnValue({
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.url' } }),
        upload: vi.fn().mockResolvedValue({ error: null }),
        remove: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://public.url' } }),
      }),
    },
  } as never)
}

// ---------------------------------------------------------------------------
// 1. GET /api/v1/gigs/[id]
// ---------------------------------------------------------------------------

describe('GET /api/v1/gigs/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/gigs/[id]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns gig on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const gigData = { id: 'g1', project_name: 'Concert', fee: 5000 }
    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: gigData, error: null })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/gigs/[id]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'g1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.id).toBe('g1')
  })

  it('returns 404 when gig not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/gigs/[id]/route')
    const req = new Request('http://localhost/api/v1/gigs/missing', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'missing' }) as never)
    expect(res.status).toBe(404)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'OTHER', message: 'fail' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/gigs/[id]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 2. PATCH /api/v1/gigs/[id]
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/gigs/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { PATCH } = await import('@/app/api/v1/gigs/[id]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const partialSchema = { safeParse: vi.fn() }
    vi.mocked(createGigSchema as unknown as { partial: () => { safeParse: ReturnType<typeof vi.fn> } }).partial = vi
      .fn()
      .mockReturnValue(partialSchema)
    partialSchema.safeParse.mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { status: ['Invalid'] } }) },
    })

    const { PATCH } = await import('@/app/api/v1/gigs/[id]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'invalid_status' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(400)
  })

  it('updates gig on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const partialSchema = { safeParse: vi.fn() }
    vi.mocked(createGigSchema as unknown as { partial: () => { safeParse: ReturnType<typeof vi.fn> } }).partial = vi
      .fn()
      .mockReturnValue(partialSchema)
    partialSchema.safeParse.mockReturnValue({
      success: true,
      data: { status: 'completed' },
    })

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // Verify exists
          const ch = chainMock()
          ch.single = vi.fn().mockResolvedValue({ data: { id: 'g1' }, error: null })
          return ch
        }
        if (callCount === 2) {
          // Update gig
          return chainMock(null, null)
        }
        // Re-fetch
        const ch = chainMock()
        ch.single = vi.fn().mockResolvedValue({ data: { id: 'g1', status: 'completed' }, error: null })
        return ch
      }),
    } as never)

    const { PATCH } = await import('@/app/api/v1/gigs/[id]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'g1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const partialSchema = { safeParse: vi.fn() }
    vi.mocked(createGigSchema as unknown as { partial: () => { safeParse: ReturnType<typeof vi.fn> } }).partial = vi
      .fn()
      .mockReturnValue(partialSchema)
    partialSchema.safeParse.mockReturnValue({
      success: true,
      data: { status: 'completed' },
    })

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'OTHER', message: 'boom' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { PATCH } = await import('@/app/api/v1/gigs/[id]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 3. DELETE /api/v1/gigs/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/gigs/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { DELETE } = await import('@/app/api/v1/gigs/[id]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(401)
  })

  it('deletes gig on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(chainMock(null, null)),
    } as never)

    const { DELETE } = await import('@/app/api/v1/gigs/[id]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'g1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.deleted).toBe(true)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return chainMock(null, null) // gig_dates delete
        // gigs delete throws
        const ch = chainMock()
        ch.then = (_resolve: unknown, reject: (e: Error) => void) => reject(new Error('DB fail'))
        return ch
      }),
    } as never)

    const { DELETE } = await import('@/app/api/v1/gigs/[id]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 4. GET /api/v1/gigs/[id]/attachments
// ---------------------------------------------------------------------------

describe('GET /api/v1/gigs/[id]/attachments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/gigs/[id]/attachments/route')
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns attachments on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // Gig ownership check
          const ch = chainMock()
          ch.single = vi.fn().mockResolvedValue({ data: { id: 'g1' }, error: null })
          return ch
        }
        // Attachments list
        return chainMock(
          [
            {
              id: 'a1',
              file_name: 'test.pdf',
              file_size: 1024,
              file_type: 'application/pdf',
              category: 'gig_info',
              uploaded_at: '2026-01-01',
              file_path: 'g1/test.pdf',
            },
          ],
          null,
        )
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.url' } }),
        }),
      },
    } as never)

    const { GET } = await import('@/app/api/v1/gigs/[id]/attachments/route')
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'g1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(1)
    expect(body.data[0].file_name).toBe('test.pdf')
  })

  it('returns 404 when gig not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        const ch = chainMock()
        ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        return ch
      }),
    } as never)

    const { GET } = await import('@/app/api/v1/gigs/[id]/attachments/route')
    const req = new Request('http://localhost/api/v1/gigs/missing/attachments', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'missing' }) as never)
    expect(res.status).toBe(404)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          const ch = chainMock()
          ch.single = vi.fn().mockResolvedValue({ data: { id: 'g1' }, error: null })
          return ch
        }
        // Attachments query throws
        const ch = chainMock()
        ch.then = (_resolve: unknown, reject: (e: Error) => void) => reject(new Error('DB fail'))
        return ch
      }),
    } as never)

    const { GET } = await import('@/app/api/v1/gigs/[id]/attachments/route')
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 5. DELETE /api/v1/gigs/[id]/attachments/[attachmentId]
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/gigs/[id]/attachments/[attachmentId]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { DELETE } = await import('@/app/api/v1/gigs/[id]/attachments/[attachmentId]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments/a1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'g1', attachmentId: 'a1' }) as never)
    expect(res.status).toBe(401)
  })

  it('deletes attachment on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // Gig ownership
          const ch = chainMock()
          ch.single = vi.fn().mockResolvedValue({ data: { id: 'g1' }, error: null })
          return ch
        }
        if (callCount === 2) {
          // Get attachment
          const ch = chainMock()
          ch.single = vi.fn().mockResolvedValue({ data: { file_path: 'g1/test.pdf' }, error: null })
          return ch
        }
        // Delete from DB
        return chainMock(null, null)
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          remove: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    } as never)

    const { DELETE } = await import('@/app/api/v1/gigs/[id]/attachments/[attachmentId]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments/a1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'g1', attachmentId: 'a1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.deleted).toBe(true)
  })

  it('returns 404 when gig not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        const ch = chainMock()
        ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        return ch
      }),
    } as never)

    const { DELETE } = await import('@/app/api/v1/gigs/[id]/attachments/[attachmentId]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments/a1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'g1', attachmentId: 'a1' }) as never)
    expect(res.status).toBe(404)
  })

  it('returns 404 when attachment not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          const ch = chainMock()
          ch.single = vi.fn().mockResolvedValue({ data: { id: 'g1' }, error: null })
          return ch
        }
        // Attachment not found
        const ch = chainMock()
        ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        return ch
      }),
    } as never)

    const { DELETE } = await import('@/app/api/v1/gigs/[id]/attachments/[attachmentId]/route')
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments/missing', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'g1', attachmentId: 'missing' }) as never)
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// 5b. POST /api/v1/gigs/[id]/attachments
// ---------------------------------------------------------------------------

describe('POST /api/v1/gigs/[id]/attachments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { POST } = await import('@/app/api/v1/gigs/[id]/attachments/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'doc.pdf', { type: 'application/pdf' }))
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments', {
      method: 'POST',
      headers: { authorization: 'Bearer invalid' },
      body: form,
    })
    const res = await POST(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(401)
  })

  it('uploads PDF attachment via multipart on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { checkStorageQuota } = await import('@/lib/usage')
    vi.mocked(checkStorageQuota).mockResolvedValue({ allowed: true, used: 0, limit: 100 } as never)

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // gig ownership check
          const ch = chainMock()
          ch.single = vi.fn().mockResolvedValue({ data: { id: 'g1' }, error: null })
          return ch
        }
        if (callCount === 2) {
          // insert metadata
          const ch = chainMock()
          ch.single = vi.fn().mockResolvedValue({
            data: {
              id: 'att-1',
              file_name: 'doc.pdf',
              file_size: 100,
              file_type: 'application/pdf',
              category: 'gig_info',
              uploaded_at: '2026-01-01',
            },
            error: null,
          })
          return ch
        }
        return chainMock(null, null)
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
          createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.url/doc.pdf' } }),
          remove: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    } as never)

    const { POST } = await import('@/app/api/v1/gigs/[id]/attachments/route')
    const form = new FormData()
    form.append('file', new File(['pdf-content'], 'doc.pdf', { type: 'application/pdf' }))
    form.append('category', 'gig_info')
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: form,
    })
    const res = await POST(req as never, makeParams({ id: 'g1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.file_name).toBe('doc.pdf')
    expect(res.status).toBe(201)
  })

  it('uploads PDF attachment via raw binary on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { checkStorageQuota } = await import('@/lib/usage')
    vi.mocked(checkStorageQuota).mockResolvedValue({ allowed: true } as never)

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          const ch = chainMock()
          ch.single = vi.fn().mockResolvedValue({ data: { id: 'g1' }, error: null })
          return ch
        }
        if (callCount === 2) {
          const ch = chainMock()
          ch.single = vi.fn().mockResolvedValue({
            data: {
              id: 'att-2',
              file_name: 'attachment.pdf',
              file_size: 50,
              file_type: 'application/pdf',
              category: 'gig_info',
              uploaded_at: '2026-01-01',
            },
            error: null,
          })
          return ch
        }
        return chainMock(null, null)
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
          createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.url/att.pdf' } }),
        }),
      },
    } as never)

    const { POST } = await import('@/app/api/v1/gigs/[id]/attachments/route')
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments?category=invoice_doc', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ak_test',
        'content-type': 'application/pdf',
      },
      body: new Uint8Array([37, 80, 68, 70]), // %PDF
    })
    const res = await POST(req as never, makeParams({ id: 'g1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(res.status).toBe(201)
  })

  it('returns 400 for non-PDF file type', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { POST } = await import('@/app/api/v1/gigs/[id]/attachments/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'image.jpg', { type: 'image/jpeg' }))
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: form,
    })
    const res = await POST(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid category', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { checkStorageQuota } = await import('@/lib/usage')
    vi.mocked(checkStorageQuota).mockResolvedValue({ allowed: true } as never)

    const { POST } = await import('@/app/api/v1/gigs/[id]/attachments/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'doc.pdf', { type: 'application/pdf' }))
    form.append('category', 'invalid_category')
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: form,
    })
    const res = await POST(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 403 when storage quota exceeded', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { checkStorageQuota } = await import('@/lib/usage')
    vi.mocked(checkStorageQuota).mockResolvedValue({ allowed: false } as never)

    const { POST } = await import('@/app/api/v1/gigs/[id]/attachments/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'doc.pdf', { type: 'application/pdf' }))
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: form,
    })
    const res = await POST(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(403)
  })

  it('returns 404 when gig not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { checkStorageQuota } = await import('@/lib/usage')
    vi.mocked(checkStorageQuota).mockResolvedValue({ allowed: true } as never)

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        const ch = chainMock()
        ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        return ch
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    } as never)

    const { POST } = await import('@/app/api/v1/gigs/[id]/attachments/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'doc.pdf', { type: 'application/pdf' }))
    const req = new Request('http://localhost/api/v1/gigs/g1/attachments', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: form,
    })
    const res = await POST(req as never, makeParams({ id: 'g1' }) as never)
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// 6. GET /api/v1/clients/[id]
// ---------------------------------------------------------------------------

describe('GET /api/v1/clients/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/clients/[id]/route')
    const req = new Request('http://localhost/api/v1/clients/cl1', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never, makeParams({ id: 'cl1' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns client on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: { id: 'cl1', name: 'Test Client' }, error: null })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/clients/[id]/route')
    const req = new Request('http://localhost/api/v1/clients/cl1', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'cl1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('Test Client')
  })

  it('returns 404 when client not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/clients/[id]/route')
    const req = new Request('http://localhost/api/v1/clients/missing', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'missing' }) as never)
    expect(res.status).toBe(404)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'OTHER', message: 'boom' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/clients/[id]/route')
    const req = new Request('http://localhost/api/v1/clients/cl1', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'cl1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 7. PATCH /api/v1/clients/[id]
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/clients/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { PATCH } = await import('@/app/api/v1/clients/[id]/route')
    const req = new Request('http://localhost/api/v1/clients/cl1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'cl1' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const partialSchema = { safeParse: vi.fn() }
    vi.mocked(createClientSchema as unknown as { partial: () => { safeParse: ReturnType<typeof vi.fn> } }).partial = vi
      .fn()
      .mockReturnValue(partialSchema)
    partialSchema.safeParse.mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { name: ['Too short'] } }) },
    })

    const { PATCH } = await import('@/app/api/v1/clients/[id]/route')
    const req = new Request('http://localhost/api/v1/clients/cl1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ name: '' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'cl1' }) as never)
    expect(res.status).toBe(400)
  })

  it('updates client on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const partialSchema = { safeParse: vi.fn() }
    vi.mocked(createClientSchema as unknown as { partial: () => { safeParse: ReturnType<typeof vi.fn> } }).partial = vi
      .fn()
      .mockReturnValue(partialSchema)
    partialSchema.safeParse.mockReturnValue({
      success: true,
      data: { name: 'Updated Client' },
    })

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: { id: 'cl1', name: 'Updated Client' }, error: null })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { PATCH } = await import('@/app/api/v1/clients/[id]/route')
    const req = new Request('http://localhost/api/v1/clients/cl1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated Client' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'cl1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('Updated Client')
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const partialSchema = { safeParse: vi.fn() }
    vi.mocked(createClientSchema as unknown as { partial: () => { safeParse: ReturnType<typeof vi.fn> } }).partial = vi
      .fn()
      .mockReturnValue(partialSchema)
    partialSchema.safeParse.mockReturnValue({
      success: true,
      data: { name: 'Updated' },
    })

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'OTHER', message: 'boom' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { PATCH } = await import('@/app/api/v1/clients/[id]/route')
    const req = new Request('http://localhost/api/v1/clients/cl1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Updated' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'cl1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 8. DELETE /api/v1/clients/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/clients/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { DELETE } = await import('@/app/api/v1/clients/[id]/route')
    const req = new Request('http://localhost/api/v1/clients/cl1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'cl1' }) as never)
    expect(res.status).toBe(401)
  })

  it('deletes client on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(chainMock(null, null)),
    } as never)

    const { DELETE } = await import('@/app/api/v1/clients/[id]/route')
    const req = new Request('http://localhost/api/v1/clients/cl1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'cl1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.deleted).toBe(true)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.then = (_resolve: unknown, reject: (e: Error) => void) => reject(new Error('DB fail'))

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { DELETE } = await import('@/app/api/v1/clients/[id]/route')
    const req = new Request('http://localhost/api/v1/clients/cl1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'cl1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 9. GET /api/v1/invoices/[id]
// ---------------------------------------------------------------------------

describe('GET /api/v1/invoices/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/inv1', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never, makeParams({ id: 'inv1' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns invoice on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({
      data: { id: 'inv1', invoice_number: 42, total: 1250, client: { id: 'cl1', name: 'Test' }, invoice_lines: [] },
      error: null,
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/inv1', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'inv1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.invoice_number).toBe(42)
  })

  it('returns 404 when invoice not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/missing', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'missing' }) as never)
    expect(res.status).toBe(404)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'OTHER', message: 'boom' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/inv1', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'inv1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 10. PATCH /api/v1/invoices/[id]
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/invoices/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { PATCH } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/inv1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'inv1' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 when no valid fields provided', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { PATCH } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/inv1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ invalid_field: 'value' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'inv1' }) as never)
    expect(res.status).toBe(400)
  })

  it('updates invoice on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({
      data: { id: 'inv1', status: 'paid', paid_date: '2026-04-15' },
      error: null,
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { PATCH } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/inv1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'paid', paid_date: '2026-04-15' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'inv1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.status).toBe('paid')
  })

  it('returns 404 when invoice not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { PATCH } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/inv1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'inv1' }) as never)
    expect(res.status).toBe(404)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'OTHER', message: 'boom' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { PATCH } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/inv1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'paid' }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'inv1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 11. DELETE /api/v1/invoices/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/invoices/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { DELETE } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/inv1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'inv1' }) as never)
    expect(res.status).toBe(401)
  })

  it('deletes invoice on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // Get linked gigs
          return chainMock([{ gig_id: 'g1' }], null)
        }
        // invoice_lines delete, invoices delete, gigs update
        return chainMock(null, null)
      }),
    } as never)

    const { DELETE } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/inv1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'inv1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.deleted).toBe(true)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return chainMock([], null) // linked gigs
        if (callCount === 2) return chainMock(null, null) // invoice_lines delete
        // invoices delete throws
        const ch = chainMock()
        ch.then = (_resolve: unknown, reject: (e: Error) => void) => reject(new Error('DB fail'))
        return ch
      }),
    } as never)

    const { DELETE } = await import('@/app/api/v1/invoices/[id]/route')
    const req = new Request('http://localhost/api/v1/invoices/inv1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'inv1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 12. GET /api/v1/expenses/[id]
// ---------------------------------------------------------------------------

describe('GET /api/v1/expenses/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/expenses/[id]/route')
    const req = new Request('http://localhost/api/v1/expenses/e1', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns expense on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({
      data: { id: 'e1', supplier: 'Test', amount: 100, gig: null },
      error: null,
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/expenses/[id]/route')
    const req = new Request('http://localhost/api/v1/expenses/e1', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'e1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.supplier).toBe('Test')
  })

  it('returns 404 when expense not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/expenses/[id]/route')
    const req = new Request('http://localhost/api/v1/expenses/missing', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'missing' }) as never)
    expect(res.status).toBe(404)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'OTHER', message: 'boom' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/expenses/[id]/route')
    const req = new Request('http://localhost/api/v1/expenses/e1', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 13. PATCH /api/v1/expenses/[id]
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/expenses/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { PATCH } = await import('@/app/api/v1/expenses/[id]/route')
    const req = new Request('http://localhost/api/v1/expenses/e1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer invalid', 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 200 }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    vi.mocked(updateExpenseSchema.safeParse).mockReturnValue({
      success: false,
      error: { flatten: () => ({ fieldErrors: { amount: ['Must be positive'] } }) },
    } as never)

    const { PATCH } = await import('@/app/api/v1/expenses/[id]/route')
    const req = new Request('http://localhost/api/v1/expenses/e1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ amount: -5 }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(400)
  })

  it('updates expense on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    vi.mocked(updateExpenseSchema.safeParse).mockReturnValue({
      success: true,
      data: { amount: 200 },
    } as never)

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({
      data: { id: 'e1', supplier: 'Test', amount: 200 },
      error: null,
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { PATCH } = await import('@/app/api/v1/expenses/[id]/route')
    const req = new Request('http://localhost/api/v1/expenses/e1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 200 }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'e1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.amount).toBe(200)
  })

  it('returns 404 when expense not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    vi.mocked(updateExpenseSchema.safeParse).mockReturnValue({
      success: true,
      data: { amount: 200 },
    } as never)

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { PATCH } = await import('@/app/api/v1/expenses/[id]/route')
    const req = new Request('http://localhost/api/v1/expenses/e1', {
      method: 'PATCH',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 200 }),
    })
    const res = await PATCH(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// 14. DELETE /api/v1/expenses/[id]
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/expenses/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { DELETE } = await import('@/app/api/v1/expenses/[id]/route')
    const req = new Request('http://localhost/api/v1/expenses/e1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(401)
  })

  it('deletes expense on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(chainMock(null, null)),
    } as never)

    const { DELETE } = await import('@/app/api/v1/expenses/[id]/route')
    const req = new Request('http://localhost/api/v1/expenses/e1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'e1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.deleted).toBe(true)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.then = (_resolve: unknown, reject: (e: Error) => void) => reject(new Error('DB fail'))

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { DELETE } = await import('@/app/api/v1/expenses/[id]/route')
    const req = new Request('http://localhost/api/v1/expenses/e1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 15. GET /api/v1/expenses/[id]/receipt
// ---------------------------------------------------------------------------

describe('GET /api/v1/expenses/[id]/receipt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(401)
  })

  it('returns signed URL on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({
      data: { attachment_url: 'https://example.supabase.co/storage/v1/object/public/expenses/receipts/2026/test.jpg' },
      error: null,
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi
            .fn()
            .mockResolvedValue({ data: { signedUrl: 'https://signed.url/test.jpg' }, error: null }),
        }),
      },
    } as never)

    const { GET } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'e1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.url).toBe('https://signed.url/test.jpg')
  })

  it('returns 404 when expense not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(404)
  })

  it('returns 404 when no receipt attached', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({
      data: { attachment_url: null },
      error: null,
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(404)
  })

  it('returns 500 on signed URL creation failure', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({
      data: { attachment_url: 'https://example.supabase.co/storage/v1/object/public/expenses/receipts/2026/test.jpg' },
      error: null,
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
        }),
      },
    } as never)

    const { GET } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(500)
  })

  it('returns 400 when file path cannot be extracted', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.single = vi.fn().mockResolvedValue({
      data: { attachment_url: 'not-a-valid-url' },
      error: null,
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// 15b. POST /api/v1/expenses/[id]/receipt
// ---------------------------------------------------------------------------

describe('POST /api/v1/expenses/[id]/receipt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { POST } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'receipt.jpg', { type: 'image/jpeg' }))
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      method: 'POST',
      headers: { authorization: 'Bearer invalid' },
      body: form,
    })
    const res = await POST(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(401)
  })

  it('uploads receipt via multipart form on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { checkStorageQuota } = await import('@/lib/usage')
    vi.mocked(checkStorageQuota).mockResolvedValue({ allowed: true, used: 0, limit: 100 } as never)

    mockSupabaseFrom(() => {
      const ch = chainMock()
      ch.single = vi.fn().mockResolvedValue({
        data: { attachment_url: null, date: '2026-02-01' },
        error: null,
      })
      return ch
    })

    const { POST } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const form = new FormData()
    form.append('file', new File(['image-content'], 'receipt.jpg', { type: 'image/jpeg' }))
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: form,
    })
    const res = await POST(req as never, makeParams({ id: 'e1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.url).toBeDefined()
  })

  it('uploads receipt via raw binary on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { checkStorageQuota } = await import('@/lib/usage')
    vi.mocked(checkStorageQuota).mockResolvedValue({ allowed: true, used: 0, limit: 100 } as never)

    mockSupabaseFrom(() => {
      const ch = chainMock()
      ch.single = vi.fn().mockResolvedValue({
        data: { attachment_url: null, date: '2026-02-01' },
        error: null,
      })
      return ch
    })

    const { POST } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ak_test',
        'content-type': 'image/png',
      },
      body: new Uint8Array([137, 80, 78, 71]), // PNG header
    })
    const res = await POST(req as never, makeParams({ id: 'e1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 400 for invalid file type', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { POST } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ak_test',
        'content-type': 'text/plain',
      },
      body: 'not-a-file',
    })
    const res = await POST(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(400)
  })

  it('returns 403 when storage quota exceeded', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { checkStorageQuota } = await import('@/lib/usage')
    vi.mocked(checkStorageQuota).mockResolvedValue({ allowed: false } as never)

    const { POST } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'receipt.jpg', { type: 'image/jpeg' }))
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: form,
    })
    const res = await POST(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(403)
  })

  it('returns 404 when expense not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { checkStorageQuota } = await import('@/lib/usage')
    vi.mocked(checkStorageQuota).mockResolvedValue({ allowed: true } as never)

    mockSupabaseFrom(() => {
      const ch = chainMock()
      ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      return ch
    })

    const { POST } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const form = new FormData()
    form.append('file', new File(['data'], 'receipt.jpg', { type: 'image/jpeg' }))
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test' },
      body: form,
    })
    const res = await POST(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// 15c. DELETE /api/v1/expenses/[id]/receipt
// ---------------------------------------------------------------------------

describe('DELETE /api/v1/expenses/[id]/receipt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { DELETE } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      method: 'DELETE',
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(401)
  })

  it('deletes receipt on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          const ch = chainMock()
          ch.single = vi.fn().mockResolvedValue({
            data: {
              attachment_url: 'https://example.supabase.co/storage/v1/object/public/expenses/receipts/2026/test.jpg',
            },
            error: null,
          })
          return ch
        }
        return chainMock(null, null)
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          remove: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    } as never)

    const { DELETE } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'e1' }) as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.deleted).toBe(true)
  })

  it('returns 404 when expense not found', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        const ch = chainMock()
        ch.single = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
        return ch
      }),
    } as never)

    const { DELETE } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(404)
  })

  it('returns 404 when no receipt to delete', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        const ch = chainMock()
        ch.single = vi.fn().mockResolvedValue({
          data: { attachment_url: null },
          error: null,
        })
        return ch
      }),
    } as never)

    const { DELETE } = await import('@/app/api/v1/expenses/[id]/receipt/route')
    const req = new Request('http://localhost/api/v1/expenses/e1/receipt', {
      method: 'DELETE',
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await DELETE(req as never, makeParams({ id: 'e1' }) as never)
    expect(res.status).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// 16. POST /api/v1/expenses/scan
// ---------------------------------------------------------------------------

describe('POST /api/v1/expenses/scan', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { POST } = await import('@/app/api/v1/expenses/scan/route')
    const req = new Request('http://localhost/api/v1/expenses/scan', {
      method: 'POST',
      headers: { authorization: 'Bearer invalid', 'content-type': 'image/jpeg' },
      body: new Uint8Array([1, 2, 3]),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid content type', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { POST } = await import('@/app/api/v1/expenses/scan/route')
    const req = new Request('http://localhost/api/v1/expenses/scan', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'text/plain' },
      body: 'not an image',
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('scans receipt image on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const scanResult = {
      date: '2026-01-15',
      supplier: 'Store',
      amount: 299,
      currency: 'SEK',
      category: 'supplies',
      confidence: 0.95,
    }
    vi.mocked(parseReceiptWithVision).mockResolvedValue(scanResult as never)

    const { POST } = await import('@/app/api/v1/expenses/scan/route')
    const imageData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]) // fake JPEG header
    const req = new Request('http://localhost/api/v1/expenses/scan', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'image/jpeg' },
      body: imageData,
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.supplier).toBe('Store')
    expect(body.data.amount).toBe(299)
  })

  it('returns 400 for empty body', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const { POST } = await import('@/app/api/v1/expenses/scan/route')
    const req = new Request('http://localhost/api/v1/expenses/scan', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'image/jpeg' },
      body: new Uint8Array(0),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('returns 500 on parser failure', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    vi.mocked(parseReceiptWithVision).mockRejectedValue(new Error('AI service down'))

    const { POST } = await import('@/app/api/v1/expenses/scan/route')
    const imageData = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    const req = new Request('http://localhost/api/v1/expenses/scan', {
      method: 'POST',
      headers: { authorization: 'Bearer ak_test', 'content-type': 'image/jpeg' },
      body: imageData,
    })
    const res = await POST(req as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 17. GET /api/v1/gig-types
// ---------------------------------------------------------------------------

describe('GET /api/v1/gig-types', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/gig-types/route')
    const req = new Request('http://localhost/api/v1/gig-types', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns gig types on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock(
      [
        { id: 'gt1', name: 'Konsert', name_en: 'Concert', vat_rate: 6 },
        { id: 'gt2', name: 'Rep', name_en: 'Rehearsal', vat_rate: 25 },
      ],
      null,
    )

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/gig-types/route')
    const req = new Request('http://localhost/api/v1/gig-types', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(2)
    expect(body.data[0].name).toBe('Konsert')
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.then = (_resolve: unknown, reject: (e: Error) => void) => reject(new Error('DB fail'))

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/gig-types/route')
    const req = new Request('http://localhost/api/v1/gig-types', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 18. GET /api/v1/positions
// ---------------------------------------------------------------------------

describe('GET /api/v1/positions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/positions/route')
    const req = new Request('http://localhost/api/v1/positions', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns positions on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock(
      [
        { id: 'p1', name: '1:a konsertmästare', sort_order: 1 },
        { id: 'p2', name: 'Tutti', sort_order: 2 },
      ],
      null,
    )

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/positions/route')
    const req = new Request('http://localhost/api/v1/positions', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data).toHaveLength(2)
    expect(body.data[0].name).toBe('1:a konsertmästare')
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const ch = chainMock()
    ch.then = (_resolve: unknown, reject: (e: Error) => void) => reject(new Error('DB fail'))

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { GET } = await import('@/app/api/v1/positions/route')
    const req = new Request('http://localhost/api/v1/positions', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 19. GET /api/v1/summary
// ---------------------------------------------------------------------------

describe('GET /api/v1/summary', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 without valid API key', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthFail()

    const { GET } = await import('@/app/api/v1/summary/route')
    const req = new Request('http://localhost/api/v1/summary', {
      headers: { authorization: 'Bearer invalid' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns summary on happy path', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const gigsChain = chainMock([{ id: 'g1', project_name: 'Concert', fee: 5000, status: 'accepted' }], null)
    const invoicesChain = chainMock([{ id: 'inv1', total: 1250, status: 'sent' }], null)
    const expensesChain = chainMock([{ id: 'e1', supplier: 'Store', amount: 100 }], null)
    const yearGigsChain = chainMock(
      [
        { fee: 5000, status: 'accepted' },
        { fee: 3000, status: 'completed' },
      ],
      null,
    )
    const yearInvoicesChain = chainMock(
      [
        { total: 5000, total_base: 5000, status: 'paid' },
        { total: 1250, total_base: 1250, status: 'sent' },
      ],
      null,
    )

    let callCount = 0
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return gigsChain
        if (callCount === 2) return invoicesChain
        if (callCount === 3) return expensesChain
        if (callCount === 4) return yearGigsChain
        return yearInvoicesChain
      }),
    } as never)

    const { GET } = await import('@/app/api/v1/summary/route')
    const req = new Request('http://localhost/api/v1/summary', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.upcoming_gigs).toHaveLength(1)
    expect(body.data.unpaid_invoices).toHaveLength(1)
    expect(body.data.recent_expenses).toHaveLength(1)
    expect(body.data.stats).toBeDefined()
    expect(body.data.stats.total_gigs).toBe(2)
    expect(body.data.stats.total_paid).toBe(5000)
    expect(body.data.generated_at).toBeDefined()
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 10 })
    mockAuthSuccess()

    const errorChain = chainMock(null, { message: 'DB fail' })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(errorChain),
    } as never)

    const { GET } = await import('@/app/api/v1/summary/route')
    const req = new Request('http://localhost/api/v1/summary', {
      headers: { authorization: 'Bearer ak_test' },
    })
    const res = await GET(req as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 20. GET /api/v1/guide
// ---------------------------------------------------------------------------

describe('GET /api/v1/guide', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns guide JSON without auth', async () => {
    const { GET } = await import('@/app/api/v1/guide/route')
    const res = await GET()
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.name).toBe('Amida API')
    expect(body.version).toBe('1.0')
    expect(body.endpoints).toBeDefined()
    expect(Array.isArray(body.endpoints)).toBe(true)
    expect(body.endpoints.length).toBeGreaterThan(0)
  })

  it('includes workflows in guide', async () => {
    const { GET } = await import('@/app/api/v1/guide/route')
    const res = await GET()
    const body = await res.json()
    expect(body.workflows).toBeDefined()
    expect(body.workflows.create_gig_and_invoice).toBeDefined()
    expect(body.workflows.scan_receipt_and_create_expense).toBeDefined()
  })

  it('includes field_specs in guide', async () => {
    const { GET } = await import('@/app/api/v1/guide/route')
    const res = await GET()
    const body = await res.json()
    expect(body.field_specs).toBeDefined()
    expect(body.field_specs.create_gig).toBeDefined()
    expect(body.field_specs.create_invoice).toBeDefined()
    expect(body.field_specs.create_client).toBeDefined()
    expect(body.field_specs.create_expense).toBeDefined()
  })
})
