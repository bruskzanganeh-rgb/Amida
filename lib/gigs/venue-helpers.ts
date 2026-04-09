/**
 * Helpers for resolving venues on gigs that may have per-date venue overrides.
 *
 * Background: a gig has a main `venue` field on the `gigs` table, and optionally
 * per-date venue overrides on `gig_dates.venue`. Tours typically have rehearsals
 * at one venue and concerts at different venues per date.
 */

type GigDateLike = {
  date: string
  venue?: string | null
}

type GigWithDates = {
  venue: string | null
  gig_dates?: GigDateLike[] | null
}

/**
 * Get the venue for a specific date (yyyy-MM-dd).
 * Priority: gig_dates[date].venue → gig.venue → null.
 */
export function getVenueForDate(gig: GigWithDates, date: string): string | null {
  const perDate = gig.gig_dates?.find((d) => d.date === date)?.venue
  if (perDate && perDate.trim()) return perDate
  return gig.venue
}

/**
 * Get all unique non-empty venues across a gig's dates, including the main venue.
 * Useful for tooltips / "Multiple venues" displays.
 */
export function getAllVenues(gig: GigWithDates): string[] {
  const set = new Set<string>()
  if (gig.venue && gig.venue.trim()) set.add(gig.venue.trim())
  for (const d of gig.gig_dates || []) {
    if (d.venue && d.venue.trim()) set.add(d.venue.trim())
  }
  return [...set]
}

/**
 * Resolve the venue label for a gig shown in a list/table view.
 * Returns:
 *  - `{ venue: string, isMixed: false }` if all dates agree (or only one venue exists)
 *  - `{ venue: null, isMixed: true, allVenues }` if different venues per date
 *  - `{ venue: null, isMixed: false }` if no venues at all
 */
export function getDisplayVenue(gig: GigWithDates): { venue: string | null; isMixed: boolean; allVenues: string[] } {
  const allVenues = getAllVenues(gig)

  if (allVenues.length === 0) {
    return { venue: null, isMixed: false, allVenues }
  }

  // Collect distinct venues per actual gig_date (including fallback to gig.venue)
  const perDateVenues = new Set<string>()
  if (gig.gig_dates && gig.gig_dates.length > 0) {
    for (const d of gig.gig_dates) {
      const v = (d.venue && d.venue.trim()) || (gig.venue && gig.venue.trim()) || ''
      if (v) perDateVenues.add(v)
    }
  } else if (gig.venue && gig.venue.trim()) {
    perDateVenues.add(gig.venue.trim())
  }

  if (perDateVenues.size <= 1) {
    return { venue: [...perDateVenues][0] || null, isMixed: false, allVenues }
  }

  return { venue: null, isMixed: true, allVenues }
}
