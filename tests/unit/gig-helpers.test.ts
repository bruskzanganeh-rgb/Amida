import { describe, it, expect } from 'vitest'
import { sortGigs, formatGigDates, gigHasPassed, type Gig } from '@/lib/gigs/gig-helpers'
import { enUS } from 'date-fns/locale'

function gig(overrides: Partial<Gig>): Gig {
  return {
    id: 'g1',
    date: '2026-06-01',
    start_date: '2026-06-01',
    end_date: '2026-06-01',
    total_days: 1,
    venue: null,
    fee: 0,
    travel_expense: null,
    project_name: null,
    status: 'accepted',
    notes: null,
    response_deadline: null,
    client_id: null,
    gig_type_id: 't1',
    position_id: null,
    currency: null,
    fee_base: null,
    user_id: 'u1',
    client: null,
    gig_type: { name: 'Konsert', vat_rate: 25, color: null },
    position: null,
    gig_dates: [],
    ...overrides,
  }
}

describe('sortGigs', () => {
  it('sorts by date ascending and descending', () => {
    const a = gig({ id: 'a', date: '2026-01-01' })
    const b = gig({ id: 'b', date: '2026-03-01' })
    expect(sortGigs([b, a], { column: 'date', direction: 'asc' }).map((g) => g.id)).toEqual(['a', 'b'])
    expect(sortGigs([a, b], { column: 'date', direction: 'desc' }).map((g) => g.id)).toEqual(['b', 'a'])
  })

  it('sorts by fee', () => {
    const a = gig({ id: 'a', fee: 100 })
    const b = gig({ id: 'b', fee: 500 })
    expect(sortGigs([a, b], { column: 'fee', direction: 'desc' }).map((g) => g.id)).toEqual(['b', 'a'])
  })

  it('does not mutate the input array', () => {
    const arr = [gig({ id: 'a', date: '2026-02-01' }), gig({ id: 'b', date: '2026-01-01' })]
    const copy = [...arr]
    sortGigs(arr, { column: 'date', direction: 'asc' })
    expect(arr).toEqual(copy)
  })
})

describe('formatGigDates', () => {
  it('formats a single day', () => {
    expect(formatGigDates(gig({ total_days: 1, date: '2026-06-01' }), enUS)).toContain('2026')
  })

  it('formats a multi-day range', () => {
    const out = formatGigDates(gig({ total_days: 3, start_date: '2026-06-01', end_date: '2026-06-03' }), enUS)
    expect(out).toContain('-')
  })
})

describe('gigHasPassed', () => {
  it('is true for a past date and false for a far-future date', () => {
    expect(gigHasPassed(gig({ end_date: '2000-01-01', date: '2000-01-01' }))).toBe(true)
    expect(gigHasPassed(gig({ end_date: '2999-01-01', date: '2999-01-01' }))).toBe(false)
  })

  it('handles timestamptz strings (slices to date)', () => {
    expect(gigHasPassed(gig({ end_date: null, date: '2000-01-01T00:00:00+00:00' }))).toBe(true)
  })
})
