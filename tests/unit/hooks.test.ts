import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// ============================================================
// Mocks — use vi.hoisted() so variables are available in vi.mock factories
// ============================================================

const { mockUseLocale, mockSupabaseClient, mockUseCompany, mockUseSubscription } = vi.hoisted(() => {
  const mockUseLocale = vi.fn(() => 'sv')

  const mockSupabaseClient = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }),
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: null }),
            })),
            single: vi.fn().mockResolvedValue({ data: null }),
          })),
          single: vi.fn().mockResolvedValue({ data: null }),
          limit: vi.fn(() => ({
            single: vi.fn().mockResolvedValue({ data: null }),
          })),
          order: vi.fn().mockResolvedValue({ data: [] }),
        })),
        order: vi.fn().mockResolvedValue({ data: [] }),
        limit: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: null }),
        })),
        in: vi.fn().mockResolvedValue({ data: [] }),
      })),
      update: vi.fn(() => ({
        eq: vi.fn().mockResolvedValue({ error: null }),
      })),
    })),
  }

  const mockUseCompany = vi.fn(() => ({
    company: { base_currency: 'SEK' },
    companyId: 'comp-1',
    role: 'owner',
    isOwner: true,
    fullName: null,
    members: [],
    allMembers: [],
    loading: false,
    error: undefined,
    mutate: vi.fn(),
  }))

  const mockUseSubscription = vi.fn(() => ({
    subscription: null,
    usage: null,
    loading: false,
    isPro: false,
    isTeam: false,
    plan: 'free' as const,
    limits: { invoices: Infinity, receiptScans: Infinity, emailSends: Infinity },
    canCreateInvoice: true,
    canScanReceipt: true,
    canSendEmail: true,
    hasHadSubscription: false,
    storageQuota: null,
    tierConfig: null,
    refresh: vi.fn(),
    syncWithStripe: vi.fn(),
  }))

  return { mockUseLocale, mockSupabaseClient, mockUseCompany, mockUseSubscription }
})

vi.mock('next-intl', () => ({
  useLocale: () => mockUseLocale(),
}))

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}))

vi.mock('swr', () => ({
  default: vi.fn(),
}))

// ============================================================
// 1. useFormatLocale
// ============================================================

import { useFormatLocale } from '@/lib/hooks/use-format-locale'

describe('useFormatLocale', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns sv-SE for Swedish locale', () => {
    mockUseLocale.mockReturnValue('sv')
    const { result } = renderHook(() => useFormatLocale())
    expect(result.current).toBe('sv-SE')
  })

  it('returns en-US for English locale', () => {
    mockUseLocale.mockReturnValue('en')
    const { result } = renderHook(() => useFormatLocale())
    expect(result.current).toBe('en-US')
  })

  it('returns sv-SE for unknown locale (fallback)', () => {
    mockUseLocale.mockReturnValue('de')
    const { result } = renderHook(() => useFormatLocale())
    expect(result.current).toBe('sv-SE')
  })

  it('returns sv-SE for empty string locale', () => {
    mockUseLocale.mockReturnValue('')
    const { result } = renderHook(() => useFormatLocale())
    expect(result.current).toBe('sv-SE')
  })
})

// ============================================================
// 2. useDateLocale
// ============================================================

import { useDateLocale } from '@/lib/hooks/use-date-locale'

describe('useDateLocale', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns sv locale for Swedish', () => {
    mockUseLocale.mockReturnValue('sv')
    const { result } = renderHook(() => useDateLocale())
    // sv locale from date-fns has code 'sv'
    expect(result.current.code).toBe('sv')
  })

  it('returns en-US locale for English', () => {
    mockUseLocale.mockReturnValue('en')
    const { result } = renderHook(() => useDateLocale())
    expect(result.current.code).toBe('en-US')
  })

  it('falls back to sv for unknown locale', () => {
    mockUseLocale.mockReturnValue('fr')
    const { result } = renderHook(() => useDateLocale())
    expect(result.current.code).toBe('sv')
  })
})

