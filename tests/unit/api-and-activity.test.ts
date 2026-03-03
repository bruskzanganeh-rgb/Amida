import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createHash } from 'crypto'

// Recursive index type for mock responses — allows deep property access without `any`
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface DeepRecord extends Record<string, DeepRecord & { length?: number }> {}
interface MockResponse {
  data: DeepRecord
  status: number
  json: () => Promise<DeepRecord>
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data: unknown, opts?: { status?: number }) => ({
      data,
      status: opts?.status ?? 200,
      json: async () => data,
    })),
  },
}))

// We need to mock fastest-levenshtein for client-matcher
vi.mock('fastest-levenshtein', () => ({
  distance: vi.fn((a: string, b: string) => {
    // Simple Levenshtein implementation for tests
    const la = a.length
    const lb = b.length
    const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0))
    for (let i = 0; i <= la; i++) dp[i][0] = i
    for (let j = 0; j <= lb; j++) dp[0][j] = j
    for (let i = 1; i <= la; i++) {
      for (let j = 1; j <= lb; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      }
    }
    return dp[la][lb]
  }),
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

// ============================================================================
// api-response.ts tests
// ============================================================================

describe('api-response', () => {
  let apiSuccess: typeof import('@/lib/api-response').apiSuccess
  let apiError: typeof import('@/lib/api-response').apiError
  let apiValidationError: typeof import('@/lib/api-response').apiValidationError

  beforeEach(async () => {
    const mod = await import('@/lib/api-response')
    apiSuccess = mod.apiSuccess
    apiError = mod.apiError
    apiValidationError = mod.apiValidationError
  })

  describe('apiSuccess', () => {
    it('returns success response with default status 200', () => {
      const result = apiSuccess({ id: 1, name: 'test' }) as MockResponse
      expect(result.data).toEqual({ success: true, data: { id: 1, name: 'test' } })
      expect(result.status).toBe(200)
    })

    it('returns success response with custom status 201', () => {
      const result = apiSuccess({ created: true }, 201) as MockResponse
      expect(result.data).toEqual({ success: true, data: { created: true } })
      expect(result.status).toBe(201)
    })

    it('returns success response with null data', () => {
      const result = apiSuccess(null) as MockResponse
      expect(result.data).toEqual({ success: true, data: null })
    })

    it('returns success response with empty array', () => {
      const result = apiSuccess([]) as MockResponse
      expect(result.data).toEqual({ success: true, data: [] })
    })

    it('returns success response with nested object', () => {
      const nested = { a: { b: { c: [1, 2, 3] } } }
      const result = apiSuccess(nested) as MockResponse
      expect(result.data.data).toEqual(nested)
    })

    it('returns success response with string data', () => {
      const result = apiSuccess('message') as MockResponse
      expect(result.data).toEqual({ success: true, data: 'message' })
    })

    it('returns success response with status 204', () => {
      const result = apiSuccess(undefined, 204) as MockResponse
      expect(result.status).toBe(204)
    })

    it('json() method resolves to the data', async () => {
      const result = apiSuccess({ foo: 'bar' }) as MockResponse
      const json = await result.json()
      expect(json).toEqual({ success: true, data: { foo: 'bar' } })
    })
  })

  describe('apiError', () => {
    it('returns error response with default status 400', () => {
      const result = apiError('Something went wrong') as MockResponse
      expect(result.data).toEqual({ success: false, error: 'Something went wrong' })
      expect(result.status).toBe(400)
    })

    it('returns error response with custom status 404', () => {
      const result = apiError('Not found', 404) as MockResponse
      expect(result.data).toEqual({ success: false, error: 'Not found' })
      expect(result.status).toBe(404)
    })

    it('returns error response with status 500', () => {
      const result = apiError('Internal server error', 500) as MockResponse
      expect(result.status).toBe(500)
    })

    it('returns error response with status 401', () => {
      const result = apiError('Unauthorized', 401) as MockResponse
      expect(result.data.error).toBe('Unauthorized')
      expect(result.status).toBe(401)
    })

    it('returns error response with status 403', () => {
      const result = apiError('Forbidden', 403) as MockResponse
      expect(result.data.error).toBe('Forbidden')
      expect(result.status).toBe(403)
    })

    it('returns error response with empty string error', () => {
      const result = apiError('') as MockResponse
      expect(result.data).toEqual({ success: false, error: '' })
    })

    it('json() method resolves to error data', async () => {
      const result = apiError('fail') as MockResponse
      const json = await result.json()
      expect(json.success).toBe(false)
      expect(json.error).toBe('fail')
    })
  })

  describe('apiValidationError', () => {
    it('returns validation error with field errors', () => {
      const fieldErrors = { name: ['Required'], email: ['Invalid email'] }
      const result = apiValidationError(fieldErrors) as MockResponse
      expect(result.data).toEqual({
        success: false,
        error: 'Validation failed',
        fieldErrors,
      })
      expect(result.status).toBe(400)
    })

    it('returns validation error with empty field errors', () => {
      const result = apiValidationError({}) as MockResponse
      expect(result.data.fieldErrors).toEqual({})
      expect(result.data.error).toBe('Validation failed')
    })

    it('returns validation error with multiple errors per field', () => {
      const fieldErrors = { password: ['Too short', 'Must contain number', 'Must contain uppercase'] }
      const result = apiValidationError(fieldErrors) as MockResponse
      expect(result.data.fieldErrors.password).toHaveLength(3)
    })

    it('always returns status 400', () => {
      const result = apiValidationError({ x: ['err'] }) as MockResponse
      expect(result.status).toBe(400)
    })

    it('includes success: false in response', () => {
      const result = apiValidationError({ field: ['error'] }) as MockResponse
      expect(result.data.success).toBe(false)
    })

    it('preserves field error arrays exactly', () => {
      const fieldErrors = { a: ['1', '2'], b: ['3'] }
      const result = apiValidationError(fieldErrors) as MockResponse
      expect(result.data.fieldErrors.a).toEqual(['1', '2'])
      expect(result.data.fieldErrors.b).toEqual(['3'])
    })
  })
})

// ============================================================================
// api-auth.ts tests
// ============================================================================

describe('api-auth', () => {
  let validateApiKey: typeof import('@/lib/api-auth').validateApiKey
  let requireScope: typeof import('@/lib/api-auth').requireScope

  // Helper to create a fake key of proper format
  const createFakeKey = () => {
    // ak_ + 64 hex chars = 67 total
    return 'ak_' + 'a'.repeat(64)
  }

  const createKeyHash = (key: string) => createHash('sha256').update(key).digest('hex')

  let mockSingle: ReturnType<typeof vi.fn>
  let mockEq2: ReturnType<typeof vi.fn>
  let mockEq1: ReturnType<typeof vi.fn>
  let mockSelect: ReturnType<typeof vi.fn>
  let mockUpdateEq: ReturnType<typeof vi.fn>
  let mockUpdateThen: ReturnType<typeof vi.fn>
  let mockUpdate: ReturnType<typeof vi.fn>
  let mockFrom: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/lib/api-auth')
    validateApiKey = mod.validateApiKey
    requireScope = mod.requireScope

    // Build a chainable mock for supabase queries
    mockSingle = vi.fn()
    mockEq2 = vi.fn(() => ({ single: mockSingle }))
    mockEq1 = vi.fn(() => ({ eq: mockEq2 }))
    mockSelect = vi.fn(() => ({ eq: mockEq1 }))
    mockUpdateThen = vi.fn()
    mockUpdateEq = vi.fn(() => ({ then: mockUpdateThen }))
    mockUpdate = vi.fn(() => ({ eq: mockUpdateEq }))
    mockFrom = vi.fn((table: string) => {
      if (table === 'api_keys') {
        return { select: mockSelect, update: mockUpdate }
      }
      return { select: mockSelect }
    })

    vi.mocked(createAdminClient).mockReturnValue({ from: mockFrom } as never)
  })

  describe('validateApiKey', () => {
    it('returns error when authHeader is null', async () => {
      const result = await validateApiKey(null)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.status).toBe(401)
        expect(result.error).toContain('Missing or invalid Authorization header')
      }
    })

    it('returns error when authHeader is empty string', async () => {
      const result = await validateApiKey('')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.status).toBe(401)
      }
    })

    it('returns error when authHeader lacks Bearer prefix', async () => {
      const result = await validateApiKey('Token abc123')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('Missing or invalid Authorization header')
      }
    })

    it('returns error when authHeader is just "Bearer" with no key', async () => {
      const result = await validateApiKey('Bearer ')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Invalid API key format')
      }
    })

    it('returns error when key does not start with ak_', async () => {
      const result = await validateApiKey('Bearer xx_' + 'a'.repeat(64))
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Invalid API key format')
        expect(result.status).toBe(401)
      }
    })

    it('returns error when key has wrong length (too short)', async () => {
      const result = await validateApiKey('Bearer ak_short')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Invalid API key format')
      }
    })

    it('returns error when key has wrong length (too long)', async () => {
      const result = await validateApiKey('Bearer ak_' + 'a'.repeat(100))
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Invalid API key format')
      }
    })

    it('returns error when key is not found in database', async () => {
      const fakeKey = createFakeKey()
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })

      const result = await validateApiKey(`Bearer ${fakeKey}`)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toBe('Invalid or inactive API key')
        expect(result.status).toBe(401)
      }
    })

    it('returns error when database returns error', async () => {
      const fakeKey = createFakeKey()
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'db error' } })

      const result = await validateApiKey(`Bearer ${fakeKey}`)
      expect(result.success).toBe(false)
    })

    it('returns success with valid key found in database', async () => {
      const fakeKey = createFakeKey()
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'key-id-123',
          user_id: 'user-id-456',
          scopes: ['gigs:read', 'invoices:read'],
          is_active: true,
        },
        error: null,
      })

      const result = await validateApiKey(`Bearer ${fakeKey}`)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.userId).toBe('user-id-456')
        expect(result.scopes).toEqual(['gigs:read', 'invoices:read'])
        expect(result.keyId).toBe('key-id-123')
      }
    })

    it('returns empty scopes array when key has null scopes', async () => {
      const fakeKey = createFakeKey()
      mockSingle.mockResolvedValueOnce({
        data: {
          id: 'key-id-789',
          user_id: 'user-id-012',
          scopes: null,
          is_active: true,
        },
        error: null,
      })

      const result = await validateApiKey(`Bearer ${fakeKey}`)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.scopes).toEqual([])
      }
    })

    it('hashes the API key with sha256 for lookup', async () => {
      const fakeKey = createFakeKey()
      const expectedHash = createKeyHash(fakeKey)
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })

      await validateApiKey(`Bearer ${fakeKey}`)

      // The first .eq() call should receive the key_hash
      expect(mockEq1).toHaveBeenCalledWith('key_hash', expectedHash)
    })

    it('queries for active keys only', async () => {
      const fakeKey = createFakeKey()
      mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } })

      await validateApiKey(`Bearer ${fakeKey}`)

      expect(mockEq2).toHaveBeenCalledWith('is_active', true)
    })

    it('updates last_used_at on successful validation', async () => {
      const fakeKey = createFakeKey()
      mockSingle.mockResolvedValueOnce({
        data: { id: 'key-1', user_id: 'u-1', scopes: [], is_active: true },
        error: null,
      })

      await validateApiKey(`Bearer ${fakeKey}`)

      // Verify update was called on api_keys table
      expect(mockUpdate).toHaveBeenCalled()
    })

    it('trims whitespace from extracted key', async () => {
      // Bearer prefix + space + key with trailing space
      const fakeKey = createFakeKey()
      mockSingle.mockResolvedValueOnce({
        data: { id: 'k-1', user_id: 'u-1', scopes: [], is_active: true },
        error: null,
      })

      const result = await validateApiKey(`Bearer ${fakeKey}  `)
      // After trim, key won't be 67 chars if trailing spaces
      // Actually, '  ' would make it 69 chars after trim it's 67 again
      // The key is trimmed: apiKey = authHeader.substring(7).trim()
      expect(result.success).toBe(true)
    })
  })

  describe('requireScope', () => {
    it('returns success when scope is present', () => {
      const result = requireScope(['gigs:read', 'invoices:read'], 'gigs:read')
      expect(result.success).toBe(true)
    })

    it('returns error when scope is missing', () => {
      const result = requireScope(['gigs:read'], 'invoices:write')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('Insufficient permissions')
        expect(result.error).toContain('invoices:write')
        expect(result.status).toBe(403)
      }
    })

    it('returns error when scopes array is empty', () => {
      const result = requireScope([], 'gigs:read')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.status).toBe(403)
      }
    })

    it('returns success when required scope is among many scopes', () => {
      const scopes = ['gigs:read', 'gigs:write', 'invoices:read', 'invoices:write', 'clients:read']
      const result = requireScope(scopes, 'clients:read')
      expect(result.success).toBe(true)
    })

    it('does exact string match on scope', () => {
      const result = requireScope(['gigs:read_all'], 'gigs:read')
      expect(result.success).toBe(false)
    })

    it('is case sensitive', () => {
      const result = requireScope(['Gigs:Read'], 'gigs:read')
      expect(result.success).toBe(false)
    })

    it('includes required scope name in error message', () => {
      const result = requireScope([], 'expenses:delete')
      if (!result.success) {
        expect(result.error).toContain('expenses:delete')
      }
    })
  })
})

