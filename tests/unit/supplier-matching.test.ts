import { describe, it, expect } from 'vitest'
import { findCanonicalSupplier, clusterSuppliers, normalizeSupplier } from '@/lib/expenses/supplier-matching'

describe('findCanonicalSupplier', () => {
  it('returns null for empty candidate or empty list', () => {
    expect(findCanonicalSupplier('', [{ supplier: 'SJ', count: 3 }])).toBeNull()
    expect(findCanonicalSupplier('   ', [{ supplier: 'SJ', count: 3 }])).toBeNull()
    expect(findCanonicalSupplier('SJ', [])).toBeNull()
  })

  it('snaps to an existing name matching after suffix normalization', () => {
    expect(findCanonicalSupplier('SJ AB', [{ supplier: 'SJ', count: 10 }])).toBe('SJ')
  })

  it('does NOT snap on loose "contains" matches (handled by aliases instead)', () => {
    expect(findCanonicalSupplier('SJ (Svenska Järnvägar)', [{ supplier: 'SJ', count: 5 }])).toBeNull()
  })

  it('prefers the most-used variant when several match', () => {
    const existing = [
      { supplier: 'SJ AB', count: 2 },
      { supplier: 'SJ', count: 9 },
    ]
    expect(findCanonicalSupplier('SJ', existing)).toBe('SJ')
  })

  it('does NOT snap on fuzzy near-matches', () => {
    expect(findCanonicalSupplier('Netflx', [{ supplier: 'Netflix', count: 4 }])).toBeNull()
  })

  it('does not snap unrelated names', () => {
    expect(findCanonicalSupplier('Apple', [{ supplier: 'Aimo Park', count: 5 }])).toBeNull()
    expect(findCanonicalSupplier('G&L Redovisning', [{ supplier: 'StageSub AB', count: 12 }])).toBeNull()
  })

  it('ignores blank existing entries', () => {
    expect(findCanonicalSupplier('SJ AB', [{ supplier: '', count: 1 }])).toBeNull()
  })
})

describe('clusterSuppliers', () => {
  it('groups similar names and excludes singletons', () => {
    const groups = clusterSuppliers([
      { supplier: 'SJ', count: 9 },
      { supplier: 'SJ AB', count: 2 },
      { supplier: 'SJ (Svenska Järnvägar)', count: 1 },
      { supplier: 'Apple', count: 5 },
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].canonical).toBe('SJ')
    expect(groups[0].members.map((m) => m.supplier)).toEqual(['SJ', 'SJ AB', 'SJ (Svenska Järnvägar)'])
  })

  it('returns an empty array when nothing is similar', () => {
    expect(
      clusterSuppliers([
        { supplier: 'Apple', count: 1 },
        { supplier: 'Spotify', count: 1 },
      ]),
    ).toEqual([])
  })

  it('orders bigger groups first', () => {
    const groups = clusterSuppliers([
      { supplier: 'SJ', count: 9 },
      { supplier: 'SJ AB', count: 2 },
      { supplier: 'Swedbank', count: 3 },
      { supplier: 'Swedbank AB', count: 1 },
      { supplier: 'Swedbank Bank', count: 1 },
    ])
    expect(groups[0].members.length).toBeGreaterThanOrEqual(groups[1].members.length)
  })

  it('skips blank entries', () => {
    expect(
      clusterSuppliers([
        { supplier: '', count: 1 },
        { supplier: '  ', count: 1 },
      ]),
    ).toEqual([])
  })
})

describe('normalizeSupplier', () => {
  it('lowercases and strips common company suffixes', () => {
    expect(normalizeSupplier('SJ AB')).toBe('sj')
    expect(normalizeSupplier('Anthropic, PBC')).toBe('anthropic')
  })
})
