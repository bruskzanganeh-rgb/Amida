import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { TIMEZONE_OPTIONS, DEFAULT_TIMEZONE } from '@/lib/timezones'

// The iCal feed emits DTSTART;TZID=<value>. If a picker option has no matching
// VTIMEZONE block the feed silently falls back to Europe/Stockholm's DST rules,
// which shifts every event for users in that zone.
const feedSource = readFileSync(join(process.cwd(), 'app/api/calendar/feed/route.ts'), 'utf8')

describe('timezone options', () => {
  it('includes the default', () => {
    expect(TIMEZONE_OPTIONS.map((t) => t.value)).toContain(DEFAULT_TIMEZONE)
  })

  it('has no duplicate values', () => {
    const values = TIMEZONE_OPTIONS.map((t) => t.value)
    expect(new Set(values).size).toBe(values.length)
  })

  it.each(TIMEZONE_OPTIONS.map((t) => t.value))('%s is a valid IANA zone', (tz) => {
    expect(() => new Intl.DateTimeFormat('en-US', { timeZone: tz })).not.toThrow()
  })

  it.each(TIMEZONE_OPTIONS.map((t) => t.value))('%s has a VTIMEZONE block in the feed', (tz) => {
    expect(feedSource).toContain(`'${tz}'`)
  })
})
