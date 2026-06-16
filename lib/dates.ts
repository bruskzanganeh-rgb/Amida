/**
 * Parse a date-only ('YYYY-MM-DD') or timestamptz string at LOCAL noon so the
 * calendar day/month/year are timezone-independent.
 *
 * `new Date('2026-06-01')` is parsed as UTC midnight, which in a negative-offset
 * timezone (e.g. Brazil, UTC-3) becomes 2026-05-31 locally — shifting the day
 * and month. Anchoring at local noon avoids that off-by-one for both display
 * and year/month bucketing.
 */
export function parseLocalDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T12:00:00`)
}

/** Today's date as 'YYYY-MM-DD' in the local timezone (not UTC). */
export function localToday(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
