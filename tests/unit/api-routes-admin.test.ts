import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/admin', () => ({
  verifyAdmin: vi.fn(),
}))

vi.mock('@/lib/activity', () => ({
  logActivity: vi.fn(),
}))

vi.mock('@/lib/schemas/admin', () => ({
  createUserSchema: { safeParse: vi.fn() },
  configSchema: { safeParse: vi.fn() },
}))

import { verifyAdmin } from '@/lib/admin'
import { createUserSchema, configSchema } from '@/lib/schemas/admin'

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
    'upsert',
    'delete',
    'eq',
    'neq',
    'in',
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

function mockAdminAuth(supabaseOverrides?: Record<string, unknown>) {
  const defaultSupabase = {
    from: vi.fn().mockReturnValue(chainMock()),
    auth: { admin: { createUser: vi.fn(), inviteUserByEmail: vi.fn() } },
    rpc: vi.fn().mockReturnValue({ then: vi.fn().mockReturnValue({ data: null }) }),
  }
  vi.mocked(verifyAdmin).mockResolvedValue({
    userId: 'admin-1',
    supabase: { ...defaultSupabase, ...supabaseOverrides },
  } as never)
}

function mockAdminFail(status = 401) {
  vi.mocked(verifyAdmin).mockResolvedValue(NextResponse.json({ error: 'Unauthorized' }, { status }))
}

// ---------------------------------------------------------------------------
// 30. admin/stats GET
// ---------------------------------------------------------------------------

describe('GET /api/admin/stats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()

    const { GET } = await import('@/app/api/admin/stats/route')
    const req = new Request('http://localhost/api/admin/stats')
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns stats on happy path', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          // The route calls .select('*', { count: 'exact', head: true }) for count
          // and .select('stripe_price_id').eq('plan', 'pro').eq('status', 'active') for pro subs
          const countResult = { count: 5 }
          const proResult = { data: [{ stripe_price_id: 'price_pro' }] }
          return {
            select: vi.fn().mockImplementation((_cols: string, opts?: Record<string, unknown>) => {
              if (opts?.head) return countResult
              // Pro subs query
              return {
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    then: (resolve: (v: unknown) => void) => resolve(proResult),
                  }),
                }),
              }
            }),
          }
        }
        if (table === 'sponsor_impressions') {
          // Returns a thenable chain
          const ch = chainMock([], null, 0)
          return ch
        }
        return chainMock()
      }),
    }

    vi.mocked(verifyAdmin).mockResolvedValue({
      userId: 'admin-1',
      supabase,
    } as never)

    const { GET } = await import('@/app/api/admin/stats/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/stats'))
    const res = await GET(req)
    const body = await res.json()
    expect(body.totalUsers).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 31. admin/users GET + POST
// ---------------------------------------------------------------------------

describe('GET /api/admin/users', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()

    const { GET } = await import('@/app/api/admin/users/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns users on happy path', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return {
            select: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [{ user_id: 'u1', plan: 'free', status: 'active', created_at: '2026-01-01' }],
              }),
            }),
          }
        }
        if (table === 'company_settings') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ user_id: 'u1', company_name: 'Test', email: 'test@test.com' }],
            }),
          }
        }
        if (table === 'company_members') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ user_id: 'u1', company_id: 'c1', role: 'owner' }],
            }),
          }
        }
        if (table === 'companies') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'c1', postal_code: '11122', city: 'Stockholm', country_code: 'SE' }],
            }),
          }
        }
        if (table === 'user_categories') {
          return {
            select: vi.fn().mockResolvedValue({ data: [] }),
          }
        }
        if (table === 'usage_tracking') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    then: vi.fn().mockImplementation((cb) => cb({ data: [] })),
                  }),
                }),
              }),
            }),
          }
        }
        return chainMock()
      }),
      rpc: vi.fn().mockReturnValue({
        then: vi.fn().mockImplementation((cb) => cb({ data: [] })),
      }),
    }

    vi.mocked(verifyAdmin).mockResolvedValue({
      userId: 'admin-1',
      supabase,
    } as never)

    const { GET } = await import('@/app/api/admin/users/route')
    const res = await GET()
    const body = await res.json()
    expect(body.users).toBeDefined()
  })
})

describe('POST /api/admin/users', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()

    const { POST } = await import('@/app/api/admin/users/route')
    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    mockAdminAuth()
    vi.mocked(createUserSchema.safeParse).mockReturnValue({
      success: false,
      error: { issues: [{ message: 'Email required' }] },
    } as never)

    const { POST } = await import('@/app/api/admin/users/route')
    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates user in create mode', async () => {
    vi.mocked(createUserSchema.safeParse).mockReturnValue({
      success: true,
      data: { email: 'new@test.com', password: 'pass123', company_name: 'Test', mode: 'create' },
    } as never)

    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null }),
        },
      },
    }

    vi.mocked(verifyAdmin).mockResolvedValue({
      userId: 'admin-1',
      supabase,
    } as never)

    const { POST } = await import('@/app/api/admin/users/route')
    const req = new Request('http://localhost/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.userId).toBe('new-user')
  })
})

// ---------------------------------------------------------------------------
// 32. admin/config GET + PUT
// ---------------------------------------------------------------------------

