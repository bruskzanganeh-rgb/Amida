import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================
// 1. lib/stripe.ts
// ============================================================

// Mock Stripe constructor
vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      subscriptions = {}
      customers = {}
    },
  }
})

import { getStripe, getPlanFromPriceId } from '@/lib/stripe'

describe('lib/stripe.ts', () => {
  describe('getStripe', () => {
    beforeEach(() => {
      // Reset the module-level _stripe singleton between tests
      // We need to clear the cached instance
      vi.resetModules()
    })

    it('returns a Stripe instance', () => {
      const stripe = getStripe()
      expect(stripe).toBeDefined()
    })

    it('returns the same instance on multiple calls (singleton)', () => {
      const first = getStripe()
      const second = getStripe()
      expect(first).toBe(second)
    })

    it('returns an object with expected Stripe properties', () => {
      const stripe = getStripe()
      expect(stripe).toHaveProperty('subscriptions')
      expect(stripe).toHaveProperty('customers')
    })
  })

  describe('getPlanFromPriceId', () => {
    const originalEnv = process.env

    beforeEach(() => {
      process.env = { ...originalEnv }
    })

    afterEach(() => {
      process.env = originalEnv
    })

    it('returns "pro" for null priceId', () => {
      expect(getPlanFromPriceId(null)).toBe('pro')
    })

    it('returns "pro" for undefined priceId', () => {
      expect(getPlanFromPriceId(undefined)).toBe('pro')
    })

    it('returns "pro" for empty string priceId', () => {
      expect(getPlanFromPriceId('')).toBe('pro')
    })

    it('returns "pro" when priceId does not match team prices', () => {
      expect(getPlanFromPriceId('price_unknown_123')).toBe('pro')
    })

    it('returns "team" when priceId matches STRIPE_TEAM_MONTHLY_PRICE_ID', () => {
      process.env.STRIPE_TEAM_MONTHLY_PRICE_ID = 'price_team_monthly'
      expect(getPlanFromPriceId('price_team_monthly')).toBe('team')
    })

    it('returns "team" when priceId matches STRIPE_TEAM_YEARLY_PRICE_ID', () => {
      process.env.STRIPE_TEAM_YEARLY_PRICE_ID = 'price_team_yearly'
      expect(getPlanFromPriceId('price_team_yearly')).toBe('team')
    })

    it('returns "team" when priceId matches NEXT_PUBLIC_STRIPE_TEAM_MONTHLY_PRICE_ID', () => {
      process.env.NEXT_PUBLIC_STRIPE_TEAM_MONTHLY_PRICE_ID = 'price_pub_team_monthly'
      expect(getPlanFromPriceId('price_pub_team_monthly')).toBe('team')
    })

    it('returns "team" when priceId matches NEXT_PUBLIC_STRIPE_TEAM_YEARLY_PRICE_ID', () => {
      process.env.NEXT_PUBLIC_STRIPE_TEAM_YEARLY_PRICE_ID = 'price_pub_team_yearly'
      expect(getPlanFromPriceId('price_pub_team_yearly')).toBe('team')
    })

    it('filters out falsy env vars', () => {
      process.env.STRIPE_TEAM_MONTHLY_PRICE_ID = ''
      process.env.STRIPE_TEAM_YEARLY_PRICE_ID = undefined
      expect(getPlanFromPriceId('price_unknown')).toBe('pro')
    })
  })
})

// ============================================================
// 2. lib/admin.ts
// ============================================================

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
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

import { verifyAdmin } from '@/lib/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

describe('lib/admin.ts', () => {
  describe('verifyAdmin', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('returns 401 when user is not authenticated', async () => {
      const mockServerClient = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      }
      vi.mocked(createServerClient).mockResolvedValue(mockServerClient as never)
      vi.mocked(createAdminClient).mockReturnValue({} as never)

      const result = await verifyAdmin()
      expect(result).toHaveProperty('status', 401)
    })

    it('returns 403 when user is not admin', async () => {
      const mockServerClient = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
      }
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({ data: false }),
      }
      vi.mocked(createServerClient).mockResolvedValue(mockServerClient as never)
      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never)

      const result = await verifyAdmin()
      expect(result).toHaveProperty('status', 403)
    })

    it('returns AdminAuth when user is admin', async () => {
      const mockServerClient = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
      }
      const mockAdmin = {
        rpc: vi.fn().mockResolvedValue({ data: true }),
      }
      vi.mocked(createServerClient).mockResolvedValue(mockServerClient as never)
      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never)

      const result = await verifyAdmin()
      expect(result).toHaveProperty('userId', 'admin-1')
      expect(result).toHaveProperty('supabase')
    })

    it('calls is_admin RPC with correct user id', async () => {
      const mockServerClient = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'uid-123' } } }) },
      }
      const mockRpc = vi.fn().mockResolvedValue({ data: true })
      const mockAdmin = { rpc: mockRpc }
      vi.mocked(createServerClient).mockResolvedValue(mockServerClient as never)
      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never)

      await verifyAdmin()
      expect(mockRpc).toHaveBeenCalledWith('is_admin', { uid: 'uid-123' })
    })

    it('creates admin client via createAdminClient', async () => {
      const mockServerClient = {
        auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
      }
      const mockAdmin = { rpc: vi.fn().mockResolvedValue({ data: false }) }
      vi.mocked(createServerClient).mockResolvedValue(mockServerClient as never)
      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never)

      await verifyAdmin()
      expect(createAdminClient).toHaveBeenCalled()
    })
  })
})

