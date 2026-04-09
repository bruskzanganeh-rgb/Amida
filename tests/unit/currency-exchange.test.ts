import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — declared before imports
// ---------------------------------------------------------------------------

/**
 * Build a chainable mock object that mimics Supabase query builder.
 * Every method returns itself so any chain works, except `single()`
 * and `upsert()` which resolve to the configured values.
 */
function createChainMock(singleResult: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  const singleFn = vi.fn().mockResolvedValue(singleResult)
  const upsertFn = vi.fn().mockResolvedValue({ error: null })

  const methods = ['select', 'eq', 'lte', 'order', 'limit']
  for (const method of methods) {
    chain[method] = vi.fn().mockReturnValue(chain)
  }
  chain.single = singleFn
  chain.upsert = upsertFn

  return { chain, singleFn, upsertFn }
}

const mockFrom = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: mockFrom,
  }),
}))

// Mock global fetch for API calls
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
  formatCurrency,
  getRate,
  convert,
  getRateServer,
} from '@/lib/currency/exchange'

// ---------------------------------------------------------------------------
// 1. Constants
// ---------------------------------------------------------------------------
describe('SUPPORTED_CURRENCIES', () => {
  it('contains exactly the expected currencies', () => {
    expect(SUPPORTED_CURRENCIES).toEqual(['SEK', 'EUR', 'USD', 'DKK', 'NOK', 'GBP', 'CHF', 'CZK', 'PLN'])
  })

  it('has 9 currencies', () => {
    expect(SUPPORTED_CURRENCIES).toHaveLength(9)
  })
})

describe('CURRENCY_SYMBOLS', () => {
  it('maps SEK to ISO code (disambiguated from NOK/DKK)', () => {
    expect(CURRENCY_SYMBOLS.SEK).toBe('SEK')
  })

  it('maps EUR to euro sign', () => {
    expect(CURRENCY_SYMBOLS.EUR).toBe('€')
  })

  it('maps USD to dollar sign', () => {
    expect(CURRENCY_SYMBOLS.USD).toBe('$')
  })

  it('maps GBP to pound sign', () => {
    expect(CURRENCY_SYMBOLS.GBP).toBe('£')
  })

  it('maps CHF to CHF', () => {
    expect(CURRENCY_SYMBOLS.CHF).toBe('CHF')
  })

  it('maps CZK to Kc with hacek', () => {
    expect(CURRENCY_SYMBOLS.CZK).toBe('Kč')
  })

  it('maps PLN to zloty sign', () => {
    expect(CURRENCY_SYMBOLS.PLN).toBe('zł')
  })

  it('has an entry for every supported currency', () => {
    for (const curr of SUPPORTED_CURRENCIES) {
      expect(CURRENCY_SYMBOLS[curr]).toBeDefined()
    }
  })
})

// ---------------------------------------------------------------------------
// 2. formatCurrency — pure function
// ---------------------------------------------------------------------------
describe('formatCurrency', () => {
  it('puts ISO code after amount for SEK (not "kr" to avoid Nordic ambiguity)', () => {
    const result = formatCurrency(1500, 'SEK')
    expect(result).toContain('SEK')
    expect(result).toMatch(/\d.*SEK$/)
  })

  it('puts symbol before amount for EUR', () => {
    const result = formatCurrency(99.5, 'EUR')
    expect(result).toMatch(/^€/)
  })

  it('puts symbol before amount for USD', () => {
    const result = formatCurrency(42, 'USD')
    expect(result).toMatch(/^\$/)
  })

  it('puts symbol before amount for GBP', () => {
    const result = formatCurrency(100, 'GBP')
    expect(result).toMatch(/^£/)
  })

  it('puts symbol after amount for DKK (uses ISO code, not "kr")', () => {
    const result = formatCurrency(200, 'DKK')
    expect(result).toMatch(/DKK$/)
  })

  it('puts symbol after amount for NOK (uses ISO code, not "kr")', () => {
    const result = formatCurrency(300, 'NOK')
    expect(result).toMatch(/NOK$/)
  })

  it('puts symbol after amount for CHF', () => {
    const result = formatCurrency(50, 'CHF')
    expect(result).toMatch(/CHF$/)
  })

  it('puts symbol after amount for CZK', () => {
    const result = formatCurrency(1000, 'CZK')
    expect(result).toMatch(/Kč$/)
  })

  it('puts symbol after amount for PLN', () => {
    const result = formatCurrency(75, 'PLN')
    expect(result).toMatch(/zł$/)
  })

  it('formats with up to 2 decimal places', () => {
    const result = formatCurrency(99.99, 'SEK')
    expect(result).toContain('99,99')
  })

  it('omits unnecessary decimal places for whole numbers', () => {
    const result = formatCurrency(100, 'SEK')
    // Should not contain ".00" or ",00"
    expect(result).not.toMatch(/[.,]00/)
  })

  it('uses sv-SE locale by default (comma as decimal separator)', () => {
    const result = formatCurrency(1234.5, 'SEK')
    expect(result).toContain('1')
    expect(result).toContain('234')
  })

  it('accepts a custom locale', () => {
    const result = formatCurrency(1234.5, 'USD', 'en-US')
    expect(result).toMatch(/^\$1,234\.5$/)
  })
})

