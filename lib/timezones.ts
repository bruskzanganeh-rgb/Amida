/**
 * The IANA timezones a user can pick in settings (company_settings.timezone).
 *
 * Every value here MUST have a matching VTIMEZONE block in
 * app/api/calendar/feed/route.ts — the iCal feed emits `DTSTART;TZID=<value>`
 * and clients that don't know the zone natively rely on the embedded block.
 */
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'Europe/Stockholm', label: 'Europe/Stockholm (CET/CEST)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET/CEST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
  { value: 'America/New_York', label: 'America/New_York (ET)' },
  { value: 'America/Chicago', label: 'America/Chicago (CT)' },
  { value: 'America/Denver', label: 'America/Denver (MT)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PT)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (BRT)' },
  { value: 'America/Bahia', label: 'America/Bahia (BRT)' },
  { value: 'America/Fortaleza', label: 'America/Fortaleza (BRT)' },
  { value: 'America/Manaus', label: 'America/Manaus (AMT)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'America/Argentina/Buenos_Aires (ART)' },
  { value: 'America/Santiago', label: 'America/Santiago (CLT/CLST)' },
  { value: 'America/Bogota', label: 'America/Bogota (COT)' },
  { value: 'America/Lima', label: 'America/Lima (PET)' },
  { value: 'America/Montevideo', label: 'America/Montevideo (UYT)' },
  { value: 'America/Asuncion', label: 'America/Asuncion (PYT)' },
  { value: 'America/La_Paz', label: 'America/La_Paz (BOT)' },
  { value: 'America/Caracas', label: 'America/Caracas (VET)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST/AEDT)' },
]

export const DEFAULT_TIMEZONE = 'Europe/Stockholm'
