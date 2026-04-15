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
  createOrgSchema: { safeParse: vi.fn() },
  updateOrgSchema: { safeParse: vi.fn() },
  orgMemberSchema: { safeParse: vi.fn() },
  changeTierSchema: { safeParse: vi.fn() },
  configSchema: { safeParse: vi.fn() },
}))

// Mock Anthropic SDK for analyze-instruments route
const mockAnthropicCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => {
  function MockAnthropic() {
    return {
      messages: {
        create: mockAnthropicCreate,
      },
    }
  }
  return { default: MockAnthropic }
})

// Mock cookies + createServerClient for invitation-codes route
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    getAll: vi.fn().mockReturnValue([]),
  }),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn().mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
    },
    rpc: vi.fn().mockResolvedValue({ data: false }),
  }),
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}))

import { verifyAdmin } from '@/lib/admin'
import {
  createOrgSchema,
  updateOrgSchema,
  orgMemberSchema,
  changeTierSchema,
  createUserSchema,
} from '@/lib/schemas/admin'

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
    'is',
    'not',
    'order',
    'limit',
    'range',
    'filter',
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
    auth: {
      admin: {
        createUser: vi.fn(),
        inviteUserByEmail: vi.fn(),
        deleteUser: vi.fn(),
        updateUserById: vi.fn(),
        getUserById: vi.fn(),
        generateLink: vi.fn(),
      },
    },
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

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

// ---------------------------------------------------------------------------
// 1. admin/organizations GET + POST
// ---------------------------------------------------------------------------