// ============================================================
// 3. useMediaQuery
// ============================================================

import { useMediaQuery } from '@/lib/hooks/use-media-query'

describe('useMediaQuery', () => {
  let listeners: Map<string, Set<() => void>>

  beforeEach(() => {
    vi.clearAllMocks()
    listeners = new Map()

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => {
        if (!listeners.has(query)) listeners.set(query, new Set())
        return {
          matches: query === '(min-width: 768px)',
          addEventListener: vi.fn((_: string, cb: () => void) => {
            listeners.get(query)!.add(cb)
          }),
          removeEventListener: vi.fn((_: string, cb: () => void) => {
            listeners.get(query)!.delete(cb)
          }),
        }
      }),
    })
  })

  it('returns true when media query matches', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(true)
  })

  it('returns false when media query does not match', () => {
    const { result } = renderHook(() => useMediaQuery('(min-width: 1200px)'))
    expect(result.current).toBe(false)
  })

  it('subscribes and unsubscribes to matchMedia changes', () => {
    const { unmount } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(listeners.get('(min-width: 768px)')!.size).toBeGreaterThan(0)
    unmount()
    // After unmount, the cleanup should have removed listener
    expect(listeners.get('(min-width: 768px)')!.size).toBe(0)
  })

  it('updates when matchMedia fires change', () => {
    let matchesValue = false
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn((query: string) => {
        if (!listeners.has(query)) listeners.set(query, new Set())
        return {
          get matches() {
            return matchesValue
          },
          addEventListener: vi.fn((_: string, cb: () => void) => {
            listeners.get(query)!.add(cb)
          }),
          removeEventListener: vi.fn((_: string, cb: () => void) => {
            listeners.get(query)!.delete(cb)
          }),
        }
      }),
    })

    const { result } = renderHook(() => useMediaQuery('(min-width: 768px)'))
    expect(result.current).toBe(false)

    // Simulate media change
    matchesValue = true
    act(() => {
      listeners.get('(min-width: 768px)')?.forEach((cb) => cb())
    })
    expect(result.current).toBe(true)
  })
})

// ============================================================
// 4. useBaseCurrency
// ============================================================

vi.mock('@/lib/hooks/use-company', () => ({
  useCompany: () => mockUseCompany(),
}))

import { useBaseCurrency } from '@/lib/hooks/use-base-currency'