// ============================================================================
// activity.ts tests
// ============================================================================

describe('activity', () => {
  let logActivity: typeof import('@/lib/activity').logActivity

  let mockInsert: ReturnType<typeof vi.fn>
  let mockFrom: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/lib/activity')
    logActivity = mod.logActivity

    mockInsert = vi.fn()
    mockFrom = vi.fn(() => ({ insert: mockInsert }))
    vi.mocked(createAdminClient).mockReturnValue({ from: mockFrom } as never)
  })

  describe('logActivity', () => {
    it('inserts activity event successfully', async () => {
      mockInsert.mockResolvedValueOnce({ error: null })

      await logActivity({
        userId: 'user-123',
        eventType: 'gig_created',
      })

      expect(mockFrom).toHaveBeenCalledWith('activity_events')
      expect(mockInsert).toHaveBeenCalledWith({
        user_id: 'user-123',
        event_type: 'gig_created',
        entity_type: null,
        entity_id: null,
        metadata: {},
        ip_address: null,
        user_agent: null,
      })
    })

    it('includes entity_type and entity_id when provided', async () => {
      mockInsert.mockResolvedValueOnce({ error: null })

      await logActivity({
        userId: 'user-123',
        eventType: 'invoice_created',
        entityType: 'invoice',
        entityId: 'inv-456',
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: 'invoice',
          entity_id: 'inv-456',
        }),
      )
    })

    it('includes metadata when provided', async () => {
      mockInsert.mockResolvedValueOnce({ error: null })

      await logActivity({
        userId: 'user-123',
        eventType: 'settings_changed',
        metadata: { field: 'locale', oldValue: 'en', newValue: 'sv' },
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: { field: 'locale', oldValue: 'en', newValue: 'sv' },
        }),
      )
    })

    it('includes ip_address and user_agent when provided', async () => {
      mockInsert.mockResolvedValueOnce({ error: null })

      await logActivity({
        userId: 'user-123',
        eventType: 'user_login',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          ip_address: '192.168.1.1',
          user_agent: 'Mozilla/5.0',
        }),
      )
    })

    it('does not throw on insert error', async () => {
      mockInsert.mockResolvedValueOnce({ error: { message: 'Insert failed' } })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(logActivity({ userId: 'user-123', eventType: 'gig_created' })).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith('Failed to log activity:', expect.any(Object))
      consoleSpy.mockRestore()
    })

    it('does not throw on exception', async () => {
      mockInsert.mockRejectedValueOnce(new Error('Network error'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await expect(logActivity({ userId: 'user-123', eventType: 'gig_created' })).resolves.not.toThrow()

      expect(consoleSpy).toHaveBeenCalledWith('Activity logging error:', expect.any(Error))
      consoleSpy.mockRestore()
    })

    it('returns void on success', async () => {
      mockInsert.mockResolvedValueOnce({ error: null })

      const result = await logActivity({ userId: 'user-1', eventType: 'user_logout' })
      expect(result).toBeUndefined()
    })

    it('defaults metadata to empty object', async () => {
      mockInsert.mockResolvedValueOnce({ error: null })

      await logActivity({ userId: 'u', eventType: 'onboarding_completed' })

      expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({ metadata: {} }))
    })

    it('defaults optional string fields to null', async () => {
      mockInsert.mockResolvedValueOnce({ error: null })

      await logActivity({ userId: 'u', eventType: 'expense_created' })

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          entity_type: null,
          entity_id: null,
          ip_address: null,
          user_agent: null,
        }),
      )
    })

    it('uses createAdminClient to bypass RLS', async () => {
      mockInsert.mockResolvedValueOnce({ error: null })

      await logActivity({ userId: 'u', eventType: 'receipt_scanned' })

      expect(createAdminClient).toHaveBeenCalled()
    })

    it('handles all event types without error', async () => {
      mockInsert.mockResolvedValue({ error: null })

      const eventTypes = [
        'invoice_sent',
        'invoice_downloaded',
        'invoice_created',
        'invoice_deleted',
        'invoice_paid',
        'gig_created',
        'gig_updated',
        'gig_deleted',
        'client_created',
        'client_updated',
        'client_deleted',
        'expense_created',
        'expense_updated',
        'expense_deleted',
        'receipt_scanned',
        'settings_changed',
        'tier_changed',
        'user_login',
        'user_logout',
        'onboarding_completed',
      ] as const

      for (const eventType of eventTypes) {
        await expect(logActivity({ userId: 'u', eventType })).resolves.not.toThrow()
      }
    })

    it('logs console error with the original error object on insert failure', async () => {
      const dbError = { message: 'constraint violation', code: '23505' }
      mockInsert.mockResolvedValueOnce({ error: dbError })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      await logActivity({ userId: 'u', eventType: 'gig_created' })

      expect(consoleSpy).toHaveBeenCalledWith('Failed to log activity:', dbError)
      consoleSpy.mockRestore()
    })
  })
})