describe('GET /api/admin/organizations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { GET } = await import('@/app/api/admin/organizations/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns organizations on happy path', async () => {
    const orgChain = chainMock([
      {
        id: 'org-1',
        name: 'Orkester',
        category: null,
        notes: null,
        created_at: '2026-01-01',
        organization_members: [],
      },
    ])
    const supabase = {
      from: vi.fn().mockReturnValue(orgChain),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/organizations/route')
    const res = await GET()
    const body = await res.json()
    expect(body.organizations).toBeDefined()
    expect(body.organizations).toHaveLength(1)
    expect(body.organizations[0].member_count).toBe(0)
  })

  it('enriches members with user info', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'organizations') {
          return chainMock([
            {
              id: 'org-1',
              name: 'Test',
              category: null,
              notes: null,
              created_at: '2026-01-01',
              organization_members: [{ id: 'm1', user_id: 'u1', role: 'member', joined_at: '2026-01-01' }],
            },
          ])
        }
        if (table === 'company_settings') {
          return chainMock([{ user_id: 'u1', company_name: 'TestCo', email: 'u1@test.com' }])
        }
        return chainMock()
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/organizations/route')
    const res = await GET()
    const body = await res.json()
    expect(body.organizations[0].organization_members[0].email).toBe('u1@test.com')
    expect(body.organizations[0].member_count).toBe(1)
  })

  it('returns 500 on DB error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue(chainMock(null, { message: 'DB error' })),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/organizations/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('POST /api/admin/organizations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { POST } = await import('@/app/api/admin/organizations/route')
    const req = new Request('http://localhost/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    mockAdminAuth()
    vi.mocked(createOrgSchema.safeParse).mockReturnValue({
      success: false,
      error: { issues: [{ message: 'Name required' }] },
    } as never)

    const { POST } = await import('@/app/api/admin/organizations/route')
    const req = new Request('http://localhost/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(400)
  })

  it('creates organization on happy path', async () => {
    vi.mocked(createOrgSchema.safeParse).mockReturnValue({
      success: true,
      data: { name: 'New Org', category: 'orchestra', notes: '' },
    } as never)

    const ch = chainMock()
    ch.single.mockResolvedValue({ data: { id: 'org-new', name: 'New Org' }, error: null })
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/organizations/route')
    const req = new Request('http://localhost/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    const body = await res.json()
    expect(body.organization).toBeDefined()
    expect(body.organization.name).toBe('New Org')
  })

  it('returns 500 on insert error', async () => {
    vi.mocked(createOrgSchema.safeParse).mockReturnValue({
      success: true,
      data: { name: 'New Org' },
    } as never)

    const ch = chainMock()
    ch.single.mockResolvedValue({ data: null, error: { message: 'Duplicate' } })
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/organizations/route')
    const req = new Request('http://localhost/api/admin/organizations', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req as never)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 2. admin/organizations/[id] PUT + DELETE
// ---------------------------------------------------------------------------

describe('PUT /api/admin/organizations/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { PUT } = await import('@/app/api/admin/organizations/[id]/route')
    const req = new Request('http://localhost/api/admin/organizations/org-1', {
      method: 'PUT',
      body: JSON.stringify({}),
    })
    const res = await PUT(req as never, makeParams('org-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    mockAdminAuth()
    vi.mocked(updateOrgSchema.safeParse).mockReturnValue({
      success: false,
      error: { issues: [{ message: 'Invalid' }] },
    } as never)

    const { PUT } = await import('@/app/api/admin/organizations/[id]/route')
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({}) })
    const res = await PUT(req as never, makeParams('org-1'))
    expect(res.status).toBe(400)
  })

  it('updates organization on happy path', async () => {
    vi.mocked(updateOrgSchema.safeParse).mockReturnValue({
      success: true,
      data: { name: 'Updated Org', category: null, notes: null },
    } as never)

    const ch = chainMock()
    ch.single.mockResolvedValue({ data: { id: 'org-1', name: 'Updated Org' }, error: null })
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { PUT } = await import('@/app/api/admin/organizations/[id]/route')
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({}) })
    const res = await PUT(req as never, makeParams('org-1'))
    const body = await res.json()
    expect(body.organization.name).toBe('Updated Org')
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(updateOrgSchema.safeParse).mockReturnValue({
      success: true,
      data: { name: 'X' },
    } as never)

    const ch = chainMock()
    ch.single.mockResolvedValue({ data: null, error: { message: 'fail' } })
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { PUT } = await import('@/app/api/admin/organizations/[id]/route')
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({}) })
    const res = await PUT(req as never, makeParams('org-1'))
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/organizations/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { DELETE } = await import('@/app/api/admin/organizations/[id]/route')
    const req = new Request('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req as never, makeParams('org-1'))
    expect(res.status).toBe(401)
  })

  it('deletes organization on happy path', async () => {
    const ch = chainMock(null, null)
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { DELETE } = await import('@/app/api/admin/organizations/[id]/route')
    const req = new Request('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req as never, makeParams('org-1'))
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 500 on DB error', async () => {
    const ch = chainMock(null, { message: 'FK constraint' })
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { DELETE } = await import('@/app/api/admin/organizations/[id]/route')
    const req = new Request('http://localhost', { method: 'DELETE' })
    const res = await DELETE(req as never, makeParams('org-1'))
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 3. admin/organizations/[id]/members POST + DELETE
// ---------------------------------------------------------------------------

describe('POST /api/admin/organizations/[id]/members', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { POST } = await import('@/app/api/admin/organizations/[id]/members/route')
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    const res = await POST(req as never, makeParams('org-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    mockAdminAuth()
    vi.mocked(orgMemberSchema.safeParse).mockReturnValue({
      success: false,
      error: { issues: [{ message: 'user_id required' }] },
    } as never)

    const { POST } = await import('@/app/api/admin/organizations/[id]/members/route')
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    const res = await POST(req as never, makeParams('org-1'))
    expect(res.status).toBe(400)
  })

  it('adds member on happy path', async () => {
    vi.mocked(orgMemberSchema.safeParse).mockReturnValue({
      success: true,
      data: { user_id: 'u1', role: 'member' },
    } as never)

    const ch = chainMock()
    ch.single.mockResolvedValue({
      data: { id: 'mem-1', organization_id: 'org-1', user_id: 'u1', role: 'member' },
      error: null,
    })
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/organizations/[id]/members/route')
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    const res = await POST(req as never, makeParams('org-1'))
    const body = await res.json()
    expect(body.member).toBeDefined()
    expect(body.member.role).toBe('member')
  })

  it('returns 500 on insert error', async () => {
    vi.mocked(orgMemberSchema.safeParse).mockReturnValue({
      success: true,
      data: { user_id: 'u1' },
    } as never)

    const ch = chainMock()
    ch.single.mockResolvedValue({ data: null, error: { message: 'Duplicate' } })
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/organizations/[id]/members/route')
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    const res = await POST(req as never, makeParams('org-1'))
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/organizations/[id]/members', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { DELETE } = await import('@/app/api/admin/organizations/[id]/members/route')
    const req = new Request('http://localhost', { method: 'DELETE', body: JSON.stringify({}) })
    const res = await DELETE(req as never, makeParams('org-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    mockAdminAuth()
    vi.mocked(orgMemberSchema.safeParse).mockReturnValue({
      success: false,
      error: { issues: [{ message: 'Invalid' }] },
    } as never)

    const { DELETE } = await import('@/app/api/admin/organizations/[id]/members/route')
    const req = new Request('http://localhost', { method: 'DELETE', body: JSON.stringify({}) })
    const res = await DELETE(req as never, makeParams('org-1'))
    expect(res.status).toBe(400)
  })

  it('removes member on happy path', async () => {
    vi.mocked(orgMemberSchema.safeParse).mockReturnValue({
      success: true,
      data: { user_id: 'u1' },
    } as never)

    const ch = chainMock(null, null)
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { DELETE } = await import('@/app/api/admin/organizations/[id]/members/route')
    const req = new Request('http://localhost', { method: 'DELETE', body: JSON.stringify({}) })
    const res = await DELETE(req as never, makeParams('org-1'))
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('returns 500 on DB error', async () => {
    vi.mocked(orgMemberSchema.safeParse).mockReturnValue({
      success: true,
      data: { user_id: 'u1' },
    } as never)

    const ch = chainMock(null, { message: 'fail' })
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { DELETE } = await import('@/app/api/admin/organizations/[id]/members/route')
    const req = new Request('http://localhost', { method: 'DELETE', body: JSON.stringify({}) })
    const res = await DELETE(req as never, makeParams('org-1'))
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 4. admin/users/[id] PATCH + DELETE
// ---------------------------------------------------------------------------

describe('PATCH /api/admin/users/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { PATCH } = await import('@/app/api/admin/users/[id]/route')
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ email: 'x@y.com' }) })
    const res = await PATCH(req as never, makeParams('u1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 when no changes provided', async () => {
    mockAdminAuth()
    const { PATCH } = await import('@/app/api/admin/users/[id]/route')
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({}) })
    const res = await PATCH(req as never, makeParams('u1'))
    expect(res.status).toBe(400)
  })

  it('updates user email on happy path', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue(chainMock()),
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { PATCH } = await import('@/app/api/admin/users/[id]/route')
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ email: 'new@test.com' }) })
    const res = await PATCH(req as never, makeParams('u1'))
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith('u1', { email: 'new@test.com' })
  })

  it('returns 400 on auth update error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue(chainMock()),
      auth: {
        admin: {
          updateUserById: vi.fn().mockResolvedValue({ error: { message: 'Email taken' } }),
        },
      },
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { PATCH } = await import('@/app/api/admin/users/[id]/route')
    const req = new Request('http://localhost', { method: 'PATCH', body: JSON.stringify({ email: 'dup@test.com' }) })
    const res = await PATCH(req as never, makeParams('u1'))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/admin/users/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { DELETE } = await import('@/app/api/admin/users/[id]/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/users/u1'), { method: 'DELETE' })
    const res = await DELETE(req, makeParams('u1'))
    expect(res.status).toBe(401)
  })

  it('prevents self-deletion', async () => {
    mockAdminAuth()
    const { DELETE } = await import('@/app/api/admin/users/[id]/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/users/admin-1'), { method: 'DELETE' })
    const res = await DELETE(req, makeParams('admin-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('yourself')
  })

  it('deletes user on happy path', async () => {
    const ch = chainMock([], null)
    const supabase = {
      from: vi.fn().mockReturnValue(ch),
      auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: null }) } },
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { DELETE } = await import('@/app/api/admin/users/[id]/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/users/u1'), { method: 'DELETE' })
    const res = await DELETE(req, makeParams('u1'))
    const body = await res.json()
    expect(body.success).toBe(true)
  })

  it('deletes entire company when company=true', async () => {
    const membershipResult = { data: { company_id: 'c1' }, error: null }
    const allMembersResult = { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null }

    let companyMembersCallCount = 0
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        // Return a full chainMock that supports both select->eq->single and delete->eq chains
        const ch = chainMock([], null)
        // Override single to return different results for company_members queries
        ch.single.mockImplementation(() => {
          companyMembersCallCount++
          if (companyMembersCallCount === 1) return Promise.resolve(membershipResult)
          if (companyMembersCallCount === 2) return Promise.resolve(allMembersResult)
          return Promise.resolve({ data: null, error: null })
        })
        return ch
      }),
      auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: null }) } },
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { DELETE } = await import('@/app/api/admin/users/[id]/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/users/u1?company=true'), { method: 'DELETE' })
    const res = await DELETE(req, makeParams('u1'))
    const body = await res.json()
    expect(body.success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. admin/users/[id]/tier PUT
// ---------------------------------------------------------------------------

describe('PUT /api/admin/users/[id]/tier', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { PUT } = await import('@/app/api/admin/users/[id]/tier/route')
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({ plan: 'pro' }) })
    const res = await PUT(req as never, makeParams('u1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid plan', async () => {
    mockAdminAuth()
    vi.mocked(changeTierSchema.safeParse).mockReturnValue({
      success: false,
      error: { issues: [{ message: 'Invalid plan' }] },
    } as never)

    const { PUT } = await import('@/app/api/admin/users/[id]/tier/route')
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({}) })
    const res = await PUT(req as never, makeParams('u1'))
    expect(res.status).toBe(400)
  })

  it('updates tier on happy path', async () => {
    vi.mocked(changeTierSchema.safeParse).mockReturnValue({
      success: true,
      data: { plan: 'pro' },
    } as never)

    const supabase = {
      from: vi.fn().mockReturnValue(chainMock()),
      rpc: vi.fn().mockResolvedValue({ data: true }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { PUT } = await import('@/app/api/admin/users/[id]/tier/route')
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({}) })
    const res = await PUT(req as never, makeParams('u1'))
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.plan).toBe('pro')
  })

  it('returns 500 when rpc returns null', async () => {
    vi.mocked(changeTierSchema.safeParse).mockReturnValue({
      success: true,
      data: { plan: 'pro' },
    } as never)

    const supabase = {
      from: vi.fn().mockReturnValue(chainMock()),
      rpc: vi.fn().mockResolvedValue({ data: null }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { PUT } = await import('@/app/api/admin/users/[id]/tier/route')
    const req = new Request('http://localhost', { method: 'PUT', body: JSON.stringify({}) })
    const res = await PUT(req as never, makeParams('u1'))
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 6. admin/users/[id]/invite-member POST
// ---------------------------------------------------------------------------

describe('POST /api/admin/users/[id]/invite-member', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { POST } = await import('@/app/api/admin/users/[id]/invite-member/route')
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    const res = await POST(req as never, makeParams('owner-1'))
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    mockAdminAuth()
    vi.mocked(createUserSchema.safeParse).mockReturnValue({
      success: false,
      error: { issues: [{ message: 'Email required' }] },
    } as never)

    const { POST } = await import('@/app/api/admin/users/[id]/invite-member/route')
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    const res = await POST(req as never, makeParams('owner-1'))
    expect(res.status).toBe(400)
  })

  it('returns 400 when user has no company', async () => {
    vi.mocked(createUserSchema.safeParse).mockReturnValue({
      success: true,
      data: { email: 'new@test.com', mode: 'create', password: 'pass123' },
    } as never)

    const ch = chainMock()
    ch.single.mockResolvedValue({ data: null, error: null })
    const supabase = {
      from: vi.fn().mockReturnValue(ch),
      auth: { admin: { createUser: vi.fn() } },
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/users/[id]/invite-member/route')
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    const res = await POST(req as never, makeParams('owner-1'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('no company')
  })

  it('creates member in create mode', async () => {
    vi.mocked(createUserSchema.safeParse).mockReturnValue({
      success: true,
      data: { email: 'new@test.com', mode: 'create', password: 'pass123' },
    } as never)

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'company_members') {
          const ch = chainMock()
          ch.single.mockResolvedValue({ data: { company_id: 'c1' }, error: null })
          return ch
        }
        if (table === 'companies') {
          const ch = chainMock()
          ch.single.mockResolvedValue({ data: { company_name: 'TestCo' }, error: null })
          return ch
        }
        if (table === 'subscriptions') {
          const ch = chainMock()
          ch.single.mockResolvedValue({ data: { plan: 'pro' }, error: null })
          return ch
        }
        return chainMock(null, null)
      }),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'new-user' } },
            error: null,
          }),
        },
      },
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/users/[id]/invite-member/route')
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    const res = await POST(req as never, makeParams('owner-1'))
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.userId).toBe('new-user')
    expect(body.mode).toBe('create')
  })

  it('invites member in invite mode', async () => {
    vi.mocked(createUserSchema.safeParse).mockReturnValue({
      success: true,
      data: { email: 'new@test.com', mode: 'invite' },
    } as never)

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'company_members') {
          const ch = chainMock()
          ch.single.mockResolvedValue({ data: { company_id: 'c1' }, error: null })
          return ch
        }
        if (table === 'companies') {
          const ch = chainMock()
          ch.single.mockResolvedValue({ data: { company_name: 'TestCo' }, error: null })
          return ch
        }
        if (table === 'subscriptions') {
          const ch = chainMock()
          ch.single.mockResolvedValue({ data: { plan: 'free' }, error: null })
          return ch
        }
        return chainMock(null, null)
      }),
      auth: {
        admin: {
          inviteUserByEmail: vi.fn().mockResolvedValue({
            data: { user: { id: 'invited-user' } },
            error: null,
          }),
        },
      },
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/users/[id]/invite-member/route')
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    const res = await POST(req as never, makeParams('owner-1'))
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.userId).toBe('invited-user')
    expect(body.mode).toBe('invite')
  })

  it('returns 500 when createUser fails', async () => {
    vi.mocked(createUserSchema.safeParse).mockReturnValue({
      success: true,
      data: { email: 'new@test.com', mode: 'create', password: 'pass123' },
    } as never)

    const ch = chainMock()
    ch.single.mockResolvedValue({ data: { company_id: 'c1' }, error: null })
    const supabase = {
      from: vi.fn().mockReturnValue(ch),
      auth: {
        admin: {
          createUser: vi.fn().mockResolvedValue({
            data: { user: null },
            error: { message: 'Email taken' },
          }),
        },
      },
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/users/[id]/invite-member/route')
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) })
    const res = await POST(req as never, makeParams('owner-1'))
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 7. admin/sessions GET
// ---------------------------------------------------------------------------