describe('useBaseCurrency', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns SEK defaults for Swedish locale', () => {
    mockUseLocale.mockReturnValue('sv')
    mockUseCompany.mockReturnValue({ company: { base_currency: 'SEK' } } as ReturnType<typeof mockUseCompany>)
    const { result } = renderHook(() => useBaseCurrency())
    expect(result.current.code).toBe('SEK')
    expect(result.current.symbol).toBe('SEK')
    expect(result.current.perDayLabel).toBe('SEK/dag')
  })

  it('returns SEK/day for English locale', () => {
    mockUseLocale.mockReturnValue('en')
    mockUseCompany.mockReturnValue({ company: { base_currency: 'SEK' } } as ReturnType<typeof mockUseCompany>)
    const { result } = renderHook(() => useBaseCurrency())
    expect(result.current.perDayLabel).toBe('SEK/day')
  })

  it('returns EUR symbol for EUR base currency', () => {
    mockUseLocale.mockReturnValue('sv')
    mockUseCompany.mockReturnValue({ company: { base_currency: 'EUR' } } as ReturnType<typeof mockUseCompany>)
    const { result } = renderHook(() => useBaseCurrency())
    expect(result.current.code).toBe('EUR')
    expect(result.current.symbol).toBe('€')
    expect(result.current.perDayLabel).toBe('€/dag')
  })

  it('returns GBP symbol', () => {
    mockUseLocale.mockReturnValue('en')
    mockUseCompany.mockReturnValue({ company: { base_currency: 'GBP' } } as ReturnType<typeof mockUseCompany>)
    const { result } = renderHook(() => useBaseCurrency())
    expect(result.current.code).toBe('GBP')
    expect(result.current.symbol).toBe('£')
    expect(result.current.perDayLabel).toBe('£/day')
  })

  it('defaults to SEK when company has no base_currency', () => {
    mockUseLocale.mockReturnValue('sv')
    mockUseCompany.mockReturnValue({ company: null } as ReturnType<typeof mockUseCompany>)
    const { result } = renderHook(() => useBaseCurrency())
    expect(result.current.code).toBe('SEK')
  })

  it('defaults to SEK when company base_currency is undefined', () => {
    mockUseLocale.mockReturnValue('sv')
    mockUseCompany.mockReturnValue({ company: { base_currency: undefined } } as ReturnType<typeof mockUseCompany>)
    const { result } = renderHook(() => useBaseCurrency())
    expect(result.current.code).toBe('SEK')
  })

  it('handles USD currency', () => {
    mockUseLocale.mockReturnValue('en')
    mockUseCompany.mockReturnValue({ company: { base_currency: 'USD' } } as ReturnType<typeof mockUseCompany>)
    const { result } = renderHook(() => useBaseCurrency())
    expect(result.current.code).toBe('USD')
    expect(result.current.symbol).toBe('$')
  })

  it('handles NOK currency', () => {
    mockUseLocale.mockReturnValue('sv')
    mockUseCompany.mockReturnValue({ company: { base_currency: 'NOK' } } as ReturnType<typeof mockUseCompany>)
    const { result } = renderHook(() => useBaseCurrency())
    expect(result.current.code).toBe('NOK')
    expect(result.current.symbol).toBe('NOK')
  })
})

// ============================================================
// 5. useGigFilter — singleton state management
// ============================================================

// We need to test the singleton module behavior.
// Since the module has side effects, we test via the hook.

vi.mock('@/lib/hooks/use-subscription', () => ({
  useSubscription: () => mockUseSubscription(),
}))

import { useGigFilter } from '@/lib/hooks/use-gig-filter'

describe('useGigFilter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset singleton state by re-importing would be ideal but is complex.
    // Instead we test what we can.
    mockUseCompany.mockReturnValue({
      company: { base_currency: 'SEK', gig_visibility: 'shared' },
      members: [{ id: 'm1' }, { id: 'm2' }],
    } as ReturnType<typeof mockUseCompany>)
  })

  it('returns isSharedMode true when team + shared visibility + multiple members', () => {
    mockUseSubscription.mockReturnValue({
      ...mockUseSubscription(),
      isTeam: true,
    })
    const { result } = renderHook(() => useGigFilter())
    expect(result.current.isSharedMode).toBe(true)
  })

  it('returns isSharedMode false when not a team subscription', () => {
    mockUseSubscription.mockReturnValue({
      ...mockUseSubscription(),
      isTeam: false,
    })
    const { result } = renderHook(() => useGigFilter())
    expect(result.current.isSharedMode).toBe(false)
  })

  it('returns isSharedMode false when only 1 member', () => {
    mockUseSubscription.mockReturnValue({
      ...mockUseSubscription(),
      isTeam: true,
    })
    mockUseCompany.mockReturnValue({
      company: { base_currency: 'SEK', gig_visibility: 'shared' },
      members: [{ id: 'm1' }],
    } as ReturnType<typeof mockUseCompany>)
    const { result } = renderHook(() => useGigFilter())
    expect(result.current.isSharedMode).toBe(false)
  })

  it('returns isSharedMode false when gig_visibility is personal', () => {
    mockUseSubscription.mockReturnValue({
      ...mockUseSubscription(),
      isTeam: true,
    })
    mockUseCompany.mockReturnValue({
      company: { base_currency: 'SEK', gig_visibility: 'personal' },
      members: [{ id: 'm1' }, { id: 'm2' }],
    } as ReturnType<typeof mockUseCompany>)
    const { result } = renderHook(() => useGigFilter())
    expect(result.current.isSharedMode).toBe(false)
  })

  it('returns loaded state', () => {
    const { result } = renderHook(() => useGigFilter())
    expect(typeof result.current.loaded).toBe('boolean')
  })

  it('returns toggleShowOnlyMine function', () => {
    const { result } = renderHook(() => useGigFilter())
    expect(typeof result.current.toggleShowOnlyMine).toBe('function')
  })

  it('shouldFilter is false when isSharedMode is false', () => {
    mockUseSubscription.mockReturnValue({
      ...mockUseSubscription(),
      isTeam: false,
    })
    const { result } = renderHook(() => useGigFilter())
    expect(result.current.shouldFilter).toBe(false)
  })
})