// ============================================================
// 3. lib/usage.ts
// ============================================================

import { incrementUsage, checkUsageLimit, checkStorageQuota } from '@/lib/usage'

describe('lib/usage.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('incrementUsage', () => {
    it('creates new tracking row when none exists', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null })
      const mockSingle = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST116' } })
      const mockAdmin = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: mockSingle,
                }),
              }),
            }),
          }),
          insert: mockInsert,
        }),
      }
      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never)

      await incrementUsage('user-1', 'invoice')
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          invoice_count: 1,
          receipt_scan_count: 0,
        }),
      )
    })

    it('updates existing row for invoice type', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'track-1', invoice_count: 3, receipt_scan_count: 1 },
      })
      const mockAdmin = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: mockSingle,
                }),
              }),
            }),
          }),
          update: mockUpdate,
        }),
      }
      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never)

      await incrementUsage('user-1', 'invoice')
      expect(mockUpdate).toHaveBeenCalledWith({ invoice_count: 4 })
    })

    it('updates existing row for receipt_scan type', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })
      const mockSingle = vi.fn().mockResolvedValue({
        data: { id: 'track-1', invoice_count: 2, receipt_scan_count: 5 },
      })
      const mockAdmin = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: mockSingle,
                }),
              }),
            }),
          }),
          update: mockUpdate,
        }),
      }
      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never)

      await incrementUsage('user-1', 'receipt_scan')
      expect(mockUpdate).toHaveBeenCalledWith({ receipt_scan_count: 6 })
    })

    it('creates new row for receipt_scan when no existing', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null })
      const mockSingle = vi.fn().mockResolvedValue({ data: null })
      const mockAdmin = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: mockSingle,
                }),
              }),
            }),
          }),
          insert: mockInsert,
        }),
      }
      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never)

      await incrementUsage('user-1', 'receipt_scan')
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice_count: 0,
          receipt_scan_count: 1,
        }),
      )
    })
  })

  // Platform config values matching what would be in the database
  const PLATFORM_CONFIG: Record<string, { key: string; value: string }[]> = {
    free: [
      { key: 'free_invoice_limit', value: '5' },
      { key: 'free_receipt_scan_limit', value: '3' },
      { key: 'free_email_send_limit', value: '2' },
      { key: 'free_storage_mb', value: '50' },
    ],
    pro: [
      { key: 'pro_invoice_limit', value: '0' },
      { key: 'pro_receipt_scan_limit', value: '0' },
      { key: 'pro_email_send_limit', value: '0' },
      { key: 'pro_storage_mb', value: '1024' },
    ],
    team: [
      { key: 'team_invoice_limit', value: '0' },
      { key: 'team_receipt_scan_limit', value: '0' },
      { key: 'team_email_send_limit', value: '0' },
      { key: 'team_storage_mb', value: '5120' },
    ],
  }

  // Resolve effective plan (inactive pro/team → free)
  function effectivePlan(plan: string, status: string) {
    if (status === 'active' && (plan === 'pro' || plan === 'team')) return plan
    return 'free'
  }

  describe('checkUsageLimit', () => {
    function buildMockAdmin(plan: string, status: string, invoiceCount: number, receiptScanCount: number) {
      const ePlan = effectivePlan(plan, status)
      return {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'subscriptions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { plan, status } }),
                }),
              }),
            }
          }
          if (table === 'platform_config') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: PLATFORM_CONFIG[ePlan] }),
              }),
            }
          }
          if (table === 'usage_tracking') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      single: vi.fn().mockResolvedValue({
                        data: { invoice_count: invoiceCount, receipt_scan_count: receiptScanCount },
                      }),
                    }),
                  }),
                }),
              }),
            }
          }
          return {}
        }),
      }
    }

    it('returns allowed=true for pro plan (unlimited)', async () => {
      vi.mocked(createAdminClient).mockReturnValue(buildMockAdmin('pro', 'active', 100, 100) as never)
      const result = await checkUsageLimit('user-1', 'invoice')
      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(Infinity)
    })

    it('returns allowed=true for free plan under limit', async () => {
      vi.mocked(createAdminClient).mockReturnValue(buildMockAdmin('free', 'active', 2, 0) as never)
      const result = await checkUsageLimit('user-1', 'invoice')
      expect(result.allowed).toBe(true)
      expect(result.current).toBe(2)
      expect(result.limit).toBe(5)
    })

    it('returns allowed=false for free plan at limit', async () => {
      vi.mocked(createAdminClient).mockReturnValue(buildMockAdmin('free', 'active', 5, 0) as never)
      const result = await checkUsageLimit('user-1', 'invoice')
      expect(result.allowed).toBe(false)
      expect(result.current).toBe(5)
    })

    it('returns allowed=true for receipt_scan under limit', async () => {
      vi.mocked(createAdminClient).mockReturnValue(buildMockAdmin('free', 'active', 0, 1) as never)
      const result = await checkUsageLimit('user-1', 'receipt_scan')
      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(3)
    })

    it('returns allowed=false for receipt_scan at limit', async () => {
      vi.mocked(createAdminClient).mockReturnValue(buildMockAdmin('free', 'active', 0, 3) as never)
      const result = await checkUsageLimit('user-1', 'receipt_scan')
      expect(result.allowed).toBe(false)
    })

    it('treats inactive pro as free plan', async () => {
      vi.mocked(createAdminClient).mockReturnValue(buildMockAdmin('pro', 'canceled', 4, 0) as never)
      const result = await checkUsageLimit('user-1', 'invoice')
      expect(result.allowed).toBe(true)
      expect(result.limit).toBe(5)
    })

    it('returns team plan as unlimited', async () => {
      vi.mocked(createAdminClient).mockReturnValue(buildMockAdmin('team', 'active', 999, 999) as never)
      const result = await checkUsageLimit('user-1', 'invoice')
      expect(result.allowed).toBe(true)
    })
  })

  describe('checkStorageQuota', () => {
    function buildStorageMock(plan: string, status: string, attSizes: number[], expSizes: number[]) {
      const ePlan = effectivePlan(plan, status)
      return {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'subscriptions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { plan, status } }),
                }),
              }),
            }
          }
          if (table === 'platform_config') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: PLATFORM_CONFIG[ePlan] }),
              }),
            }
          }
          if (table === 'gig_attachments') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: attSizes.map((s) => ({ file_size: s })),
                }),
              }),
            }
          }
          if (table === 'expenses') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  not: vi.fn().mockResolvedValue({
                    data: expSizes.map((s) => ({ file_size: s })),
                  }),
                }),
              }),
            }
          }
          return {}
        }),
      }
    }

    it('returns allowed=true when storage is under quota', async () => {
      vi.mocked(createAdminClient).mockReturnValue(buildStorageMock('free', 'active', [1000], [500]) as never)
      const result = await checkStorageQuota('user-1')
      expect(result.allowed).toBe(true)
      expect(result.usedBytes).toBe(1500)
      expect(result.plan).toBe('free')
    })

    it('returns allowed=false when over free quota (50MB)', async () => {
      const fiftyMb = 50 * 1024 * 1024
      vi.mocked(createAdminClient).mockReturnValue(buildStorageMock('free', 'active', [fiftyMb], [100]) as never)
      const result = await checkStorageQuota('user-1')
      expect(result.allowed).toBe(false)
    })

    it('pro plan has 1024MB quota', async () => {
      const fiveMb = 5 * 1024 * 1024
      vi.mocked(createAdminClient).mockReturnValue(buildStorageMock('pro', 'active', [fiveMb], [fiveMb]) as never)
      const result = await checkStorageQuota('user-1')
      expect(result.allowed).toBe(true)
      expect(result.limitBytes).toBe(1024 * 1024 * 1024)
      expect(result.plan).toBe('pro')
    })

    it('team plan has 5120MB quota', async () => {
      vi.mocked(createAdminClient).mockReturnValue(buildStorageMock('team', 'active', [1000], [1000]) as never)
      const result = await checkStorageQuota('user-1')
      expect(result.allowed).toBe(true)
      expect(result.limitBytes).toBe(5120 * 1024 * 1024)
      expect(result.plan).toBe('team')
    })

    it('sums attachments and expenses', async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildStorageMock('free', 'active', [1000, 2000, 3000], [500, 1500]) as never,
      )
      const result = await checkStorageQuota('user-1')
      expect(result.usedBytes).toBe(8000)
    })

    it('handles empty attachment/expense arrays', async () => {
      vi.mocked(createAdminClient).mockReturnValue(buildStorageMock('free', 'active', [], []) as never)
      const result = await checkStorageQuota('user-1')
      expect(result.usedBytes).toBe(0)
      expect(result.allowed).toBe(true)
    })

    it('handles null data from queries', async () => {
      const mockAdmin = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'subscriptions') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({ data: { plan: 'free', status: 'active' } }),
                }),
              }),
            }
          }
          if (table === 'platform_config') {
            return {
              select: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: PLATFORM_CONFIG.free }),
              }),
            }
          }
          if (table === 'gig_attachments') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: null }),
              }),
            }
          }
          if (table === 'expenses') {
            return {
              select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  not: vi.fn().mockResolvedValue({ data: null }),
                }),
              }),
            }
          }
          return {}
        }),
      }
      vi.mocked(createAdminClient).mockReturnValue(mockAdmin as never)
      const result = await checkStorageQuota('user-1')
      expect(result.usedBytes).toBe(0)
    })
  })
})
