import { describe, it, expect } from 'vitest'
import { parseLocalDate, formatYMD, todayInTimeZone, yearFromDateString } from '@/lib/dates'

describe('parseLocalDate', () => {
  it('keeps the calendar day for a date-only string (no UTC off-by-one)', () => {
    const d = parseLocalDate('2026-06-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(5) // June
    expect(d.getDate()).toBe(1)
  })

  it('accepts a timestamptz string and uses only the date part', () => {
    const d = parseLocalDate('2026-06-01T00:00:00+00:00')
    expect(formatYMD(d)).toBe('2026-06-01')
  })
})

describe('yearFromDateString', () => {
  it('reads the year from the string, not via Date parsing', () => {
    expect(yearFromDateString('2026-01-01')).toBe(2026)
    expect(yearFromDateString('2026-12-31')).toBe(2026)
    expect(yearFromDateString('2025-06-15T10:00:00Z')).toBe(2025)
  })
})

describe('todayInTimeZone', () => {
  it('returns the local day in the given timezone at an instant near midnight', () => {
    // 2026-06-01 01:00 UTC → still 2026-05-31 in Sao Paulo (UTC-3)
    const instant = new Date('2026-06-01T01:00:00Z')
    expect(todayInTimeZone('America/Sao_Paulo', instant)).toBe('2026-05-31')
    expect(todayInTimeZone('Europe/Stockholm', instant)).toBe('2026-06-01')
  })

  it('formats as YYYY-MM-DD', () => {
    const instant = new Date('2026-06-15T12:00:00Z')
    expect(todayInTimeZone('Europe/Stockholm', instant)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('falls back to local day for an invalid timezone', () => {
    const instant = new Date('2026-06-15T12:00:00Z')
    expect(todayInTimeZone('Not/AZone', instant)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
