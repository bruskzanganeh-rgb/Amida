import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { logAiUsage } from '@/lib/ai/usage-logger'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Schema for a single session within a day (lenient — AI may return nulls)
const RawSessionSchema = z.object({
  start: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  end: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  label: z.string().nullable().optional(),
})

export const SessionSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable(),
  label: z.string().nullable().optional(),
})

export type Session = z.infer<typeof SessionSchema>

// Filter out sessions with null start times
function filterValidSessions(dates: Record<string, z.infer<typeof RawSessionSchema>[]>): Record<string, Session[]> {
  const result: Record<string, Session[]> = {}
  for (const [date, sessions] of Object.entries(dates)) {
    const valid = sessions.filter((s): s is Session => s.start !== null)
    if (valid.length > 0) {
      result[date] = valid
    } else {
      // Keep the date even without sessions (just with empty array)
      result[date] = []
    }
  }
  return result
}

// Schema for parsed schedule (text parsing)
const ParsedScheduleSchema = z.object({
  dates: z.record(z.string(), z.array(RawSessionSchema)),
})

// Schema for scanned schedule (PDF/image)
const ScannedScheduleSchema = z.object({
  dates: z.record(z.string(), z.array(RawSessionSchema)),
  project_name: z.string().nullable().optional(),
  venue: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
})

export type ScannedScheduleData = Omit<z.infer<typeof ScannedScheduleSchema>, 'dates'> & {
  dates: Record<string, Session[]>
}

function getParsePrompt(locale: string) {
  if (locale === 'sv') {
    return `Du parsar schematext för en frilansmusiker.

Input: en lista av datum med fritext som beskriver dagens schema.
Output: strukturerade sessions per datum.

Regler:
- "10-12" → { "start": "10:00", "end": "12:00" }
- "rep 10-12" → { "start": "10:00", "end": "12:00", "label": "Rep" }
- "konsert 19" utan sluttid → { "start": "19:00", "end": null }
- "10-12, 15-17" → två sessions
- "10.00-12.00" → { "start": "10:00", "end": "12:00" }
- Normalisera label: "rep"/"repetition"→"Rep", "konsert"/"concert"/"spelning"→"Konsert", "gp"/"genrep"/"generalrep"→"Generalrep", "scenrep"→"Scenrep"
- Om ingen label anges, utelämna fältet

Returnera ENDAST JSON:
{
  "dates": {
    "2026-03-03": [{ "start": "10:00", "end": "12:00", "label": "Rep" }]
  }
}

VIKTIGT: Returnera BARA JSON, inget annat.`
  }

  return `You parse schedule text for a freelance musician.

Input: a list of dates with free text describing the day's schedule.
Output: structured sessions per date.

Rules:
- "10-12" → { "start": "10:00", "end": "12:00" }
- "rehearsal 10-12" → { "start": "10:00", "end": "12:00", "label": "Rehearsal" }
- "concert 19" without end time → { "start": "19:00", "end": null }
- "10-12, 15-17" → two sessions
- "10.00-12.00" → { "start": "10:00", "end": "12:00" }
- Normalize labels: "rep"/"repetition"/"rehearsal"→"Rehearsal", "konsert"/"concert"/"gig"/"performance"→"Concert", "gp"/"genrep"/"generalrep"/"dress rehearsal"→"Dress rehearsal", "scenrep"/"stage rehearsal"→"Stage rehearsal"
- If no label is given, omit the field

Return ONLY JSON:
{
  "dates": {
    "2026-03-03": [{ "start": "10:00", "end": "12:00", "label": "Rehearsal" }]
  }
}

IMPORTANT: Return ONLY JSON, nothing else.`
}

function getScanPrompt(locale: string) {
  if (locale === 'sv') {
    return `Du läser ett repetitions- eller konsertschema för en frilansmusiker.
Extrahera alla datum med tider och typ av aktivitet.

Typer (normalisera till dessa):
- Rep: Repetition, instudering, genomspelning
- Generalrep: Generalrepetition, GP, scenrep
- Konsert: Konsert, föreställning, spelning
- (utelämna label om okänt)

Returnera ENDAST JSON:
{
  "dates": {
    "2026-03-03": [
      { "start": "10:00", "end": "12:00", "label": "Rep" },
      { "start": "15:00", "end": "17:00", "label": "Rep" }
    ],
    "2026-03-06": [
      { "start": "19:00", "end": "21:30", "label": "Konsert" }
    ]
  },
  "project_name": "Beethoven 9",
  "venue": "Konserthuset",
  "confidence": 0.95
}

Regler:
- Datum i ISO-format (YYYY-MM-DD)
- Tider i HH:MM-format
- Om sluttid saknas, sätt end till null
- project_name och venue kan vara null om otydliga
- confidence: 0-1, din säkerhet

VIKTIGT: Returnera BARA JSON, inget annat.`
  }

  return `You are reading a rehearsal or concert schedule for a freelance musician.
Extract all dates with times and activity type.

Types (normalize to these):
- Rehearsal: Rehearsal, rep, repetition, run-through
- Dress rehearsal: Dress rehearsal, GP, generalrep, stage rehearsal
- Concert: Concert, performance, gig, konsert
- (omit label if unknown)

Return ONLY JSON:
{
  "dates": {
    "2026-03-03": [
      { "start": "10:00", "end": "12:00", "label": "Rehearsal" },
      { "start": "15:00", "end": "17:00", "label": "Rehearsal" }
    ],
    "2026-03-06": [
      { "start": "19:00", "end": "21:30", "label": "Concert" }
    ]
  },
  "project_name": "Beethoven 9",
  "venue": "Concert Hall",
  "confidence": 0.95
}

Rules:
- Dates in ISO format (YYYY-MM-DD)
- Times in HH:MM format
- If end time is missing, set end to null
- project_name and venue can be null if unclear
- confidence: 0-1, your certainty

IMPORTANT: Return ONLY JSON, nothing else.`
}

