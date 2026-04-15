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

vi.mock('@/lib/activity', () => ({
  logActivity: vi.fn(),
}))

vi.mock('@/lib/schemas/auth', () => ({
  authSetupSchema: {
    safeParse: vi.fn(),
  },
  validateCodeSchema: {
    safeParse: vi.fn(),
  },
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({}) },
  })),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit } from '@/lib/rate-limit'
import { authSetupSchema, validateCodeSchema } from '@/lib/schemas/auth'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

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
  const methods = [
    'select',
    'insert',
    'update',
    'upsert',
    'delete',
    'eq',
    'in',
    'not',
    'is',
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

// ---------------------------------------------------------------------------
// 19. auth/setup POST
// ---------------------------------------------------------------------------

describe('POST /api/auth/setup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  })

  it('returns 400 for invalid data', async () => {
    vi.mocked(authSetupSchema.safeParse).mockReturnValue({ success: false } as never)

    const { POST } = await import('@/app/api/auth/setup/route')
    const req = new Request('http://localhost/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(authSetupSchema.safeParse).mockReturnValue({
      success: true,
      data: { user_id: 'u1', company_name: 'Test' },
    } as never)

    const mockSb = {
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: null } }) } },
      from: vi.fn().mockReturnValue(chainMock()),
    }
    vi.mocked(createSupabaseClient).mockReturnValue(mockSb as never)

    const { POST } = await import('@/app/api/auth/setup/route')
    const req = new Request('http://localhost/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns ok when already set up (idempotent)', async () => {
    vi.mocked(authSetupSchema.safeParse).mockReturnValue({
      success: true,
      data: { user_id: 'u1', company_name: 'Test' },
    } as never)

    const ch = chainMock()
    ch.eq.mockResolvedValue({ count: 1 })
    const mockSb = {
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) } },
      from: vi.fn().mockReturnValue(ch),
    }
    vi.mocked(createSupabaseClient).mockReturnValue(mockSb as never)

    const { POST } = await import('@/app/api/auth/setup/route')
    const req = new Request('http://localhost/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.message).toBe('Already set up')
  })

  it('creates settings and subscription on normal signup', async () => {
    vi.mocked(authSetupSchema.safeParse).mockReturnValue({
      success: true,
      data: { user_id: 'u1', company_name: 'Test' },
    } as never)

    const ch = chainMock()
    // count check for settings
    ch.eq.mockResolvedValueOnce({ count: 0 })
    // insert settings
    ch.insert.mockResolvedValueOnce({ error: null })
    // insert subscription
    ch.insert.mockResolvedValueOnce({ error: null })
    // rpc calls
    ch.rpc = vi.fn().mockResolvedValue({ error: null })

    const mockSb = {
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) } },
      from: vi.fn().mockReturnValue(ch),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(createSupabaseClient).mockReturnValue(mockSb as never)

    const { POST } = await import('@/app/api/auth/setup/route')
    const req = new Request('http://localhost/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('handles invitation_token flow', async () => {
    vi.mocked(authSetupSchema.safeParse).mockReturnValue({
      success: true,
      data: { user_id: 'u1', company_name: 'Test', invitation_token: 'tok-123' },
    } as never)

    let callIdx = 0
    const mockSb = {
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) } },
      from: vi.fn().mockImplementation(() => {
        callIdx++
        if (callIdx === 1) {
          // settings count check
          const ch = chainMock()
          ch.eq.mockResolvedValue({ count: 0 })
          return ch
        }
        if (callIdx === 2) {
          // settings insert
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }
        if (callIdx === 3) {
          // invitation lookup
          return chainMock({
            id: 'inv-1',
            company_id: 'c1',
            used_by: null,
            expires_at: new Date(Date.now() + 86400000).toISOString(),
          })
        }
        // all other inserts/updates
        const ch = chainMock()
        ch.insert.mockResolvedValue({ error: null })
        ch.update.mockReturnValue(ch)
        ch.eq.mockResolvedValue({})
        return ch
      }),
      rpc: vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(createSupabaseClient).mockReturnValue(mockSb as never)

    const { POST } = await import('@/app/api/auth/setup/route')
    const req = new Request('http://localhost/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 20. auth/setup-member POST
// ---------------------------------------------------------------------------

describe('POST /api/auth/setup-member', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/auth/setup-member/route')
    const req = new Request('http://localhost/api/auth/setup-member', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('updates member settings on happy path', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const ch = chainMock()
    ch.eq.mockResolvedValue({ error: null })
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { POST } = await import('@/app/api/auth/setup-member/route')
    const req = new Request('http://localhost/api/auth/setup-member', {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Test User', phone: '123' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('falls back to upsert when update matches no rows', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount <= 1) {
          // company_members update
          const ch = chainMock()
          ch.eq.mockResolvedValue({})
          return ch
        }
        if (callCount === 2) {
          // company_settings update - returns error
          const ch = chainMock()
          ch.eq.mockResolvedValue({ error: { message: 'no rows' } })
          return ch
        }
        // company_settings upsert
        const ch = chainMock()
        ch.upsert.mockResolvedValue({ error: null })
        return ch
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { POST } = await import('@/app/api/auth/setup-member/route')
    const req = new Request('http://localhost/api/auth/setup-member', {
      method: 'POST',
      body: JSON.stringify({ full_name: 'Test', phone: '123' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 21. auth/validate-code POST
// ---------------------------------------------------------------------------

describe('POST /api/auth/validate-code', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  })

  it('returns 400 for invalid data', async () => {
    vi.mocked(validateCodeSchema.safeParse).mockReturnValue({ success: false } as never)

    const { POST } = await import('@/app/api/auth/validate-code/route')
    const req = new Request('http://localhost/api/auth/validate-code', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns valid:false when code not found', async () => {
    vi.mocked(validateCodeSchema.safeParse).mockReturnValue({
      success: true,
      data: { code: 'BADCODE' },
    } as never)

    const ch = chainMock(null, { message: 'not found' })
    vi.mocked(createSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { POST } = await import('@/app/api/auth/validate-code/route')
    const req = new Request('http://localhost/api/auth/validate-code', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.valid).toBe(false)
  })

  it('returns valid:false when code is expired', async () => {
    vi.mocked(validateCodeSchema.safeParse).mockReturnValue({
      success: true,
      data: { code: 'EXPIRED' },
    } as never)

    const ch = chainMock({
      id: 'c1',
      code: 'EXPIRED',
      max_uses: 10,
      use_count: 0,
      expires_at: '2020-01-01T00:00:00Z',
    })
    vi.mocked(createSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { POST } = await import('@/app/api/auth/validate-code/route')
    const req = new Request('http://localhost/api/auth/validate-code', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('expired')
  })

  it('returns valid:false when code is fully used', async () => {
    vi.mocked(validateCodeSchema.safeParse).mockReturnValue({
      success: true,
      data: { code: 'USED' },
    } as never)

    const ch = chainMock({
      id: 'c1',
      code: 'USED',
      max_uses: 5,
      use_count: 5,
      expires_at: null,
    })
    vi.mocked(createSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { POST } = await import('@/app/api/auth/validate-code/route')
    const req = new Request('http://localhost/api/auth/validate-code', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('used')
  })

  it('returns valid:true for valid code', async () => {
    vi.mocked(validateCodeSchema.safeParse).mockReturnValue({
      success: true,
      data: { code: 'VALID' },
    } as never)

    const ch = chainMock({
      id: 'c1',
      code: 'VALID',
      max_uses: 10,
      use_count: 3,
      expires_at: null,
    })
    vi.mocked(createSupabaseClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { POST } = await import('@/app/api/auth/validate-code/route')
    const req = new Request('http://localhost/api/auth/validate-code', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.valid).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 22. invitations/create POST
// ---------------------------------------------------------------------------

describe('POST /api/invitations/create', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(rateLimit).mockReturnValue({ success: true, remaining: 5 })
  })

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/invitations/create/route')
    const req = new Request('http://localhost/api/invitations/create', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not owner', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ company_id: 'c1', role: 'member' })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/invitations/create/route')
    const req = new Request('http://localhost/api/invitations/create', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(403)
  })

  it('returns 403 when no team subscription', async () => {
    const client = mockAuthClient()
    let callCount = 0
    client.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return chainMock({ company_id: 'c1', role: 'owner' })
      return chainMock({ plan: 'free', status: 'active' })
    })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/invitations/create/route')
    const req = new Request('http://localhost/api/invitations/create', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(403)
  })

  it('creates invitation on happy path', async () => {
    const client = mockAuthClient()
    let callCount = 0
    client.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) return chainMock({ company_id: 'c1', role: 'owner' })
      if (callCount === 2) return chainMock({ plan: 'team', status: 'active' })
      if (callCount === 3) return chainMock({ id: 'inv-1', token: 'tok-abc', expires_at: null })
      // companies lookup for email
      return chainMock({ company_name: 'Test Co' })
    })
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }),
    } as never)

    const { POST } = await import('@/app/api/invitations/create/route')
    const req = new Request('http://localhost/api/invitations/create', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { origin: 'http://localhost:3000' },
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.token).toBe('tok-abc')
    expect(body.url).toContain('tok-abc')
  })
})

// ---------------------------------------------------------------------------
// 23. invitations/validate POST
// ---------------------------------------------------------------------------

describe('POST /api/invitations/validate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns valid:false when token is missing', async () => {
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn() } as never)

    const { POST } = await import('@/app/api/invitations/validate/route')
    const req = new Request('http://localhost/api/invitations/validate', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('missing')
  })

  it('returns valid:false when invitation not found', async () => {
    const ch = chainMock(null, { message: 'not found' })
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { POST } = await import('@/app/api/invitations/validate/route')
    const req = new Request('http://localhost/api/invitations/validate', {
      method: 'POST',
      body: JSON.stringify({ token: 'invalid' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('not_found')
  })

  it('returns valid:false when invitation is used', async () => {
    const ch = chainMock({ id: 'inv-1', company_id: 'c1', used_by: 'u1', expires_at: null })
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { POST } = await import('@/app/api/invitations/validate/route')
    const req = new Request('http://localhost/api/invitations/validate', {
      method: 'POST',
      body: JSON.stringify({ token: 'used-tok' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('used')
  })

  it('returns valid:false when invitation is expired', async () => {
    const ch = chainMock({
      id: 'inv-1',
      company_id: 'c1',
      used_by: null,
      expires_at: '2020-01-01T00:00:00Z',
    })
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(ch),
    } as never)

    const { POST } = await import('@/app/api/invitations/validate/route')
    const req = new Request('http://localhost/api/invitations/validate', {
      method: 'POST',
      body: JSON.stringify({ token: 'expired-tok' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.valid).toBe(false)
    expect(body.reason).toBe('expired')
  })

  it('returns valid:true with company_name on happy path', async () => {
    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return chainMock({ id: 'inv-1', company_id: 'c1', used_by: null, expires_at: null })
        }
        return chainMock({ company_name: 'Test AB' })
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { POST } = await import('@/app/api/invitations/validate/route')
    const req = new Request('http://localhost/api/invitations/validate', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid-tok' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.valid).toBe(true)
    expect(body.company_name).toBe('Test AB')
  })
})

// ---------------------------------------------------------------------------
// 24. invitations/accept POST
// ---------------------------------------------------------------------------

describe('POST /api/invitations/accept', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/invitations/accept/route')
    const req = new Request('http://localhost/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when token is missing', async () => {
    const client = mockAuthClient()
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/invitations/accept/route')
    const req = new Request('http://localhost/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when user already in a company', async () => {
    const client = mockAuthClient()
    const ch = chainMock({ company_id: 'c1' })
    client.from.mockReturnValue(ch)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { POST } = await import('@/app/api/invitations/accept/route')
    const req = new Request('http://localhost/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 for invalid invitation', async () => {
    const client = mockAuthClient()
    client.from.mockReturnValue(chainMock(null)) // no existing membership
    vi.mocked(createClient).mockResolvedValue(client as never)
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(chainMock(null, { message: 'not found' })),
    } as never)

    const { POST } = await import('@/app/api/invitations/accept/route')
    const req = new Request('http://localhost/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'bad-tok' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns 410 for expired invitation', async () => {
    const client = mockAuthClient()
    client.from.mockReturnValue(chainMock(null)) // no existing membership
    vi.mocked(createClient).mockResolvedValue(client as never)

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(
        chainMock({
          id: 'inv-1',
          company_id: 'c1',
          invited_email: null,
          used_by: null,
          expires_at: '2020-01-01T00:00:00Z',
        }),
      ),
    } as never)

    const { POST } = await import('@/app/api/invitations/accept/route')
    const req = new Request('http://localhost/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'expired-tok' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(410)
  })

  it('returns 403 when email does not match', async () => {
    const client = mockAuthClient(mockUser('user-1', 'wrong@test.com'))
    client.from.mockReturnValue(chainMock(null))
    vi.mocked(createClient).mockResolvedValue(client as never)

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(
        chainMock({
          id: 'inv-1',
          company_id: 'c1',
          invited_email: 'correct@test.com',
          used_by: null,
          expires_at: null,
        }),
      ),
    } as never)

    const { POST } = await import('@/app/api/invitations/accept/route')
    const req = new Request('http://localhost/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'tok' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('accepts invitation on happy path', async () => {
    const client = mockAuthClient()
    client.from.mockReturnValue(chainMock(null)) // no existing membership
    vi.mocked(createClient).mockResolvedValue(client as never)

    let callCount = 0
    const adminClient = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return chainMock({
            id: 'inv-1',
            company_id: 'c1',
            invited_email: null,
            used_by: null,
            expires_at: null,
          })
        }
        if (callCount === 2) {
          // insert member
          return { insert: vi.fn().mockResolvedValue({ error: null }) }
        }
        if (callCount === 3) {
          // update invitation
          const ch = chainMock()
          ch.eq.mockResolvedValue({})
          return ch
        }
        // company lookup
        return chainMock({ company_name: 'Test AB' })
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { POST } = await import('@/app/api/invitations/accept/route')
    const req = new Request('http://localhost/api/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'valid-tok' }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.company_name).toBe('Test AB')
  })
})

// ---------------------------------------------------------------------------
// 25. company/members GET
// ---------------------------------------------------------------------------

describe('GET /api/company/members', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const client = mockAuthClient(null)
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/company/members/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns 404 when no company', async () => {
    const client = mockAuthClient()
    client.from.mockReturnValue(chainMock(null))
    vi.mocked(createClient).mockResolvedValue(client as never)

    const { GET } = await import('@/app/api/company/members/route')
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('returns members on happy path', async () => {
    const client = mockAuthClient()
    let callCount = 0
    client.from.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // membership lookup
        return chainMock({ company_id: 'c1' })
      }
      // members list
      const ch = chainMock()
      ch.order.mockResolvedValue({
        data: [
          { id: 'm1', user_id: 'user-1', role: 'owner', joined_at: '2026-01-01', removed_at: null, full_name: 'Test' },
        ],
      })
      return ch
    })
    vi.mocked(createClient).mockResolvedValue(client as never)

    const adminClient = {
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'test@test.com' } } }),
        },
      },
    }
    vi.mocked(createAdminClient).mockReturnValue(adminClient as never)

    const { GET } = await import('@/app/api/company/members/route')
    const res = await GET()
    const body = await res.json()
    expect(body.members).toHaveLength(1)
    expect(body.members[0].email).toBe('test@test.com')
  })
})