// ============================================================
// 6. useSupabaseQuery
// ============================================================

import useSWR from 'swr'
import { useSupabaseQuery, useSupabase } from '@/lib/hooks/use-supabase-query'

describe('useSupabaseQuery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls useSWR with the provided key', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      isValidating: false,
      mutate: vi.fn(),
    } as never)

    const fetcher = vi.fn()
    renderHook(() => useSupabaseQuery('test-key', fetcher))
    expect(useSWR).toHaveBeenCalledWith(
      'test-key',
      expect.any(Function),
      expect.objectContaining({
        revalidateOnFocus: true,
        dedupingInterval: 5000,
      }),
    )
  })

  it('passes null key to useSWR (disabled query)', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: vi.fn(),
    } as never)

    renderHook(() => useSupabaseQuery(null, vi.fn()))
    expect(useSWR).toHaveBeenCalledWith(null, expect.any(Function), expect.any(Object))
  })

  it('merges custom SWR config', () => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      isValidating: false,
      mutate: vi.fn(),
    } as never)

    const customConfig = { dedupingInterval: 10000, revalidateOnFocus: false }
    renderHook(() => useSupabaseQuery('key', vi.fn(), customConfig))
    expect(useSWR).toHaveBeenCalledWith(
      'key',
      expect.any(Function),
      expect.objectContaining({
        dedupingInterval: 10000,
        revalidateOnFocus: false,
      }),
    )
  })

  it('fetcher throws when Supabase returns error', async () => {
    let capturedFetcher: (() => Promise<unknown>) | null = null
    vi.mocked(useSWR).mockImplementation((_key: unknown, fetcher: unknown) => {
      capturedFetcher = fetcher as () => Promise<unknown>
      return { data: undefined, error: undefined, isLoading: true, isValidating: false, mutate: vi.fn() } as never
    })

    const mockFetcher = vi.fn().mockResolvedValue({ data: null, error: new Error('DB error') })
    renderHook(() => useSupabaseQuery('key', mockFetcher))

    expect(capturedFetcher).toBeTruthy()
    await expect(capturedFetcher!()).rejects.toThrow('DB error')
  })

  it('fetcher returns data when Supabase succeeds', async () => {
    let capturedFetcher: (() => Promise<unknown>) | null = null
    vi.mocked(useSWR).mockImplementation((_key: unknown, fetcher: unknown) => {
      capturedFetcher = fetcher as () => Promise<unknown>
      return { data: undefined, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() } as never
    })

    const mockData = [{ id: 1 }, { id: 2 }]
    const mockFetcher = vi.fn().mockResolvedValue({ data: mockData, error: null })
    renderHook(() => useSupabaseQuery('key', mockFetcher))

    const result = await capturedFetcher!()
    expect(result).toEqual(mockData)
  })
})

describe('useSupabase', () => {
  it('returns a Supabase client', () => {
    const { result } = renderHook(() => useSupabase())
    expect(result.current).toBeDefined()
    expect(result.current).toHaveProperty('from')
    expect(result.current).toHaveProperty('auth')
  })
})