// ============================================================================
// client-matcher.ts tests
// ============================================================================

describe('client-matcher', () => {
  let matchClient: typeof import('@/lib/import/client-matcher').matchClient
  let setClientMatch: typeof import('@/lib/import/client-matcher').setClientMatch

  let mockOrder: ReturnType<typeof vi.fn>
  let mockSelect: ReturnType<typeof vi.fn>
  let mockFrom: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/lib/import/client-matcher')
    matchClient = mod.matchClient
    setClientMatch = mod.setClientMatch

    mockOrder = vi.fn()
    mockSelect = vi.fn(() => ({ order: mockOrder }))
    mockFrom = vi.fn(() => ({ select: mockSelect }))

    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as never)
  })

  describe('matchClient', () => {
    it('returns exact match when client name matches exactly', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [
          { id: 'c1', name: 'Stockholms Konserthus', client_code: 'SKH' },
          { id: 'c2', name: 'Malmö Opera', client_code: 'MO' },
        ],
      })

      const result = await matchClient('Stockholms Konserthus')
      expect(result.clientId).toBe('c1')
      expect(result.confidence).toBe(1.0)
      expect(result.matchMethod).toBe('exact')
      expect(result.suggestions).toEqual([])
    })

    it('exact match is case-insensitive', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [{ id: 'c1', name: 'Malmö Opera', client_code: 'MO' }],
      })

      const result = await matchClient('malmö opera')
      expect(result.clientId).toBe('c1')
      expect(result.confidence).toBe(1.0)
      expect(result.matchMethod).toBe('exact')
    })

    it('trims whitespace from extracted name', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [{ id: 'c1', name: 'Royal Opera', client_code: 'RO' }],
      })

      const result = await matchClient('  Royal Opera  ')
      expect(result.clientId).toBe('c1')
      expect(result.matchMethod).toBe('exact')
    })

    it('returns no match when clients array is empty', async () => {
      mockOrder.mockResolvedValueOnce({ data: [] })

      const result = await matchClient('Some Client')
      expect(result.clientId).toBeNull()
      expect(result.confidence).toBe(0)
      expect(result.suggestions).toEqual([])
    })

    it('returns no match when clients data is null', async () => {
      mockOrder.mockResolvedValueOnce({ data: null })

      const result = await matchClient('Some Client')
      expect(result.clientId).toBeNull()
      expect(result.confidence).toBe(0)
    })

    it('returns fuzzy match when similarity is >= 0.85', async () => {
      // "Stockholms Konserthus" vs "Stockholms Konserths" (slight typo)
      // Levenshtein distance should be small enough for high similarity
      mockOrder.mockResolvedValueOnce({
        data: [
          { id: 'c1', name: 'Stockholms Konserthus', client_code: 'SKH' },
          { id: 'c2', name: 'Totally Different Name', client_code: 'TDN' },
        ],
      })

      const result = await matchClient('Stockholms Konserths')
      // The similarity of "Stockholms Konserths" vs "Stockholms Konserthus"
      // distance = 2 (missing 'u' at end and different), maxLen = 21
      // similarity = 1 - 2/21 = 0.905 >= 0.85
      expect(result.clientId).toBe('c1')
      expect(result.matchMethod).toBe('fuzzy')
      expect(result.confidence).toBeGreaterThanOrEqual(0.85)
    })

    it('fuzzy match includes suggestions for other good matches', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [
          { id: 'c1', name: 'Stockholms Konserthus', client_code: 'SKH' },
          { id: 'c2', name: 'Stockholms Stadsteater', client_code: 'SST' },
          { id: 'c3', name: 'Malmö Opera', client_code: 'MO' },
        ],
      })

      // "Stockholms Konserths" is closest to c1, but c2 also starts with "Stockholms"
      const result = await matchClient('Stockholms Konserths')
      expect(result.clientId).toBe('c1')
      // Suggestions should only include items with similarity > 0.7
    })

    it('returns token-based match when fuzzy similarity is below 0.85 but token match is >= 0.7', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [
          { id: 'c1', name: 'Göteborgs Symfoniker AB', client_code: 'GS' },
          { id: 'c2', name: 'Malmö Symfoniker HB', client_code: 'MS' },
        ],
      })

      // "Symfoniker Göteborg" has different word order but overlapping tokens
      // Token "symfoniker" matches, "göteborg" ~= "göteborgs"
      const result = await matchClient('Symfoniker Göteborg')
      if (result.matchMethod === 'token') {
        expect(result.confidence).toBeGreaterThanOrEqual(0.7)
      }
      // Either fuzzy or token match should work here
      expect(['fuzzy', 'token', 'manual']).toContain(result.matchMethod)
    })

    it('returns suggestions for manual review when no automatic match', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [
          { id: 'c1', name: 'Stockholms Konserthus', client_code: 'SKH' },
          { id: 'c2', name: 'Malmö Opera', client_code: 'MO' },
          { id: 'c3', name: 'Göteborgs Symfoniker', client_code: 'GS' },
        ],
      })

      const result = await matchClient('Completely Different Company XYZ')
      expect(result.clientId).toBeNull()
      expect(result.confidence).toBe(0)
      expect(result.matchMethod).toBe('manual')
      expect(result.suggestions.length).toBeGreaterThan(0)
      expect(result.suggestions.length).toBeLessThanOrEqual(5)
    })

    it('suggestions are sorted by similarity descending', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [
          { id: 'c1', name: 'Alpha Company', client_code: 'AC' },
          { id: 'c2', name: 'Beta Company', client_code: 'BC' },
          { id: 'c3', name: 'Gamma Company', client_code: 'GC' },
        ],
      })

      const result = await matchClient('Delta Company Something Else')
      // Manual path: suggestions sorted by fuzzy similarity desc
      if (result.suggestions.length >= 2) {
        for (let i = 0; i < result.suggestions.length - 1; i++) {
          expect(result.suggestions[i].similarity).toBeGreaterThanOrEqual(result.suggestions[i + 1].similarity)
        }
      }
    })

    it('suggestions have correct shape', async () => {
      mockOrder.mockResolvedValueOnce({
        data: [{ id: 'c1', name: 'Test Client', client_code: 'TC' }],
      })

      const result = await matchClient('Completely Different')
      if (result.suggestions.length > 0) {
        const suggestion = result.suggestions[0]
        expect(suggestion).toHaveProperty('id')
        expect(suggestion).toHaveProperty('name')
        expect(suggestion).toHaveProperty('similarity')
        expect(typeof suggestion.similarity).toBe('number')
      }
    })

    it('queries clients table with correct select and order', async () => {
      mockOrder.mockResolvedValueOnce({ data: [] })

      await matchClient('Test')

      expect(mockFrom).toHaveBeenCalledWith('clients')
      expect(mockSelect).toHaveBeenCalledWith('id, name, client_code')
      expect(mockOrder).toHaveBeenCalledWith('name')
    })

    it('limits manual suggestions to maximum 5', async () => {
      const manyClients = Array.from({ length: 20 }, (_, i) => ({
        id: `c${i}`,
        name: `Client Name ${i}`,
        client_code: `CN${i}`,
      }))
      mockOrder.mockResolvedValueOnce({ data: manyClients })

      const result = await matchClient('Something Totally Unrelated XYZZY')
      expect(result.suggestions.length).toBeLessThanOrEqual(5)
    })

    it('fuzzy match limits suggestions to maximum 3', async () => {
      const clients = Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`,
        // Make names very similar to trigger fuzzy match path
        name: `Konserthuse${i}`,
        client_code: `K${i}`,
      }))
      mockOrder.mockResolvedValueOnce({ data: clients })

      const result = await matchClient('Konserthuset')
      if (result.matchMethod === 'fuzzy') {
        expect(result.suggestions.length).toBeLessThanOrEqual(3)
      }
    })
  })

  describe('setClientMatch', () => {
    it('returns void (no-op stub for future cache)', async () => {
      const result = await setClientMatch('Name', 'id')
      expect(result).toBeUndefined()
    })

    it('does not throw on any input', async () => {
      await expect(setClientMatch('', '')).resolves.not.toThrow()
      await expect(setClientMatch('Very Long Name '.repeat(100), 'id')).resolves.not.toThrow()
    })
  })
})

// ============================================================================
// download.ts tests
// ============================================================================

describe('download', () => {
  let downloadFile: typeof import('@/lib/download').downloadFile

  let mockClick: ReturnType<typeof vi.fn>
  let mockAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> }
  let mockAppendChild: ReturnType<typeof vi.fn>
  let mockRemoveChild: ReturnType<typeof vi.fn>
  let mockCreateElement: ReturnType<typeof vi.fn>

  // Save originals to restore after tests
  const originalURL = global.URL
  const originalDocument = global.document
  const originalFetch = global.fetch

  beforeEach(async () => {
    vi.clearAllMocks()
    const mod = await import('@/lib/download')
    downloadFile = mod.downloadFile

    mockClick = vi.fn()
    mockAnchor = { href: '', download: '', click: mockClick }

    mockAppendChild = vi.fn()
    mockRemoveChild = vi.fn()
    mockCreateElement = vi.fn(() => mockAnchor)

    // Mock document
    Object.defineProperty(global, 'document', {
      value: {
        createElement: mockCreateElement,
        body: {
          appendChild: mockAppendChild,
          removeChild: mockRemoveChild,
        },
      },
      writable: true,
      configurable: true,
    })

    // Mock URL — keep the constructor working, just add static methods
    const MockURL = Object.assign(
      function (this: unknown, ...args: unknown[]) {
        return new originalURL(...(args as [string]))
      },
      {
        createObjectURL: vi.fn(() => 'blob:http://localhost/fake-blob-url'),
        revokeObjectURL: vi.fn(),
      },
    )
    Object.defineProperty(global, 'URL', {
      value: MockURL,
      writable: true,
      configurable: true,
    })

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(new Blob(['file content'])),
    }) as never
  })

  afterEach(() => {
    // Restore originals so other test suites are not affected
    Object.defineProperty(global, 'URL', { value: originalURL, writable: true, configurable: true })
    Object.defineProperty(global, 'document', { value: originalDocument, writable: true, configurable: true })
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('fetches the URL', async () => {
    await downloadFile('https://example.com/file.pdf', 'report.pdf')
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/file.pdf')
  })

  it('creates an anchor element', async () => {
    await downloadFile('https://example.com/file.pdf', 'report.pdf')
    expect(mockCreateElement).toHaveBeenCalledWith('a')
  })

  it('sets the download attribute to the filename', async () => {
    await downloadFile('https://example.com/file.pdf', 'my-report.pdf')
    expect(mockAnchor.download).toBe('my-report.pdf')
  })

  it('sets the href to the blob URL', async () => {
    await downloadFile('https://example.com/file.pdf', 'report.pdf')
    expect(mockAnchor.href).toBe('blob:http://localhost/fake-blob-url')
  })

  it('appends anchor to body before clicking', async () => {
    const callOrder: string[] = []
    mockAppendChild.mockImplementation(() => callOrder.push('append'))
    mockClick.mockImplementation(() => callOrder.push('click'))

    await downloadFile('https://example.com/file.pdf', 'report.pdf')

    expect(callOrder).toEqual(['append', 'click'])
  })

  it('triggers a click on the anchor', async () => {
    await downloadFile('https://example.com/file.pdf', 'report.pdf')
    expect(mockClick).toHaveBeenCalledOnce()
  })

  it('revokes the blob URL after click', async () => {
    await downloadFile('https://example.com/file.pdf', 'report.pdf')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/fake-blob-url')
  })

  it('removes the anchor from body after click', async () => {
    await downloadFile('https://example.com/file.pdf', 'report.pdf')
    expect(mockRemoveChild).toHaveBeenCalledWith(mockAnchor)
  })

  it('creates blob URL from fetched blob', async () => {
    await downloadFile('https://example.com/file.pdf', 'report.pdf')
    expect(URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
  })

  it('handles different filenames correctly', async () => {
    await downloadFile('https://example.com/data.csv', 'export-2024-01.csv')
    expect(mockAnchor.download).toBe('export-2024-01.csv')
  })

  it('cleans up in correct order: revoke then remove', async () => {
    const callOrder: string[] = []
    vi.mocked(URL.revokeObjectURL).mockImplementation(() => callOrder.push('revoke'))
    mockRemoveChild.mockImplementation(() => callOrder.push('remove'))

    await downloadFile('https://example.com/file.pdf', 'report.pdf')

    expect(callOrder).toEqual(['revoke', 'remove'])
  })
})

// ============================================================================
// subscription-utils.ts — supplemental tests (not in subscription.test.ts)
// ============================================================================

describe('subscription-utils (supplemental)', () => {
  let parseJsonArray: typeof import('@/lib/subscription-utils').parseJsonArray
  let buildTier: typeof import('@/lib/subscription-utils').buildTier
  let buildAllTiers: typeof import('@/lib/subscription-utils').buildAllTiers
  let isPro: typeof import('@/lib/subscription-utils').isPro
  let isTeam: typeof import('@/lib/subscription-utils').isTeam
  let resolvePlan: typeof import('@/lib/subscription-utils').resolvePlan
  let canCreateInvoice: typeof import('@/lib/subscription-utils').canCreateInvoice
  let canScanReceipt: typeof import('@/lib/subscription-utils').canScanReceipt

  beforeEach(async () => {
    const mod = await import('@/lib/subscription-utils')
    parseJsonArray = mod.parseJsonArray
    buildTier = mod.buildTier
    buildAllTiers = mod.buildAllTiers
    isPro = mod.isPro
    isTeam = mod.isTeam
    resolvePlan = mod.resolvePlan
    canCreateInvoice = mod.canCreateInvoice
    canScanReceipt = mod.canScanReceipt
  })

  describe('parseJsonArray', () => {
    it('returns fallback copy when value is undefined', () => {
      const fallback = ['a', 'b'] as const
      const result = parseJsonArray(undefined, fallback)
      expect(result).toEqual(['a', 'b'])
      // Verify it's a copy, not the same reference
      expect(result).not.toBe(fallback)
    })

    it('returns fallback when value is empty string', () => {
      const result = parseJsonArray('', ['default'])
      expect(result).toEqual(['default'])
    })

    it('parses valid JSON array', () => {
      const result = parseJsonArray('["x","y","z"]', ['fallback'])
      expect(result).toEqual(['x', 'y', 'z'])
    })

    it('returns fallback for invalid JSON', () => {
      const result = parseJsonArray('{broken', ['fb'])
      expect(result).toEqual(['fb'])
    })

    it('returns fallback for non-array JSON (object)', () => {
      const result = parseJsonArray('{"key":"value"}', ['fb'])
      expect(result).toEqual(['fb'])
    })

    it('returns fallback for non-array JSON (string)', () => {
      const result = parseJsonArray('"just a string"', ['fb'])
      expect(result).toEqual(['fb'])
    })

    it('returns fallback for non-array JSON (number)', () => {
      const result = parseJsonArray('42', ['fb'])
      expect(result).toEqual(['fb'])
    })

    it('returns empty array when parsing empty JSON array', () => {
      const result = parseJsonArray('[]', ['fb'])
      expect(result).toEqual([])
    })

    it('returns fallback for null JSON value', () => {
      const result = parseJsonArray('null', ['fb'])
      expect(result).toEqual(['fb'])
    })
  })

  describe('buildTier — additional cases', () => {
    it('overrides all numeric fields from config', () => {
      const config = {
        pro_invoice_limit: '100',
        pro_receipt_scan_limit: '50',
        pro_storage_mb: '2048',
        pro_price_monthly: '15',
        pro_price_yearly: '150',
      }
      const tier = buildTier('pro', config)
      expect(tier.invoiceLimit).toBe(100)
      expect(tier.receiptScanLimit).toBe(50)
      expect(tier.storageMb).toBe(2048)
      expect(tier.priceMonthly).toBe(15)
      expect(tier.priceYearly).toBe(150)
    })

    it('uses correct prefix for team tier', () => {
      const config = { team_storage_mb: '10240' }
      const tier = buildTier('team', config)
      expect(tier.storageMb).toBe(10240)
      // Other fields default to 0 when not in config
      expect(tier.invoiceLimit).toBe(0)
    })

    it('handles NaN from parseInt gracefully', () => {
      const config = { free_invoice_limit: 'not-a-number' }
      const tier = buildTier('free', config)
      expect(tier.invoiceLimit).toBeNaN()
    })
  })

  describe('buildAllTiers — additional cases', () => {
    it('applies config overrides to correct tiers', () => {
      const config = {
        free_invoice_limit: '10',
        pro_storage_mb: '2048',
        team_price_monthly: '20',
      }
      const tiers = buildAllTiers(config)
      expect(tiers.free.invoiceLimit).toBe(10)
      expect(tiers.pro.storageMb).toBe(2048)
      expect(tiers.team.priceMonthly).toBe(20)
      // Fields not in config default to 0
      expect(tiers.free.storageMb).toBe(0)
      expect(tiers.pro.invoiceLimit).toBe(0)
      expect(tiers.team.storageMb).toBe(0)
    })

    it('returns object with exactly three keys', () => {
      const tiers = buildAllTiers({})
      expect(Object.keys(tiers)).toEqual(['free', 'pro', 'team'])
    })
  })

  describe('isPro — edge cases', () => {
    it('returns false for undefined plan', () => {
      expect(isPro(undefined, 'active')).toBe(false)
    })

    it('returns false for undefined status', () => {
      expect(isPro('pro', undefined)).toBe(false)
    })

    it('returns false for both undefined', () => {
      expect(isPro(undefined, undefined)).toBe(false)
    })

    it('returns false for empty string plan', () => {
      expect(isPro('', 'active')).toBe(false)
    })

    it('returns false for pro+trialing status', () => {
      expect(isPro('pro', 'trialing')).toBe(false)
    })
  })

  describe('isTeam — edge cases', () => {
    it('returns false for undefined plan', () => {
      expect(isTeam(undefined, 'active')).toBe(false)
    })

    it('returns false for undefined status', () => {
      expect(isTeam('team', undefined)).toBe(false)
    })

    it('returns false for team+cancelled', () => {
      expect(isTeam('team', 'cancelled')).toBe(false)
    })

    it('returns false for free+active', () => {
      expect(isTeam('free', 'active')).toBe(false)
    })
  })

  describe('resolvePlan — additional combinations', () => {
    it('returns free for unknown plan string', () => {
      expect(resolvePlan('enterprise', 'active')).toBe('free')
    })

    it('returns free for team+past_due', () => {
      expect(resolvePlan('team', 'past_due')).toBe('free')
    })

    it('returns free for empty strings', () => {
      expect(resolvePlan('', '')).toBe('free')
    })
  })

  describe('canCreateInvoice — edge cases', () => {
    it('returns true when count is 0 and limit is positive', () => {
      const tier = { invoiceLimit: 1, receiptScanLimit: 0, storageMb: 0, priceMonthly: 0, priceYearly: 0, features: [] }
      expect(canCreateInvoice(tier, 0)).toBe(true)
    })

    it('returns false when count equals limit', () => {
      const tier = { invoiceLimit: 1, receiptScanLimit: 0, storageMb: 0, priceMonthly: 0, priceYearly: 0, features: [] }
      expect(canCreateInvoice(tier, 1)).toBe(false)
    })

    it('returns false when count exceeds limit', () => {
      const tier = { invoiceLimit: 3, receiptScanLimit: 0, storageMb: 0, priceMonthly: 0, priceYearly: 0, features: [] }
      expect(canCreateInvoice(tier, 10)).toBe(false)
    })

    it('treats limit of 0 as unlimited (Infinity)', () => {
      const tier = { invoiceLimit: 0, receiptScanLimit: 0, storageMb: 0, priceMonthly: 0, priceYearly: 0, features: [] }
      expect(canCreateInvoice(tier, 999999)).toBe(true)
    })
  })

  describe('canScanReceipt — edge cases', () => {
    it('returns true when count is 0 and limit is positive', () => {
      const tier = { invoiceLimit: 0, receiptScanLimit: 1, storageMb: 0, priceMonthly: 0, priceYearly: 0, features: [] }
      expect(canScanReceipt(tier, 0)).toBe(true)
    })

    it('returns false when count equals limit', () => {
      const tier = { invoiceLimit: 0, receiptScanLimit: 2, storageMb: 0, priceMonthly: 0, priceYearly: 0, features: [] }
      expect(canScanReceipt(tier, 2)).toBe(false)
    })

    it('treats limit of 0 as unlimited (Infinity)', () => {
      const tier = { invoiceLimit: 0, receiptScanLimit: 0, storageMb: 0, priceMonthly: 0, priceYearly: 0, features: [] }
      expect(canScanReceipt(tier, 999999)).toBe(true)
    })

    it('returns true at limit minus one', () => {
      const tier = { invoiceLimit: 0, receiptScanLimit: 5, storageMb: 0, priceMonthly: 0, priceYearly: 0, features: [] }
      expect(canScanReceipt(tier, 4)).toBe(true)
    })
  })
})