describe('GET /api/admin/sessions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { GET } = await import('@/app/api/admin/sessions/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/sessions'))
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns sessions on happy path', async () => {
    const now = new Date()
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000)
    const sessionData = [
      {
        id: 's1',
        user_id: 'u1',
        started_at: fiveMinAgo.toISOString(),
        last_active_at: now.toISOString(),
        ended_at: null,
      },
    ]

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'user_sessions') {
          return chainMock(sessionData, null, 1)
        }
        if (table === 'company_settings') {
          return chainMock([{ user_id: 'u1', company_name: 'TestCo', email: 'u1@test.com' }])
        }
        if (table === 'company_members') {
          return chainMock([{ user_id: 'u1', full_name: 'Test User' }])
        }
        return chainMock()
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/sessions/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/sessions'))
    const res = await GET(req)
    const body = await res.json()
    expect(body.sessions).toBeDefined()
    expect(body.page).toBe(1)
  })

  it('filters ghost sessions (< 1 second)', async () => {
    const now = new Date()
    const sessionData = [
      {
        id: 's1',
        user_id: 'u1',
        started_at: now.toISOString(),
        last_active_at: now.toISOString(), // same time = ghost
        ended_at: null,
      },
    ]

    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'user_sessions') return chainMock(sessionData, null, 1)
        return chainMock([])
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/sessions/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/sessions'))
    const res = await GET(req)
    const body = await res.json()
    expect(body.sessions).toHaveLength(0)
  })

  it('returns 500 on DB error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue(chainMock(null, { message: 'fail' })),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/sessions/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/sessions'))
    const res = await GET(req)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 8. admin/invitation-codes GET + POST + DELETE
