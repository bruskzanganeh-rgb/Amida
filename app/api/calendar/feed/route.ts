import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

function formatDateOnly(dateStr: string): string {
  // Input: "2026-02-17" → Output: "20260217"
  return dateStr.replace(/-/g, '')
}

function formatNextDay(dateStr: string): string {
  // ICS all-day DTEND is exclusive, so add 1 day
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function formatDateTime(dateStr: string, timeStr: string): string {
  // "2026-03-03" + "10:00" → "20260303T100000"
  return `${dateStr.replace(/-/g, '')}T${timeStr.replace(':', '')}00`
}

function escapeICSText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

// VTIMEZONE blocks per supported timezone (RFC 5545 RRULE-based DST rules)
const VTIMEZONE_BLOCKS: Record<string, string> = {
  'Europe/Stockholm': `BEGIN:VTIMEZONE\nTZID:Europe/Stockholm\nBEGIN:DAYLIGHT\nTZOFFSETFROM:+0100\nTZOFFSETTO:+0200\nTZNAME:CEST\nDTSTART:19700329T020000\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3\nEND:DAYLIGHT\nBEGIN:STANDARD\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nTZNAME:CET\nDTSTART:19701025T030000\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10\nEND:STANDARD\nEND:VTIMEZONE`,
  'Europe/London': `BEGIN:VTIMEZONE\nTZID:Europe/London\nBEGIN:DAYLIGHT\nTZOFFSETFROM:+0000\nTZOFFSETTO:+0100\nTZNAME:BST\nDTSTART:19700329T010000\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3\nEND:DAYLIGHT\nBEGIN:STANDARD\nTZOFFSETFROM:+0100\nTZOFFSETTO:+0000\nTZNAME:GMT\nDTSTART:19701025T020000\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10\nEND:STANDARD\nEND:VTIMEZONE`,
  'Europe/Berlin': `BEGIN:VTIMEZONE\nTZID:Europe/Berlin\nBEGIN:DAYLIGHT\nTZOFFSETFROM:+0100\nTZOFFSETTO:+0200\nTZNAME:CEST\nDTSTART:19700329T020000\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3\nEND:DAYLIGHT\nBEGIN:STANDARD\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nTZNAME:CET\nDTSTART:19701025T030000\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10\nEND:STANDARD\nEND:VTIMEZONE`,
  'Europe/Paris': `BEGIN:VTIMEZONE\nTZID:Europe/Paris\nBEGIN:DAYLIGHT\nTZOFFSETFROM:+0100\nTZOFFSETTO:+0200\nTZNAME:CEST\nDTSTART:19700329T020000\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=3\nEND:DAYLIGHT\nBEGIN:STANDARD\nTZOFFSETFROM:+0200\nTZOFFSETTO:+0100\nTZNAME:CET\nDTSTART:19701025T030000\nRRULE:FREQ=YEARLY;BYDAY=-1SU;BYMONTH=10\nEND:STANDARD\nEND:VTIMEZONE`,
  'America/New_York': `BEGIN:VTIMEZONE\nTZID:America/New_York\nBEGIN:DAYLIGHT\nTZOFFSETFROM:-0500\nTZOFFSETTO:-0400\nTZNAME:EDT\nDTSTART:19700308T020000\nRRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3\nEND:DAYLIGHT\nBEGIN:STANDARD\nTZOFFSETFROM:-0400\nTZOFFSETTO:-0500\nTZNAME:EST\nDTSTART:19701101T020000\nRRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11\nEND:STANDARD\nEND:VTIMEZONE`,
  'America/Chicago': `BEGIN:VTIMEZONE\nTZID:America/Chicago\nBEGIN:DAYLIGHT\nTZOFFSETFROM:-0600\nTZOFFSETTO:-0500\nTZNAME:CDT\nDTSTART:19700308T020000\nRRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3\nEND:DAYLIGHT\nBEGIN:STANDARD\nTZOFFSETFROM:-0500\nTZOFFSETTO:-0600\nTZNAME:CST\nDTSTART:19701101T020000\nRRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11\nEND:STANDARD\nEND:VTIMEZONE`,
  'America/Denver': `BEGIN:VTIMEZONE\nTZID:America/Denver\nBEGIN:DAYLIGHT\nTZOFFSETFROM:-0700\nTZOFFSETTO:-0600\nTZNAME:MDT\nDTSTART:19700308T020000\nRRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3\nEND:DAYLIGHT\nBEGIN:STANDARD\nTZOFFSETFROM:-0600\nTZOFFSETTO:-0700\nTZNAME:MST\nDTSTART:19701101T020000\nRRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11\nEND:STANDARD\nEND:VTIMEZONE`,
  'America/Los_Angeles': `BEGIN:VTIMEZONE\nTZID:America/Los_Angeles\nBEGIN:DAYLIGHT\nTZOFFSETFROM:-0800\nTZOFFSETTO:-0700\nTZNAME:PDT\nDTSTART:19700308T020000\nRRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3\nEND:DAYLIGHT\nBEGIN:STANDARD\nTZOFFSETFROM:-0700\nTZOFFSETTO:-0800\nTZNAME:PST\nDTSTART:19701101T020000\nRRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11\nEND:STANDARD\nEND:VTIMEZONE`,
  'Asia/Tokyo': `BEGIN:VTIMEZONE\nTZID:Asia/Tokyo\nBEGIN:STANDARD\nTZOFFSETFROM:+0900\nTZOFFSETTO:+0900\nTZNAME:JST\nDTSTART:19700101T000000\nEND:STANDARD\nEND:VTIMEZONE`,
  'Australia/Sydney': `BEGIN:VTIMEZONE\nTZID:Australia/Sydney\nBEGIN:DAYLIGHT\nTZOFFSETFROM:+1000\nTZOFFSETTO:+1100\nTZNAME:AEDT\nDTSTART:19701004T020000\nRRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=10\nEND:DAYLIGHT\nBEGIN:STANDARD\nTZOFFSETFROM:+1100\nTZOFFSETTO:+1000\nTZNAME:AEST\nDTSTART:19700405T030000\nRRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=4\nEND:STANDARD\nEND:VTIMEZONE`,
}

function getVTimezone(tz: string): string {
  return VTIMEZONE_BLOCKS[tz] ?? VTIMEZONE_BLOCKS['Europe/Stockholm']
}

type Session = { start: string; end: string | null; label?: string }

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()

    const userId = request.nextUrl.searchParams.get('user')
    const token = request.nextUrl.searchParams.get('token')
    const scope = request.nextUrl.searchParams.get('scope') || 'personal'
    if (!userId || !token) {
      return NextResponse.json({ error: 'User and token parameters required' }, { status: 400 })
    }

    // Verify token and get locale + timezone
    const { data: settings } = await supabase
      .from('company_settings')
      .select('calendar_token, locale, timezone')
      .eq('user_id', userId)
      .single()

    if (!settings || settings.calendar_token !== token) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
    }

    const locale = settings.locale || 'sv'
    const tz = settings.timezone || 'Europe/Stockholm'
    const labels = getLabels(locale)

    // Get company membership
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', userId)
      .single()

    let gigQuery = supabase
      .from('gigs')
      .select(
        `
        id,
        project_name,
        venue,
        fee,
        status,
        notes,
        user_id,
        client:clients(name),
        gig_type:gig_types(name),
        gig_dates(date, sessions)
      `,
      )
      .neq('status', 'declined')
      .neq('status', 'draft')
      .order('date', { ascending: true })

    if (scope === 'shared' && membership) {
      // Show all company gigs
      gigQuery = gigQuery.eq('company_id', membership.company_id)
    } else {
      // Show only this user's gigs
      gigQuery = gigQuery.eq('user_id', userId)
    }

    const { data: gigs, error } = await gigQuery

    if (error) {
      console.error('Error fetching gigs:', error)
      return NextResponse.json({ error: 'Failed to fetch gigs' }, { status: 500 })
    }

    const now = new Date()
    const dtstamp = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}T${String(now.getUTCHours()).padStart(2, '0')}${String(now.getUTCMinutes()).padStart(2, '0')}${String(now.getUTCSeconds()).padStart(2, '0')}Z`

    // Build ICS events
    const events = (gigs || [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .flatMap((gig: any) => {
        const clientName = gig.client?.name || labels.unknownClient
        const baseSummary = gig.project_name
          ? `${gig.project_name} (${clientName})`
          : `${gig.gig_type?.name || 'Gig'} (${clientName})`

        const descParts: string[] = []
        descParts.push(`${labels.client}: ${clientName}`)
        descParts.push(`${labels.type}: ${gig.gig_type?.name || '-'}`)
        if (gig.fee) descParts.push(`${labels.fee}: ${gig.fee.toLocaleString(locale === 'sv' ? 'sv-SE' : 'en-US')} kr`)
        descParts.push(`${labels.statusLabel}: ${getStatusLabel(gig.status, locale)}`)
        if (gig.notes) descParts.push(`\n${gig.notes}`)

        const description = escapeICSText(descParts.join('\n'))
        const location = gig.venue ? escapeICSText(gig.venue) : ''
        const icsStatus = gig.status === 'accepted' ? 'CONFIRMED' : 'TENTATIVE'

        const dates: { date: string; sessions: Session[] | null }[] = gig.gig_dates || []
        if (dates.length === 0) return []

        return dates.flatMap((gd, dateIdx) => {
          const sessions: Session[] = Array.isArray(gd.sessions) ? gd.sessions : []

          if (sessions.length > 0) {
            // Emit one VEVENT per session (timed events)
            return sessions.map((session, sessionIdx) => {
              const summary = session.label ? `${session.label}: ${baseSummary}` : baseSummary

              const dtStart = formatDateTime(gd.date, session.start)

              // If no end time, default to start + 2 hours
              let dtEnd: string
              if (session.end) {
                dtEnd = formatDateTime(gd.date, session.end)
              } else {
                const [h, m] = session.start.split(':').map(Number)
                const endH = String(Math.min(h + 2, 23)).padStart(2, '0')
                dtEnd = formatDateTime(gd.date, `${endH}:${String(m).padStart(2, '0')}`)
              }

              return `BEGIN:VEVENT
