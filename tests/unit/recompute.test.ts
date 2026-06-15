import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the exchange-rate fetcher so no network is hit.
const getRateServer = vi.fn()
vi.mock('@/lib/currency/exchange', () => ({
  getRateServer: (...args: unknown[]) => getRateServer(...args),
}))

import { recomputeBaseAmounts } from '@/lib/currency/recompute'

type Row = Record<string, unknown>

function makeSupabase(data: Record<string, Row[]>) {
  const updates: { table: string; id: unknown; body: Row }[] = []
  const client = {
    from(table: string) {
      return {
        select() {
          return { eq: () => Promise.resolve({ data: data[table] ?? [] }) }
        },
        update(body: Row) {
          return {
            eq: (_col: string, id: unknown) => {
              updates.push({ table, id, body })
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, updates }
}

beforeEach(() => {
  getRateServer.mockReset()
  // Default: SEK->BRL 0.5, EUR->BRL 5, otherwise throw.
  getRateServer.mockImplementation(async (from: string) => {
    if (from === 'SEK') return 0.5
    if (from === 'EUR') return 5
    throw new Error(`no rate for ${from}`)
  })
})

describe('recomputeBaseAmounts', () => {
  it('converts gigs to the base currency and leaves base-currency rows at rate 1', async () => {
    const { client, updates } = makeSupabase({
      gigs: [
        { id: 'g1', fee: 8200, travel_expense: null, currency: 'BRL', date: '2026-01-10', start_date: null },
        { id: 'g2', fee: 6000, travel_expense: 100, currency: 'SEK', date: '2026-01-10', start_date: null },
        { id: 'g3', fee: null, travel_expense: null, currency: 'BRL', date: '2026-01-10', start_date: null },
      ],
      expenses: [],
      invoices: [],
    })

    const res = await recomputeBaseAmounts(client, 'company-1', 'BRL')

    const g1 = updates.find((u) => u.id === 'g1')!.body
    expect(g1.fee_base).toBe(8200) // BRL == base => rate 1
    expect(g1.exchange_rate).toBe(1)
    expect(g1.travel_expense_base).toBeNull()

    const g2 = updates.find((u) => u.id === 'g2')!.body
    expect(g2.fee_base).toBe(3000) // 6000 * 0.5
    expect(g2.travel_expense_base).toBe(50)
    expect(g2.exchange_rate).toBe(0.5)

    const g3 = updates.find((u) => u.id === 'g3')!.body
    expect(g3.fee_base).toBeNull()

    expect(res.gigs).toBe(3)
    expect(res.base).toBe('BRL')
  })

  it('recomputes expenses and invoices', async () => {
    const { client, updates } = makeSupabase({
      gigs: [],
      expenses: [{ id: 'e1', amount: 200, currency: 'EUR', date: '2026-01-10' }],
      invoices: [{ id: 'i1', total: 1000, currency: 'SEK', invoice_date: '2026-01-10' }],
    })

    const res = await recomputeBaseAmounts(client, 'c', 'BRL')

    expect(updates.find((u) => u.table === 'expenses')!.body.amount_base).toBe(1000) // 200 * 5
    const inv = updates.find((u) => u.table === 'invoices')!.body
    expect(inv.total_base).toBe(500) // 1000 * 0.5
    expect(inv.exchange_rate).toBe(0.5)
    expect(res.expenses).toBe(1)
    expect(res.invoices).toBe(1)
  })

  it('treats a null currency as the base currency (rate 1)', async () => {
    const { client, updates } = makeSupabase({
      gigs: [{ id: 'g', fee: 500, travel_expense: null, currency: null, date: null, start_date: null }],
      expenses: [],
      invoices: [],
    })
    await recomputeBaseAmounts(client, 'c', 'BRL')
    expect(updates[0].body.fee_base).toBe(500)
    expect(updates[0].body.exchange_rate).toBe(1)
  })

  it('memoises the rate per currency+date', async () => {
    const { client } = makeSupabase({
      gigs: [
        { id: 'a', fee: 10, travel_expense: null, currency: 'SEK', date: '2026-01-10', start_date: null },
        { id: 'b', fee: 20, travel_expense: null, currency: 'SEK', date: '2026-01-10', start_date: null },
      ],
      expenses: [],
      invoices: [],
    })
    await recomputeBaseAmounts(client, 'c', 'BRL')
    expect(getRateServer).toHaveBeenCalledTimes(1)
  })

  it('skips rows whose rate lookup fails and counts them', async () => {
    const { client, updates } = makeSupabase({
      gigs: [{ id: 'g', fee: 100, travel_expense: null, currency: 'USD', date: '2026-01-10', start_date: null }],
      expenses: [],
      invoices: [],
    })
    const res = await recomputeBaseAmounts(client, 'c', 'BRL')
    expect(updates).toHaveLength(0)
    expect(res.failures).toBeGreaterThan(0)
    expect(res.gigs).toBe(0)
  })

  it('clamps future dates to today and prefers start_date', async () => {
    const { client } = makeSupabase({
      gigs: [{ id: 'g', fee: 10, travel_expense: null, currency: 'SEK', date: '2999-01-01', start_date: '2999-02-02' }],
      expenses: [],
      invoices: [],
    })
    await recomputeBaseAmounts(client, 'c', 'BRL')
    // The date passed to the rate fetcher should be clamped to today (not 2999).
    const dateArg = getRateServer.mock.calls[0][2] as string
    expect(dateArg < '2999-01-01').toBe(true)
  })
})