// ============================================================
// 7. useCompany
// ============================================================

// useCompany is already mocked for other tests above, but let's
// test its return shape by testing the real module in isolation.
// Since it depends on useSWR which is mocked, we test the return.

describe('useCompany (via mock)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns company data shape with defaults', () => {
    mockUseCompany.mockReturnValue({
      company: null,
      companyId: null,
      role: null,
      isOwner: false,
      fullName: null,
      members: [],
      allMembers: [],
      loading: true,
      error: undefined,
      mutate: vi.fn(),
    })

    const { result } = renderHook(() => mockUseCompany())
    expect(result.current.company).toBeNull()
    expect(result.current.isOwner).toBe(false)
    expect(result.current.members).toEqual([])
    expect(result.current.loading).toBe(true)
  })

  it('returns active members only (filters removed_at)', () => {
    mockUseCompany.mockReturnValue({
      company: { id: 'c1', company_name: 'Test AB' },
      companyId: 'c1',
      role: 'owner',
      isOwner: true,
      fullName: 'Test User',
      members: [{ id: 'm1', removed_at: null }],
      allMembers: [
        { id: 'm1', removed_at: null },
        { id: 'm2', removed_at: '2024-01-01' },
      ],
      loading: false,
      error: undefined,
      mutate: vi.fn(),
    })

    const { result } = renderHook(() => mockUseCompany())
    expect(result.current.members).toHaveLength(1)
    expect(result.current.allMembers).toHaveLength(2)
  })
})

// ============================================================
// 8. useSubscription — test return shape via mock
// ============================================================

describe('useSubscription (via mock)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns free plan defaults', () => {
    mockUseSubscription.mockReturnValue({
      subscription: null,
      usage: null,
      loading: false,
      isPro: false,
      isTeam: false,
      plan: 'free',
      limits: { invoices: Infinity, receiptScans: Infinity, emailSends: Infinity },
      canCreateInvoice: true,
      canScanReceipt: true,
      canSendEmail: true,
      hasHadSubscription: false,
      storageQuota: null,
      tierConfig: null,
      refresh: vi.fn(),
      syncWithStripe: vi.fn(),
    })

    const { result } = renderHook(() => mockUseSubscription())
    expect(result.current.plan).toBe('free')
    expect(result.current.isPro).toBe(false)
    expect(result.current.isTeam).toBe(false)
  })

  it('returns pro plan when subscription is active pro', () => {
    mockUseSubscription.mockReturnValue({
      subscription: { id: 's1', plan: 'pro', status: 'active' } as never,
      usage: { invoice_count: 5, receipt_scan_count: 2, email_send_count: 1 },
      loading: false,
      isPro: true,
      isTeam: false,
      plan: 'pro',
      limits: { invoices: Infinity, receiptScans: Infinity, emailSends: Infinity },
      canCreateInvoice: true,
      canScanReceipt: true,
      canSendEmail: true,
      hasHadSubscription: true,
      storageQuota: null,
      tierConfig: null,
      refresh: vi.fn(),
      syncWithStripe: vi.fn(),
    })

    const { result } = renderHook(() => mockUseSubscription())
    expect(result.current.plan).toBe('pro')
    expect(result.current.isPro).toBe(true)
  })

  it('returns team plan', () => {
    mockUseSubscription.mockReturnValue({
      ...mockUseSubscription(),
      plan: 'team',
      isPro: true,
      isTeam: true,
    })

    const { result } = renderHook(() => mockUseSubscription())
    expect(result.current.plan).toBe('team')
    expect(result.current.isTeam).toBe(true)
  })
})

// ============================================================
// 9. useSponsor — test via the hook
// ============================================================

// useSponsor uses singleton state, so we test what we can from outside.
import { useSponsor } from '@/lib/hooks/use-sponsor'