function cleanJsonResponse(text: string): string {
  let jsonText = text.trim()
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '')
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '')
  }
  return jsonText
}

/**
 * Parse free-text schedule entries into structured sessions.
 * One AI call for all dates (batch).
 */
export async function parseScheduleTexts(
  entries: { date: string; text: string }[],
  userId?: string,
  locale: string = 'en',
): Promise<Record<string, Session[]>> {
  if (entries.length === 0) return {}

  try {
    const model = 'claude-haiku-4-5-20251001'

    const userContent = entries.map((e) => `${e.date}: ${e.text}`).join('\n')

    const userMessage =
      locale === 'sv' ? `Parsa dessa schematexter:\n\n${userContent}` : `Parse these schedule texts:\n\n${userContent}`

    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0,
      system: getParsePrompt(locale),
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
    })

    await logAiUsage({
      usageType: 'schedule_parse',
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      userId,
    })

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : null

    if (!responseText) {
      throw new Error('Inget svar från Claude')
    }

    const parsed = JSON.parse(cleanJsonResponse(responseText))
    const validated = ParsedScheduleSchema.parse(parsed)

    return filterValidSessions(validated.dates)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Ogiltigt AI-svar: ${error.message}`)
    }
    throw new Error(`Kunde inte tolka schema: ${error instanceof Error ? error.message : 'Okänt fel'}`)
  }
}

/**
 * Scan a schedule PDF/image and extract dates, times, and metadata.
 */
export async function parseScheduleWithVision(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
  userId?: string,
  locale: string = 'en',
): Promise<ScannedScheduleData> {
  try {
    const model = 'claude-haiku-4-5-20251001'
    const userMessage =
      locale === 'sv'
        ? 'Läs detta schema och extrahera datum, tider och typ.'
        : 'Read this schedule and extract dates, times, and activity type.'

    const message = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      temperature: 0,
      system: getScanPrompt(locale),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mimeType,
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: userMessage,
            },
          ],
        },
      ],
    })

    await logAiUsage({
      usageType: 'schedule_scan',
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      userId,
    })

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : null

    if (!responseText) {
      throw new Error('Inget svar från Claude')
    }

    const parsed = JSON.parse(cleanJsonResponse(responseText))
    const validated = ScannedScheduleSchema.parse(parsed)

    return {
      ...validated,
      dates: filterValidSessions(validated.dates),
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Ogiltigt AI-svar: ${error.message}`)
    }
    throw new Error(`Kunde inte läsa schema: ${error instanceof Error ? error.message : 'Okänt fel'}`)
  }
}

/**
 * Scan a schedule PDF by sending it directly to Claude's API.
 * Uses the document content type — no local PDF rendering needed.
 */
export async function parseScheduleWithPdf(
  pdfBase64: string,
  userId?: string,
  locale: string = 'en',
): Promise<ScannedScheduleData> {
  try {
    const model = 'claude-haiku-4-5-20251001'
    const userMessage =
      locale === 'sv'
        ? 'Läs detta schema och extrahera datum, tider och typ.'
        : 'Read this schedule and extract dates, times, and activity type.'

    const message = await anthropic.messages.create({
      model,
      max_tokens: 2048,
      temperature: 0,
      system: getScanPrompt(locale),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            },
            {
              type: 'text',
              text: userMessage,
            },
          ],
        },
      ],
    })

    await logAiUsage({
      usageType: 'schedule_scan',
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      userId,
    })

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : null

    if (!responseText) {
      throw new Error('Inget svar från Claude')
    }

    const parsed = JSON.parse(cleanJsonResponse(responseText))
    const validated = ScannedScheduleSchema.parse(parsed)

    return {
      ...validated,
      dates: filterValidSessions(validated.dates),
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Ogiltigt AI-svar: ${error.message}`)
    }
    throw new Error(`Kunde inte läsa schema: ${error instanceof Error ? error.message : 'Okänt fel'}`)
  }
}

/**
 * Convert structured sessions back to human-readable text.
 * Used when AI-scanning a PDF to populate the text fields.
 */
export function sessionsToText(sessions: Session[]): string {
  return sessions
    .map((s) => {
      const label = s.label ? `${s.label.toLowerCase()} ` : ''
      const time = s.end ? `${s.start}-${s.end}` : s.start
      return `${label}${time}`
    })
    .join(', ')
}