// ---------------------------------------------------------------------------

describe('GET /api/admin/invitation-codes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    // The default mock has getUser returning null
    const { GET } = await import('@/app/api/admin/invitation-codes/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('POST /api/admin/invitation-codes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const { POST } = await import('@/app/api/admin/invitation-codes/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ code: 'TEST' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/admin/invitation-codes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const { DELETE } = await import('@/app/api/admin/invitation-codes/route')
    const req = new Request('http://localhost', {
      method: 'DELETE',
      body: JSON.stringify({ id: 'code-1' }),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(401)
  })
})

// ---------------------------------------------------------------------------
// 9. admin/stripe GET
// ---------------------------------------------------------------------------

describe('GET /api/admin/stripe', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { GET } = await import('@/app/api/admin/stripe/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns stripe metrics on happy path', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'subscriptions') {
          return chainMock([
            {
              plan: 'free',
              status: 'active',
              stripe_price_id: null,
              cancel_at_period_end: false,
              stripe_customer_id: null,
              company_id: 'c1',
            },
            {
              plan: 'pro',
              status: 'active',
              stripe_price_id: null,
              cancel_at_period_end: false,
              stripe_customer_id: 'cus_1',
              company_id: 'c2',
            },
          ])
        }
        if (table === 'audit_logs') {
          return chainMock([])
        }
        return chainMock()
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/stripe/route')
    const res = await GET()
    const body = await res.json()
    expect(body.metrics).toBeDefined()
    expect(body.metrics.activePro).toBe(1)
    expect(body.events).toBeDefined()
    expect(body.webhookConfigured).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 10. admin/impersonate POST
// ---------------------------------------------------------------------------

describe('POST /api/admin/impersonate', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { POST } = await import('@/app/api/admin/impersonate/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/impersonate'), {
      method: 'POST',
      body: JSON.stringify({ userId: 'u1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 when userId is missing', async () => {
    mockAdminAuth()
    const { POST } = await import('@/app/api/admin/impersonate/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/impersonate'), {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 404 when user not found', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue(chainMock()),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'not found' } }),
          generateLink: vi.fn(),
        },
      },
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/impersonate/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/impersonate'), {
      method: 'POST',
      body: JSON.stringify({ userId: 'nonexistent' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(404)
  })

  it('returns impersonation URL on happy path', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue(chainMock()),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { id: 'u1', email: 'target@test.com' } },
            error: null,
          }),
          generateLink: vi.fn().mockResolvedValue({
            data: { properties: { action_link: 'http://link', hashed_token: 'abc123' } },
            error: null,
          }),
        },
      },
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/impersonate/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/impersonate'), {
      method: 'POST',
      body: JSON.stringify({ userId: 'u1' }),
      headers: { origin: 'http://localhost' },
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.url).toContain('token_hash=abc123')
  })

  it('returns 500 when generateLink fails', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue(chainMock()),
      auth: {
        admin: {
          getUserById: vi.fn().mockResolvedValue({
            data: { user: { id: 'u1', email: 'target@test.com' } },
            error: null,
          }),
          generateLink: vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } }),
        },
      },
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/impersonate/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/impersonate'), {
      method: 'POST',
      body: JSON.stringify({ userId: 'u1' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 11. admin/sponsor-stats GET
// ---------------------------------------------------------------------------

describe('GET /api/admin/sponsor-stats', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { GET } = await import('@/app/api/admin/sponsor-stats/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns zeros when no free users exist', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'subscriptions') return chainMock([])
        return chainMock([])
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/sponsor-stats/route')
    const res = await GET()
    const body = await res.json()
    expect(body.totalFreeUsers).toBe(0)
    expect(body.withSponsor).toBe(0)
  })

  it('returns sponsor stats with free users', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'subscriptions') return chainMock([{ user_id: 'u1' }])
        if (table === 'user_categories') return chainMock([{ user_id: 'u1', category_id: 'cat1' }])
        if (table === 'company_members') return chainMock([{ user_id: 'u1', company_id: 'c1' }])
        if (table === 'companies') return chainMock([{ id: 'c1', city: 'Stockholm', country_code: 'SE' }])
        if (table === 'sponsors')
          return chainMock([
            {
              id: 's1',
              name: 'Sponsor',
              instrument_category_id: 'cat1',
              target_country: null,
              target_cities: null,
              active: true,
            },
          ])
        return chainMock([])
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/sponsor-stats/route')
    const res = await GET()
    const body = await res.json()
    expect(body.totalFreeUsers).toBe(1)
    expect(body.withSponsor).toBe(1)
    expect(body.byCity).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// 12. admin/sponsor-stats/[id] GET
// ---------------------------------------------------------------------------

describe('GET /api/admin/sponsor-stats/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { GET } = await import('@/app/api/admin/sponsor-stats/[id]/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/sponsor-stats/s1'))
    const res = await GET(req, makeParams('s1'))
    expect(res.status).toBe(401)
  })

  it('returns zeros when no impressions', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue(chainMock([])),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/sponsor-stats/[id]/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/sponsor-stats/s1'))
    const res = await GET(req, makeParams('s1'))
    const body = await res.json()
    expect(body.total).toBe(0)
    expect(body.app).toBe(0)
  })

  it('returns impression stats on happy path', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'sponsor_impressions') {
          return chainMock([
            { impression_type: 'app', user_id: 'u1', created_at: '2026-01-01' },
            { impression_type: 'pdf', user_id: 'u1', created_at: '2026-01-02' },
            { impression_type: 'click', user_id: 'u2', created_at: '2026-01-03' },
          ])
        }
        if (table === 'company_members')
          return chainMock([
            { user_id: 'u1', company_id: 'c1' },
            { user_id: 'u2', company_id: 'c1' },
          ])
        if (table === 'companies') return chainMock([{ id: 'c1', city: 'Goteborg', country_code: 'SE' }])
        return chainMock()
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/sponsor-stats/[id]/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/sponsor-stats/s1'))
    const res = await GET(req, makeParams('s1'))
    const body = await res.json()
    expect(body.total).toBe(3)
    expect(body.app).toBe(1)
    expect(body.pdf).toBe(1)
    expect(body.click).toBe(1)
    expect(body.byCity).toHaveLength(1)
  })

  it('returns 500 on DB error', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue(chainMock(null, { message: 'fail' })),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { GET } = await import('@/app/api/admin/sponsor-stats/[id]/route')
    const { NextRequest } = await import('next/server')
    const req = new NextRequest(new URL('http://localhost/api/admin/sponsor-stats/s1'))
    const res = await GET(req, makeParams('s1'))
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 13. admin/assign-categories POST + DELETE
// ---------------------------------------------------------------------------

describe('POST /api/admin/assign-categories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { POST } = await import('@/app/api/admin/assign-categories/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        category_ids: ['b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    mockAdminAuth()
    const { POST } = await import('@/app/api/admin/assign-categories/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ user_id: 'not-uuid', category_ids: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('assigns categories on happy path', async () => {
    const ch = chainMock(null, null)
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/assign-categories/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        category_ids: ['b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33'],
      }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.assigned).toBe(2)
  })

  it('returns 500 on upsert error', async () => {
    const ch = chainMock(null, { message: 'fail' })
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/assign-categories/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        category_ids: ['b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/admin/assign-categories', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { DELETE } = await import('@/app/api/admin/assign-categories/route')
    const req = new Request('http://localhost', {
      method: 'DELETE',
      body: JSON.stringify({
        user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        category_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      }),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    mockAdminAuth()
    const { DELETE } = await import('@/app/api/admin/assign-categories/route')
    const req = new Request('http://localhost', {
      method: 'DELETE',
      body: JSON.stringify({ user_id: 'bad' }),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('removes category on happy path', async () => {
    const ch = chainMock(null, null)
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { DELETE } = await import('@/app/api/admin/assign-categories/route')
    const req = new Request('http://localhost', {
      method: 'DELETE',
      body: JSON.stringify({
        user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        category_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      }),
    })
    const res = await DELETE(req)
    const body = await res.json()
    expect(body.removed).toBe(true)
  })

  it('returns 500 on delete error', async () => {
    const ch = chainMock(null, { message: 'fail' })
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { DELETE } = await import('@/app/api/admin/assign-categories/route')
    const req = new Request('http://localhost', {
      method: 'DELETE',
      body: JSON.stringify({
        user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        category_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
      }),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// 14. admin/analyze-instruments POST
// ---------------------------------------------------------------------------

describe('POST /api/admin/analyze-instruments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { POST } = await import('@/app/api/admin/analyze-instruments/route')
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns empty results when no categories', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'instrument_categories') return chainMock(null)
        return chainMock([])
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/analyze-instruments/route')
    const res = await POST()
    expect(res.status).toBe(500)
  })

  it('returns empty results when no users with text', async () => {
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'instrument_categories') return chainMock([{ id: 'cat1', name: 'Strings', slug: 'strings' }])
        if (table === 'company_settings') return chainMock([])
        return chainMock([])
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/analyze-instruments/route')
    const res = await POST()
    const body = await res.json()
    expect(body.results).toEqual([])
    expect(body.message).toContain('No free text')
  })
})

// ---------------------------------------------------------------------------
// 15. admin/analyze-instruments/apply POST
// ---------------------------------------------------------------------------

describe('POST /api/admin/analyze-instruments/apply', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { POST } = await import('@/app/api/admin/analyze-instruments/apply/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ matches: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid data', async () => {
    mockAdminAuth()
    const { POST } = await import('@/app/api/admin/analyze-instruments/apply/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ matches: [{ user_id: 'bad', category_id: 'bad' }] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 0 when matches is empty', async () => {
    mockAdminAuth()
    const { POST } = await import('@/app/api/admin/analyze-instruments/apply/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ matches: [] }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.applied).toBe(0)
  })

  it('applies matches on happy path', async () => {
    const ch = chainMock(null, null)
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/analyze-instruments/apply/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        matches: [
          { user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', category_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' },
        ],
      }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.applied).toBe(1)
  })

  it('returns 500 on upsert error', async () => {
    const ch = chainMock(null, { message: 'fail' })
    const supabase = { from: vi.fn().mockReturnValue(ch) }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/analyze-instruments/apply/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({
        matches: [
          { user_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', category_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' },
        ],
      }),
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
  })
})

// ---------------------------------------------------------------------------
// analyze-instruments POST — happy path + branches
// ---------------------------------------------------------------------------

describe('POST /api/admin/analyze-instruments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not admin', async () => {
    mockAdminFail()
    const { POST } = await import('@/app/api/admin/analyze-instruments/route')
    const res = await POST()
    expect(res.status).toBe(401)
  })

  it('returns 500 when categories cannot be loaded', async () => {
    const supabase = {
      from: vi.fn().mockReturnValue(chainMock(null, { message: 'fail' })),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/analyze-instruments/route')
    const res = await POST()
    expect(res.status).toBe(500)
  })

  it('returns empty results when no users with instruments_text', async () => {
    let callCount = 0
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // categories
          return chainMock([{ id: 'cat1', name: 'Stråk', slug: 'strak' }])
        }
        // settings - no users
        return chainMock([], null)
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/analyze-instruments/route')
    const res = await POST()
    const body = await res.json()
    expect(body.results).toEqual([])
    expect(body.message).toBe('No free text to analyze')
  })

  it('returns empty results when all users have blank instruments_text', async () => {
    let callCount = 0
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return chainMock([{ id: 'cat1', name: 'Stråk', slug: 'strak' }])
        // settings with only whitespace texts
        return chainMock([{ user_id: 'u1', instruments_text: '   ', email: 'u1@test.com', company_name: 'Co' }], null)
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    const { POST } = await import('@/app/api/admin/analyze-instruments/route')
    const res = await POST()
    const body = await res.json()
    expect(body.results).toEqual([])
  })

  it('calls AI and returns enriched results on happy path', async () => {
    const aiResponse = JSON.stringify([
      {
        user_id: 'u1',
        matches: [{ text: 'violin', category_id: 'cat1', category_name: 'Stråk', confidence: 0.95 }],
      },
    ])

    let callCount = 0
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // categories
          return chainMock([{ id: 'cat1', name: 'Stråk', slug: 'strak' }])
        }
        if (callCount === 2) {
          // settings
          return chainMock(
            [{ user_id: 'u1', instruments_text: 'violin, viola', email: 'u1@test.com', company_name: 'TestCo' }],
            null,
          )
        }
        // existing user_categories
        return chainMock([{ user_id: 'u1', category_id: 'cat1' }], null)
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: aiResponse }],
      usage: { input_tokens: 100, output_tokens: 50 },
    })

    const { POST } = await import('@/app/api/admin/analyze-instruments/route')
    const res = await POST()
    const body = await res.json()
    expect(body.results).toHaveLength(1)
    expect(body.results[0].email).toBe('u1@test.com')
    expect(body.results[0].company_name).toBe('TestCo')
    expect(body.analyzed).toBe(1)
    expect(body.tokens).toEqual({ input: 100, output: 50 })
  })

  it('returns 500 when AI response cannot be parsed', async () => {
    let callCount = 0
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return chainMock([{ id: 'cat1', name: 'Stråk', slug: 'strak' }])
        if (callCount === 2)
          return chainMock(
            [{ user_id: 'u1', instruments_text: 'violin', email: 'u1@test.com', company_name: null }],
            null,
          )
        return chainMock([], null)
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Sorry, no JSON here' }],
      usage: { input_tokens: 50, output_tokens: 10 },
    })

    const { POST } = await import('@/app/api/admin/analyze-instruments/route')
    const res = await POST()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Could not parse AI response')
  })

  it('returns 500 when AI call throws', async () => {
    let callCount = 0
    const supabase = {
      from: vi.fn().mockImplementation(() => {
        callCount++
        if (callCount === 1) return chainMock([{ id: 'cat1', name: 'Stråk', slug: 'strak' }])
        if (callCount === 2)
          return chainMock(
            [{ user_id: 'u1', instruments_text: 'violin', email: 'u1@test.com', company_name: null }],
            null,
          )
        return chainMock([], null)
      }),
    }
    vi.mocked(verifyAdmin).mockResolvedValue({ userId: 'admin-1', supabase } as never)

    mockAnthropicCreate.mockRejectedValue(new Error('API error'))

    const { POST } = await import('@/app/api/admin/analyze-instruments/route')
    const res = await POST()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('AI analysis failed')
  })
})

