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

/** Format a Date as 'YYYY-MM-DD' using its LOCAL calendar fields (not UTC), so
 * e.g. the last day of a month isn't shifted a day by toISOString(). */
export function formatYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Today's date as 'YYYY-MM-DD' in the local timezone (not UTC). */
export function localToday(): string {
  return formatYMD(new Date())
}

/**
 * Today's date as 'YYYY-MM-DD' in a specific IANA timezone.
 *
 * Use this on the SERVER (Vercel runs in UTC, so `localToday()` there returns
 * the UTC day, which can be a day ahead of the company's actual local day).
 * Pass the company's `company_settings.timezone` (default 'Europe/Stockholm').
 * `en-CA` yields ISO 'YYYY-MM-DD' formatting.
 */
export function todayInTimeZone(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    // Invalid/unknown timezone — fall back to the machine's local day.
    return formatYMD(now)
  }
}

/**
 * Year of a date-only ('YYYY-MM-DD') or timestamptz string, read from the
 * string itself. Avoids `new Date(dateStr).getFullYear()`, which parses a
 * date-only string as UTC midnight and returns the previous year in negative
 * offsets (e.g. '2026-01-01' → 2025 in Brazil).
 */
export function yearFromDateString(value: string): number {
  return Number(value.slice(0, 4))
}