// ---------------------------------------------------------------------------
// 3. getRate — with Supabase + fetch mocks
// ---------------------------------------------------------------------------
describe('getRate', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockFetch.mockReset()
  })

  it('returns 1.0 when from and to are the same currency', async () => {
    const rate = await getRate('SEK', 'SEK', '2025-01-01')
    expect(rate).toBe(1.0)
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('returns cached rate from database when available', async () => {
    const { chain } = createChainMock({ data: { rate: 11.25 }, error: null })
    mockFrom.mockReturnValue(chain)

    const rate = await getRate('EUR', 'SEK', '2025-03-15')
    expect(rate).toBe(11.25)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches from API and caches when not in database', async () => {
    // Cache miss, then upsert
    const { chain } = createChainMock({ data: null, error: { code: 'PGRST116' } })
    mockFrom.mockReturnValue(chain)

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ rate: 11.5 }),
    })

    const rate = await getRate('EUR', 'SEK', '2025-03-15')
    expect(rate).toBe(11.5)
    // Client-side now calls our proxy route instead of Frankfurter directly
    expect(mockFetch).toHaveBeenCalledWith('/api/exchange-rate?from=EUR&to=SEK&date=2025-03-15')
  })

  it('falls back to closest historical rate when API fails', async () => {
    // First from() call → cache miss; second from() call → fallback hit
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return createChainMock({ data: null, error: { code: 'PGRST116' } }).chain
      }
      // Fallback query returns a rate
      return createChainMock({ data: { rate: 11.0 }, error: null }).chain
    })

    mockFetch.mockResolvedValue({
      ok: false,
      statusText: 'Service Unavailable',
    })

    const rate = await getRate('EUR', 'SEK', '2025-03-15')
    expect(rate).toBe(11.0)
  })

  it('throws when API fails and no fallback rate exists', async () => {
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return createChainMock({ data: null, error: { code: 'PGRST116' } }).chain
      }
      // Fallback also returns nothing
      return createChainMock({ data: null, error: null }).chain
    })

    mockFetch.mockResolvedValue({
      ok: false,
      statusText: 'Service Unavailable',
    })

    await expect(getRate('EUR', 'SEK', '2025-03-15')).rejects.toThrow(
      'No exchange rate available for EUR\u2192SEK on 2025-03-15',
    )
  })
})

// ---------------------------------------------------------------------------
// 4. convert
// ---------------------------------------------------------------------------
describe('convert', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockFetch.mockReset()
  })

  it('returns amount unchanged when converting same currency', async () => {
    const result = await convert(100, 'SEK', 'SEK', '2025-01-01')
    expect(result.converted).toBe(100)
    expect(result.rate).toBe(1.0)
  })

  it('multiplies amount by rate and rounds to 2 decimals', async () => {
    const { chain } = createChainMock({ data: { rate: 11.253 }, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await convert(100, 'EUR', 'SEK', '2025-03-15')
    expect(result.converted).toBe(1125.3)
    expect(result.rate).toBe(11.253)
  })

  it('rounds correctly for fractional amounts', async () => {
    const { chain } = createChainMock({ data: { rate: 11.2567 }, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await convert(33.33, 'EUR', 'SEK', '2025-03-15')
    const expected = Math.round(33.33 * 11.2567 * 100) / 100
    expect(result.converted).toBe(expected)
  })

  it('returns the rate used for the conversion', async () => {
    const { chain } = createChainMock({ data: { rate: 0.089 }, error: null })
    mockFrom.mockReturnValue(chain)

    const result = await convert(1000, 'SEK', 'EUR', '2025-03-15')
    expect(result.rate).toBe(0.089)
  })
})

// ---------------------------------------------------------------------------
// 5. getRateServer
// ---------------------------------------------------------------------------
describe('getRateServer', () => {
  beforeEach(() => {
    mockFrom.mockReset()
    mockFetch.mockReset()
  })

  it('returns 1.0 when from and to are the same currency', async () => {
    const rate = await getRateServer('USD', 'USD', '2025-01-01')
    expect(rate).toBe(1.0)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('fetches directly from Frankfurter API', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ rates: { SEK: 10.8 } }),
    })

    const rate = await getRateServer('EUR', 'SEK', '2025-06-01')
    expect(rate).toBe(10.8)
    expect(mockFetch).toHaveBeenCalledWith('https://api.frankfurter.app/2025-06-01?from=EUR&to=SEK')
  })

  it('throws when API returns an error', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      statusText: 'Not Found',
    })

    await expect(getRateServer('EUR', 'SEK', '1900-01-01')).rejects.toThrow('Failed to fetch exchange rate: Not Found')
  })
})