// ---------------------------------------------------------------------------
// invitation-codes GET, POST, DELETE
// ---------------------------------------------------------------------------

describe('GET /api/admin/invitation-codes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    // The default mock has getUser returning null user, rpc returning false
    const { GET } = await import('@/app/api/admin/invitation-codes/route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns codes on happy path', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
      rpc: vi.fn().mockResolvedValue({ data: true }),
    } as never)

    const { createClient: supabaseCreateClient } = await import('@supabase/supabase-js')
    vi.mocked(supabaseCreateClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [{ id: 'code-1', code: 'ABC123', max_uses: 5, uses: 0 }],
          error: null,
        }),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    } as never)

    const { GET } = await import('@/app/api/admin/invitation-codes/route')
    const res = await GET()
    const body = await res.json()
    expect(body.codes).toHaveLength(1)
    expect(body.codes[0].code).toBe('ABC123')
  })

  it('returns 500 on DB error', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
      rpc: vi.fn().mockResolvedValue({ data: true }),
    } as never)

    const { createClient: supabaseCreateClient } = await import('@supabase/supabase-js')
    vi.mocked(supabaseCreateClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB fail' } }),
      }),
    } as never)

    const { GET } = await import('@/app/api/admin/invitation-codes/route')
    const res = await GET()
    expect(res.status).toBe(500)
  })
})

