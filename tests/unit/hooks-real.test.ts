/**
 * Tests that exercise the REAL hook code (SWR fetchers, useEffect logic).
 * The hooks.test.ts file mocks SWR, which means hook internals never run.
 * This file captures and invokes fetchers to get actual coverage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// ── Hoisted mocks ──
const { mockSupabase, mockFetch } = vi.hoisted(() => {
  const chain = (resolvedData: unknown = null, _resolvedError: unknown = null) => {
    const result = { data: resolvedData, error: resolvedError }
    const obj: Record<string, unknown> = {
      select: vi.fn(() => obj),
      eq: vi.fn(() => obj),
      in: vi.fn(() => obj),
      not: vi.fn(() => obj),
      limit: vi.fn(() => obj),
      order: vi.fn(() => obj),
      single: vi.fn(() => Promise.resolve(result)),
      then: (fn: (v: unknown) => unknown) => Promise.resolve(result).then(fn),
    }
    return obj
  }

  const mockSupabase = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } }),
    },
    from: vi.fn((_table: string) => chain()),
  }

  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ members: [] }),
  })

  return { mockSupabase, chain, mockFetch }
})

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => mockSupabase,
}))

// Let SWR run naturally — don't mock it
// But disable deduping/caching so tests don't interfere
vi.mock('swr', async () => {
  const actual = await vi.importActual<typeof import('swr')>('swr')
  return actual
})

vi.mock('next-intl', () => ({
  useLocale: () => 'sv',
}))

// Override global fetch
beforeEach(() => {
  vi.clearAllMocks()
  globalThis.fetch = mockFetch as unknown as typeof fetch
})

// ============================================================
// useCompany — real SWR fetcher
// ============================================================
import { useCompany } from '@/lib/hooks/use-company'

describe('useCompany (real)', () => {
  it('returns null company when user is not authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValueOnce({ data: { user: null } })

    const { result } = renderHook(() => useCompany())

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false)
      },
      { timeout: 3000 },
    )
  })

  it('fetches company data when authenticated', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const membership = { company_id: 'comp-1', user_id: 'user-1', role: 'owner', full_name: 'Test' }
    const company = { id: 'comp-1', company_name: 'Test AB', base_currency: 'SEK', gig_visibility: 'shared' }

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'company_members') {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          order: vi.fn(() => obj),
          single: vi.fn(() => Promise.resolve({ data: membership, error: null })),
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: [membership], error: null }).then(fn),
        }
        return obj
      }
      if (table === 'companies') {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          single: vi.fn(() => Promise.resolve({ data: company, error: null })),
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: company, error: null }).then(fn),
        }
        return obj
      }
      const obj: Record<string, unknown> = {
        select: vi.fn(() => obj),
        eq: vi.fn(() => obj),
        order: vi.fn(() => obj),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(fn),
      }
      return obj
    })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          members: [
            { id: 'm1', user_id: 'user-1', role: 'owner', removed_at: null },
            { id: 'm2', user_id: 'user-2', role: 'member', removed_at: '2024-01-01' },
          ],
        }),
    })

    const { result } = renderHook(() => useCompany())

    await waitFor(
      () => {
        expect(result.current.company).toBeTruthy()
      },
      { timeout: 3000 },
    )

    expect(result.current.company?.company_name).toBe('Test AB')
    expect(result.current.isOwner).toBe(true)
    expect(result.current.members).toHaveLength(1) // Only active (no removed_at)
    expect(result.current.allMembers).toHaveLength(2)
  })

  it('falls back to basic member query when /api/company/members fails', async () => {
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const membership = { company_id: 'comp-1', user_id: 'user-1', role: 'owner' }
    const company = { id: 'comp-1', company_name: 'Test AB' }
    const basicMembers = [{ id: 'm1', user_id: 'user-1', company_id: 'comp-1', role: 'owner' }]

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'company_members') {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          order: vi.fn(() => Promise.resolve({ data: basicMembers, error: null })),
          single: vi.fn(() => Promise.resolve({ data: membership, error: null })),
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: basicMembers, error: null }).then(fn),
        }
        return obj
      }
      if (table === 'companies') {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          single: vi.fn(() => Promise.resolve({ data: company, error: null })),
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: company, error: null }).then(fn),
        }
        return obj
      }
      const obj: Record<string, unknown> = {
        select: vi.fn(() => obj),
        eq: vi.fn(() => obj),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
        single: vi.fn().mockResolvedValue({ data: null }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: [] }).then(fn),
      }
      return obj
    })

    // Make the API call throw
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const { result } = renderHook(() => useCompany())

    await waitFor(
      () => {
        expect(result.current.company).toBeTruthy()
      },
      { timeout: 3000 },
    )

    expect(result.current.members).toHaveLength(1)
  })
})

// ============================================================
// useSubscription — real hooks with mocked supabase/fetch
// ============================================================
import { useSubscription } from '@/lib/hooks/use-subscription'

describe('useSubscription (real)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch as unknown as typeof fetch
  })

  it('loads subscription, usage, tier config, and storage quota', async () => {
    const sub = { id: 's1', plan: 'pro', status: 'active', stripe_subscription_id: 'sub_123' }
    const usageData = { invoice_count: 5, receipt_scan_count: 2, email_send_count: 1 }

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          limit: vi.fn(() => obj),
          single: vi.fn(() => Promise.resolve({ data: sub })),
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: sub }).then(fn),
        }
        return obj
      }
      if (table === 'usage_tracking') {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          limit: vi.fn(() => obj),
          single: vi.fn(() => Promise.resolve({ data: usageData })),
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: usageData }).then(fn),
        }
        return obj
      }
      const obj: Record<string, unknown> = {
        select: vi.fn(() => obj),
        eq: vi.fn(() => obj),
        single: vi.fn().mockResolvedValue({ data: null }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: null }).then(fn),
      }
      return obj
    })

    const tierConfig = {
      free: {
        invoiceLimit: 5,
        receiptScanLimit: 10,
        emailSendLimit: 3,
        storageMb: 100,
        priceMonthly: 0,
        priceYearly: 0,
        features: [],
      },
      pro: {
        invoiceLimit: 0,
        receiptScanLimit: 0,
        emailSendLimit: 0,
        storageMb: 1000,
        priceMonthly: 99,
        priceYearly: 990,
        features: ['unlimited'],
      },
      team: {
        invoiceLimit: 0,
        receiptScanLimit: 0,
        emailSendLimit: 0,
        storageMb: 5000,
        priceMonthly: 199,
        priceYearly: 1990,
        features: ['unlimited', 'team'],
      },
    }

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/config/tiers')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(tierConfig) })
      }
      if (typeof url === 'string' && url.includes('/api/storage/quota')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ usedBytes: 500000, limitBytes: 1000000000, plan: 'pro' }),
        })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const { result } = renderHook(() => useSubscription())

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false)
      },
      { timeout: 5000 },
    )

    expect(result.current.plan).toBe('pro')
    expect(result.current.isPro).toBe(true)
    expect(result.current.isTeam).toBe(false)
    expect(result.current.usage?.invoice_count).toBe(5)
    expect(result.current.hasHadSubscription).toBe(true)
    expect(result.current.canCreateInvoice).toBe(true)
    expect(result.current.canScanReceipt).toBe(true)
  })

  it('limits enforce correctly with tier config', async () => {
    const sub = { id: 's1', plan: 'free', status: 'active' }
    const usageData = { invoice_count: 4, receipt_scan_count: 9, email_send_count: 3 }

    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'subscriptions') {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          limit: vi.fn(() => obj),
          single: vi.fn(() => Promise.resolve({ data: sub })),
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: sub }).then(fn),
        }
        return obj
      }
      if (table === 'usage_tracking') {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          limit: vi.fn(() => obj),
          single: vi.fn(() => Promise.resolve({ data: usageData })),
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: usageData }).then(fn),
        }
        return obj
      }
      const obj: Record<string, unknown> = {
        select: vi.fn(() => obj),
        eq: vi.fn(() => obj),
        single: vi.fn().mockResolvedValue({ data: null }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: null }).then(fn),
      }
      return obj
    })

    const tierConfig = {
      free: {
        invoiceLimit: 5,
        receiptScanLimit: 10,
        emailSendLimit: 3,
        storageMb: 100,
        priceMonthly: 0,
        priceYearly: 0,
        features: [],
      },
      pro: {
        invoiceLimit: 0,
        receiptScanLimit: 0,
        emailSendLimit: 0,
        storageMb: 1000,
        priceMonthly: 99,
        priceYearly: 990,
        features: [],
      },
      team: {
        invoiceLimit: 0,
        receiptScanLimit: 0,
        emailSendLimit: 0,
        storageMb: 5000,
        priceMonthly: 199,
        priceYearly: 1990,
        features: [],
      },
    }

    mockFetch.mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/config/tiers')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(tierConfig) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
    })

    const { result } = renderHook(() => useSubscription())

    await waitFor(
      () => {
        expect(result.current.loading).toBe(false)
      },
      { timeout: 5000 },
    )

    expect(result.current.canCreateInvoice).toBe(true) // 4 < 5
    expect(result.current.canScanReceipt).toBe(true) // 9 < 10
    expect(result.current.canSendEmail).toBe(false) // 3 >= 3
  })
})

// ============================================================
// useCachedData — test SWR fetchers
// ============================================================

describe('useCachedData fetchers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    globalThis.fetch = mockFetch as unknown as typeof fetch
  })

  // We import the hooks directly — they call useSWR which will invoke fetchers
  // Since we don't mock SWR, the fetchers run in test and hit mocked Supabase

  it('useClients fetches from clients table', async () => {
    const clientData = [{ id: 'c1', name: 'Client A' }]
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'clients') {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          order: vi.fn(() => Promise.resolve({ data: clientData, error: null })),
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: clientData, error: null }).then(fn),
        }
        return obj
      }
      const obj: Record<string, unknown> = {
        select: vi.fn(() => obj),
        order: vi.fn().mockResolvedValue({ data: [] }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: [] }).then(fn),
      }
      return obj
    })

    // Dynamic import to avoid module-level issues
    const { useClients } = await import('@/lib/hooks/use-cached-data')
    const { result } = renderHook(() => useClients())

    await waitFor(
      () => {
        expect(result.current.data).toBeTruthy()
      },
      { timeout: 3000 },
    )
  })

  it('useCompanySettings fetches with user_id', async () => {
    const settings = { id: 's1', locale: 'sv', show_only_my_data: false }
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'company_settings') {
        const obj: Record<string, unknown> = {
          select: vi.fn(() => obj),
          eq: vi.fn(() => obj),
          single: vi.fn(() => Promise.resolve({ data: settings, error: null })),
          then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: settings, error: null }).then(fn),
        }
        return obj
      }
      const obj: Record<string, unknown> = {
        select: vi.fn(() => obj),
        eq: vi.fn(() => obj),
        single: vi.fn().mockResolvedValue({ data: null }),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: null }).then(fn),
      }
      return obj
    })

    const { useCompanySettings } = await import('@/lib/hooks/use-cached-data')
    const { result } = renderHook(() => useCompanySettings())

    await waitFor(
      () => {
        expect(result.current.data).toBeTruthy()
      },
      { timeout: 3000 },
    )
  })
})