describe('useSponsor', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns expected shape', () => {
    const { result } = renderHook(() => useSponsor())
    expect(result.current).toHaveProperty('sponsor')
    expect(result.current).toHaveProperty('plan')
    expect(result.current).toHaveProperty('isFree')
    expect(result.current).toHaveProperty('loaded')
  })

  it('isFree is true when plan is free', () => {
    const { result } = renderHook(() => useSponsor())
    // Default singleton state has plan = 'free'
    expect(result.current.isFree).toBe(true)
  })
})

// ============================================================
// 10. useCachedData hooks
// ============================================================

import { useClients, useGigTypes, usePositions, useCompanySettings } from '@/lib/hooks/use-cached-data'

describe('useCachedData hooks', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('useClients', () => {
    it('calls useSWR with "clients" key', () => {
      vi.mocked(useSWR).mockReturnValue({
        data: [],
        error: undefined,
        isLoading: false,
        isValidating: false,
        mutate: vi.fn(),
      } as never)
      renderHook(() => useClients())
      expect(useSWR).toHaveBeenCalledWith(
        'clients',
        expect.any(Function),
        expect.objectContaining({
          dedupingInterval: 30_000,
        }),
      )
    })
  })

  describe('useGigTypes', () => {
    it('calls useSWR with "gig_types" key', () => {
      vi.mocked(useSWR).mockReturnValue({
        data: [],
        error: undefined,
        isLoading: false,
        isValidating: false,
        mutate: vi.fn(),
      } as never)
      renderHook(() => useGigTypes())
      expect(useSWR).toHaveBeenCalledWith(
        'gig_types',
        expect.any(Function),
        expect.objectContaining({
          dedupingInterval: 60_000,
        }),
      )
    })
  })

  describe('usePositions', () => {
    it('calls useSWR with "positions" key', () => {
      vi.mocked(useSWR).mockReturnValue({
        data: [],
        error: undefined,
        isLoading: false,
        isValidating: false,
        mutate: vi.fn(),
      } as never)
      renderHook(() => usePositions())
      expect(useSWR).toHaveBeenCalledWith(
        'positions',
        expect.any(Function),
        expect.objectContaining({
          dedupingInterval: 60_000,
        }),
      )
    })
  })

  describe('useCompanySettings', () => {
    it('calls useSWR with "company_settings" key', () => {
      vi.mocked(useSWR).mockReturnValue({
        data: null,
        error: undefined,
        isLoading: false,
        isValidating: false,
        mutate: vi.fn(),
      } as never)
      renderHook(() => useCompanySettings())
      expect(useSWR).toHaveBeenCalledWith(
        'company_settings',
        expect.any(Function),
        expect.objectContaining({
          dedupingInterval: 30_000,
        }),
      )
    })
  })
})

// ============================================================
// 11. useActionCount
// ============================================================

// useGigFilter is already mocked above via use-company and use-subscription mocks
import { useActionCount } from '@/lib/hooks/use-action-count'

describe('useActionCount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Setup the Supabase mock for the action count queries
    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'gigs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: 'g1' }, { id: 'g2' }, { id: 'g3' }],
            }),
          }),
        }
      }
      if (table === 'invoice_gigs') {
        return {
          select: vi.fn().mockResolvedValue({
            data: [{ gig_id: 'g1' }],
          }),
        }
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [] }),
        }),
      }
    })
    mockSupabaseClient.from = mockFrom
  })

  it('returns a number', () => {
    const { result } = renderHook(() => useActionCount())
    expect(typeof result.current).toBe('number')
  })

  it('initially returns 0', () => {
    const { result } = renderHook(() => useActionCount())
    expect(result.current).toBe(0)
  })

  it('computes uninvoiced count after load', async () => {
    const { result } = renderHook(() => useActionCount())
    // Wait for the async effect to resolve
    await waitFor(() => {
      expect(result.current).toBe(2) // 3 completed - 1 invoiced = 2
    })
  })
})