describe('POST /api/admin/invitation-codes (happy paths)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when code is missing', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
      rpc: vi.fn().mockResolvedValue({ data: true }),
    } as never)

    const { POST } = await import('@/app/api/admin/invitation-codes/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('creates code on happy path', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
      rpc: vi.fn().mockResolvedValue({ data: true }),
    } as never)

    const { createClient: supabaseCreateClient } = await import('@supabase/supabase-js')
    vi.mocked(supabaseCreateClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: 'code-1', code: 'NEWCODE', max_uses: 1 },
          error: null,
        }),
      }),
    } as never)

    const { POST } = await import('@/app/api/admin/invitation-codes/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ code: 'newcode', max_uses: 1 }),
    })
    const res = await POST(req)
    const body = await res.json()
    expect(body.code).toBeDefined()
    expect(body.code.code).toBe('NEWCODE')
  })

  it('returns 409 when code already exists', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
      rpc: vi.fn().mockResolvedValue({ data: true }),
    } as never)

    const { createClient: supabaseCreateClient } = await import('@supabase/supabase-js')
    vi.mocked(supabaseCreateClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: '23505', message: 'duplicate' },
        }),
      }),
    } as never)

    const { POST } = await import('@/app/api/admin/invitation-codes/route')
    const req = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ code: 'EXISTING' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(409)
  })
})