describe('GET /api/admin/config', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()

    const { GET } = await import('@/app/api/admin/config/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns config on happy path', async () => {
    const ch = chainMock()
    ch.select.mockResolvedValue({
      data: [{ key: 'k1', value: 'v1', updated_at: '2026-01-01' }],
      error: null,
    })
    mockAdminAuth()
    ;(vi.mocked(verifyAdmin) as ReturnType<typeof vi.fn>).mockResolvedValue({
      userId: 'admin-1',
      supabase: { from: vi.fn().mockReturnValue(ch) },
    })

    const { GET } = await import('@/app/api/admin/config/route')
    const res = await GET()
    const body = await res.json()
    expect(body.config).toBeDefined()
  })
})

describe('PUT /api/admin/config', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()

    const { PUT } = await import('@/app/api/admin/config/route')
    const req = new Request('http://localhost/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify({ key: 'k1', value: 'v1' }),
    })
    const res = await PUT(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    mockAdminAuth()
    vi.mocked(configSchema.safeParse).mockReturnValue({
      success: false,
      error: { issues: [{ message: 'Key required' }] },
    } as never)

    const { PUT } = await import('@/app/api/admin/config/route')
    const req = new Request('http://localhost/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify({}),
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('upserts config on happy path', async () => {
    vi.mocked(configSchema.safeParse).mockReturnValue({
      success: true,
      data: { key: 'test_key', value: 'test_value' },
    } as never)

    const ch = chainMock()
    ch.upsert.mockResolvedValue({ error: null })

    vi.mocked(verifyAdmin).mockResolvedValue({
      userId: 'admin-1',
      supabase: { from: vi.fn().mockReturnValue(ch) },
    } as never)

    const { PUT } = await import('@/app/api/admin/config/route')
    const req = new Request('http://localhost/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify({}),
    })
    const res = await PUT(req)
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 33. admin/audit GET
// ---------------------------------------------------------------------------

describe('GET /api/admin/audit', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()

    const { GET } = await import('@/app/api/admin/audit/route')
    const req = new Request('http://localhost/api/admin/audit')
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns audit logs on happy path', async () => {
    const ch = chainMock([{ id: 'log-1', action: 'INSERT', table_name: 'gigs' }], null, 1)

    vi.mocked(verifyAdmin).mockResolvedValue({
      userId: 'admin-1',
      supabase: { from: vi.fn().mockReturnValue(ch) },
    } as never)

    const { GET } = await import('@/app/api/admin/audit/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/audit'))
    const res = await GET(req)
    const body = await res.json()
    expect(body.logs).toHaveLength(1)
    expect(body.total).toBe(1)
  })

  it('applies filters', async () => {
    const ch = chainMock([], null, 0)

    vi.mocked(verifyAdmin).mockResolvedValue({
      userId: 'admin-1',
      supabase: { from: vi.fn().mockReturnValue(ch) },
    } as never)

    const { GET } = await import('@/app/api/admin/audit/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(
      new URL('http://localhost/api/admin/audit?user_id=u1&table_name=gigs&action=INSERT&page=2&limit=10'),
    )
    const res = await GET(req)
    const body = await res.json()
    expect(body.page).toBe(2)
    expect(body.limit).toBe(10)
  })

  it('returns 500 on DB error', async () => {
    const ch = chainMock(null, { message: 'fail' }, 0)

    vi.mocked(verifyAdmin).mockResolvedValue({
      userId: 'admin-1',
      supabase: { from: vi.fn().mockReturnValue(ch) },
    } as never)

    const { GET } = await import('@/app/api/admin/audit/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/audit'))
    const res = await GET(req)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 34. admin/activity GET
// ---------------------------------------------------------------------------

describe('GET /api/admin/activity', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()

    const { GET } = await import('@/app/api/admin/activity/route')
    const req = new Request('http://localhost/api/admin/activity')
    const res = await GET(req as never)
    expect(res.status).toBe(401)
  })

  it('returns activity events on happy path', async () => {
    const ch = chainMock([{ id: 'ev-1', event_type: 'gig_created', user_id: 'u1' }], null, 1)

    vi.mocked(verifyAdmin).mockResolvedValue({
      userId: 'admin-1',
      supabase: { from: vi.fn().mockReturnValue(ch) },
    } as never)

    const { GET } = await import('@/app/api/admin/activity/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/activity'))
    const res = await GET(req)
    const body = await res.json()
    expect(body.events).toHaveLength(1)
    expect(body.total).toBe(1)
  })

  it('returns 500 on DB error', async () => {
    const ch = chainMock(null, { message: 'fail' }, 0)

    vi.mocked(verifyAdmin).mockResolvedValue({
      userId: 'admin-1',
      supabase: { from: vi.fn().mockReturnValue(ch) },
    } as never)

    const { GET } = await import('@/app/api/admin/activity/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/activity'))
    const res = await GET(req)
    expect(res.status).toBe(500)
  })

  it('applies filters correctly', async () => {
    const ch = chainMock([], null, 0)

    vi.mocked(verifyAdmin).mockResolvedValue({
      userId: 'admin-1',
      supabase: { from: vi.fn().mockReturnValue(ch) },
    } as never)

    const { GET } = await import('@/app/api/admin/activity/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(
      new URL('http://localhost/api/admin/activity?user_id=u1&event_type=gig_created&from=2026-01-01&to=2026-12-31'),
    )
    const res = await GET(req)
    const body = await res.json()
    expect(body.events).toBeDefined()
    expect(ch.eq).toHaveBeenCalled()
  })
})