UID:${gig.id}-${dateIdx}-${sessionIdx}@amida.babalisk.com
DTSTAMP:${dtstamp}
DTSTART;TZID=${tz}:${dtStart}
DTEND;TZID=${tz}:${dtEnd}
SUMMARY:${escapeICSText(summary)}
LOCATION:${location}
DESCRIPTION:${description}
STATUS:${icsStatus}
END:VEVENT`
            })
          } else {
            // All-day event (existing behaviour)
            const dateFormatted = formatDateOnly(gd.date)
            const endFormatted = formatNextDay(gd.date)

            return [
              `BEGIN:VEVENT
UID:${gig.id}-${dateIdx}@amida.babalisk.com
DTSTAMP:${dtstamp}
DTSTART;VALUE=DATE:${dateFormatted}
DTEND;VALUE=DATE:${endFormatted}
SUMMARY:${escapeICSText(baseSummary)}
LOCATION:${location}
DESCRIPTION:${description}
STATUS:${icsStatus}
END:VEVENT`,
            ]
          }
        })
      })
      .join('\n')

    const calName =
      scope === 'shared'
        ? locale === 'en'
          ? 'Amida — Team gigs'
          : 'Amida — Teamets gigs'
        : locale === 'en'
          ? 'Amida — My gigs'
          : 'Amida — Mina gigs'

    const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Amida//SE
X-WR-CALNAME:${calName}
X-WR-TIMEZONE:${tz}
CALSCALE:GREGORIAN
METHOD:PUBLISH
${getVTimezone(tz)}
${events}
END:VCALENDAR`

    return new NextResponse(icsContent, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="amida-gigs.ics"',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    })
  } catch (error) {
    console.error('Calendar feed error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function getStatusLabel(status: string, locale: string): string {
  const sv: Record<string, string> = {
    tentative: 'Ej bekräftat',
    pending: 'Väntar på svar',
    accepted: 'Accepterat',
    declined: 'Avböjt',
    completed: 'Genomfört',
    invoiced: 'Fakturerat',
    paid: 'Betalt',
  }
  const en: Record<string, string> = {
    tentative: 'Tentative',
    pending: 'Pending response',
    accepted: 'Accepted',
    declined: 'Declined',
    completed: 'Completed',
    invoiced: 'Invoiced',
    paid: 'Paid',
  }
  const labels = locale === 'en' ? en : sv
  return labels[status] || status
}

function getLabels(locale: string) {
  if (locale === 'en') {
    return {
      unknownClient: 'Unknown client',
      client: 'Client',
      type: 'Type',
      fee: 'Fee',
      statusLabel: 'Status',
    }
  }
  return {
    unknownClient: 'Okänd kund',
    client: 'Kund',
    type: 'Typ',
    fee: 'Arvode',
    statusLabel: 'Status',
  }
}