describe('DELETE /api/admin/invitation-codes (happy paths)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 when id is missing', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
      rpc: vi.fn().mockResolvedValue({ data: true }),
    } as never)

    const { DELETE } = await import('@/app/api/admin/invitation-codes/route')
    const req = new Request('http://localhost', {
      method: 'DELETE',
      body: JSON.stringify({}),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(400)
  })

  it('deletes code on happy path', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
      rpc: vi.fn().mockResolvedValue({ data: true }),
    } as never)

    const { createClient: supabaseCreateClient } = await import('@supabase/supabase-js')
    vi.mocked(supabaseCreateClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as never)

    const { DELETE } = await import('@/app/api/admin/invitation-codes/route')
    const req = new Request('http://localhost', {
      method: 'DELETE',
      body: JSON.stringify({ id: 'code-1' }),
    })
    const res = await DELETE(req)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 500 on DB error', async () => {
    const { createServerClient } = await import('@supabase/ssr')
    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
      rpc: vi.fn().mockResolvedValue({ data: true }),
    } as never)

    const { createClient: supabaseCreateClient } = await import('@supabase/supabase-js')
    vi.mocked(supabaseCreateClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: { message: 'fail' } }),
      }),
    } as never)

    const { DELETE } = await import('@/app/api/admin/invitation-codes/route')
    const req = new Request('http://localhost', {
      method: 'DELETE',
      body: JSON.stringify({ id: 'code-1' }),
    })
    const res = await DELETE(req)
    expect(res.status).toBe(500)
  })
})
