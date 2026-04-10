import { describe, it, expect } from 'vitest'
import { getVenueForDate, getAllVenues, getDisplayVenue } from '@/lib/gigs/venue-helpers'

describe('lib/gigs/venue-helpers', () => {
  describe('getVenueForDate', () => {
    it('returns per-date venue when available', () => {
      const gig = {
        venue: 'Main Hall',
        gig_dates: [{ date: '2026-04-10', venue: 'Side Room' }],
      }
      expect(getVenueForDate(gig, '2026-04-10')).toBe('Side Room')
    })

    it('falls back to gig venue when date has no venue', () => {
      const gig = {
        venue: 'Main Hall',
        gig_dates: [{ date: '2026-04-10', venue: null }],
      }
      expect(getVenueForDate(gig, '2026-04-10')).toBe('Main Hall')
    })

    it('falls back to gig venue when date not found', () => {
      const gig = {
        venue: 'Main Hall',
        gig_dates: [{ date: '2026-04-11', venue: 'Other' }],
      }
      expect(getVenueForDate(gig, '2026-04-10')).toBe('Main Hall')
    })

    it('returns null when no venues exist', () => {
      const gig = { venue: null, gig_dates: [] }
      expect(getVenueForDate(gig, '2026-04-10')).toBeNull()
    })

    it('ignores whitespace-only per-date venue', () => {
      const gig = {
        venue: 'Main Hall',
        gig_dates: [{ date: '2026-04-10', venue: '   ' }],
      }
      expect(getVenueForDate(gig, '2026-04-10')).toBe('Main Hall')
    })

    it('handles missing gig_dates', () => {
      const gig = { venue: 'Main Hall', gig_dates: null }
      expect(getVenueForDate(gig, '2026-04-10')).toBe('Main Hall')
    })
  })

  describe('getAllVenues', () => {
    it('returns unique venues from gig and dates', () => {
      const gig = {
        venue: 'Main Hall',
        gig_dates: [
          { date: '2026-04-10', venue: 'Side Room' },
          { date: '2026-04-11', venue: 'Main Hall' },
        ],
      }
      expect(getAllVenues(gig)).toEqual(['Main Hall', 'Side Room'])
    })

    it('returns empty array when no venues', () => {
      const gig = { venue: null, gig_dates: [] }
      expect(getAllVenues(gig)).toEqual([])
    })

    it('trims venue names', () => {
      const gig = {
        venue: '  Main Hall  ',
        gig_dates: [{ date: '2026-04-10', venue: '  Main Hall  ' }],
      }
      expect(getAllVenues(gig)).toEqual(['Main Hall'])
    })

    it('handles null gig_dates', () => {
      const gig = { venue: 'Hall', gig_dates: null }
      expect(getAllVenues(gig)).toEqual(['Hall'])
    })

    it('skips null and empty venue strings', () => {
      const gig = {
        venue: null,
        gig_dates: [
          { date: '2026-04-10', venue: null },
          { date: '2026-04-11', venue: '' },
          { date: '2026-04-12', venue: 'Concert Hall' },
        ],
      }
      expect(getAllVenues(gig)).toEqual(['Concert Hall'])
    })
  })

  describe('getDisplayVenue', () => {
    it('returns single venue when all dates agree', () => {
      const gig = {
        venue: 'Main Hall',
        gig_dates: [
          { date: '2026-04-10', venue: 'Main Hall' },
          { date: '2026-04-11', venue: null },
        ],
      }
      const result = getDisplayVenue(gig)
      expect(result.venue).toBe('Main Hall')
      expect(result.isMixed).toBe(false)
    })

    it('returns isMixed when dates have different venues', () => {
      const gig = {
        venue: 'Main Hall',
        gig_dates: [
          { date: '2026-04-10', venue: 'Side Room' },
          { date: '2026-04-11', venue: 'Main Hall' },
        ],
      }
      const result = getDisplayVenue(gig)
      expect(result.venue).toBeNull()
      expect(result.isMixed).toBe(true)
      expect(result.allVenues).toContain('Main Hall')
      expect(result.allVenues).toContain('Side Room')
    })

    it('returns null venue when no venues at all', () => {
      const gig = { venue: null, gig_dates: [] }
      const result = getDisplayVenue(gig)
      expect(result.venue).toBeNull()
      expect(result.isMixed).toBe(false)
      expect(result.allVenues).toEqual([])
    })

    it('returns single venue when no gig_dates', () => {
      const gig = { venue: 'Hall', gig_dates: undefined }
      const result = getDisplayVenue(gig)
      expect(result.venue).toBe('Hall')
      expect(result.isMixed).toBe(false)
    })

    it('returns single venue when gig_dates is empty', () => {
      const gig = { venue: 'Hall', gig_dates: [] }
      const result = getDisplayVenue(gig)
      expect(result.venue).toBe('Hall')
      expect(result.isMixed).toBe(false)
    })
  })
})
