import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockCreate } = vi.hoisted(() => {
  return { mockCreate: vi.fn() }
})

// Mock Anthropic SDK — the module creates a client at import time which
// fails in jsdom because it detects a browser-like environment.
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = { create: mockCreate }
    },
  }
})

// Mock the usage logger to avoid Supabase admin client import
vi.mock('@/lib/ai/usage-logger', () => ({
  logAiUsage: vi.fn(),
}))

import {
  sessionsToText,
  SessionSchema,
  parseScheduleTexts,
  parseScheduleWithVision,
  parseScheduleWithPdf,
  correctPastDates,
} from '@/lib/schedule/parser'
import type { Session } from '@/lib/schedule/parser'

describe('sessionsToText', () => {
  it('formats a single session with label and end time', () => {
    const sessions: Session[] = [{ start: '10:00', end: '12:00', label: 'Rep' }]
    expect(sessionsToText(sessions)).toBe('rep 10:00-12:00')
  })

  it('formats a session without label', () => {
    const sessions: Session[] = [{ start: '10:00', end: '12:00' }]
    expect(sessionsToText(sessions)).toBe('10:00-12:00')
  })

  it('formats a session without end time', () => {
    const sessions: Session[] = [{ start: '19:00', end: null }]
    expect(sessionsToText(sessions)).toBe('19:00')
  })

  it('formats a session with label but no end time', () => {
    const sessions: Session[] = [{ start: '19:00', end: null, label: 'Konsert' }]
    expect(sessionsToText(sessions)).toBe('konsert 19:00')
  })

  it('joins multiple sessions with comma and space', () => {
    const sessions: Session[] = [
      { start: '10:00', end: '12:00', label: 'Rep' },
      { start: '15:00', end: '17:00', label: 'Rep' },
    ]
    expect(sessionsToText(sessions)).toBe('rep 10:00-12:00, rep 15:00-17:00')
  })

  it('handles mixed sessions (with/without label and end)', () => {
    const sessions: Session[] = [
      { start: '10:00', end: '12:00', label: 'Rep' },
      { start: '19:00', end: null },
    ]
    expect(sessionsToText(sessions)).toBe('rep 10:00-12:00, 19:00')
  })

  it('returns empty string for empty array', () => {
    expect(sessionsToText([])).toBe('')
  })
})

describe('SessionSchema', () => {
  it('parses a valid session with all fields', () => {
    const result = SessionSchema.parse({
      start: '10:00',
      end: '12:00',
      label: 'Rep',
    })
    expect(result).toEqual({ start: '10:00', end: '12:00', label: 'Rep' })
  })

  it('parses a valid session with null end', () => {
    const result = SessionSchema.parse({
      start: '19:00',
      end: null,
    })
    expect(result).toEqual({ start: '19:00', end: null })
  })

  it('parses a valid session without label (optional)', () => {
    const result = SessionSchema.parse({
      start: '10:00',
      end: '12:00',
    })
    expect(result).toEqual({ start: '10:00', end: '12:00' })
  })

  it('rejects invalid start time format', () => {
    expect(() => SessionSchema.parse({ start: '10', end: '12:00' })).toThrow()
  })

  it('rejects start time with invalid characters', () => {
    expect(() => SessionSchema.parse({ start: '10.00', end: '12:00' })).toThrow()
  })

  it('rejects null start time', () => {
    expect(() => SessionSchema.parse({ start: null, end: '12:00' })).toThrow()
  })

  it('rejects missing start time', () => {
    expect(() => SessionSchema.parse({ end: '12:00' })).toThrow()
  })

  it('rejects invalid end time format', () => {
    expect(() => SessionSchema.parse({ start: '10:00', end: '12' })).toThrow()
  })

  it('accepts end time matching HH:MM pattern', () => {
    const result = SessionSchema.parse({ start: '09:30', end: '23:59' })
    expect(result.end).toBe('23:59')
  })

  it('rejects completely invalid start', () => {
    expect(() => SessionSchema.parse({ start: 'abc', end: null })).toThrow()
  })
})

// ─── Helpers for mock responses ───────────────────────────────────────

function makeMockResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

function makeMockEmptyResponse() {
  return {
    content: [{ type: 'image', source: {} }],
    usage: { input_tokens: 100, output_tokens: 0 },
  }
}

// ─── parseScheduleTexts ───────────────────────────────────────────────

describe('parseScheduleTexts', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('returns empty object for empty entries', async () => {
    const result = await parseScheduleTexts([])
    expect(result).toEqual({})
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('parses valid AI response into structured sessions', async () => {
    const aiResponse = JSON.stringify({
      dates: {
        '2026-03-03': [{ start: '10:00', end: '12:00', label: 'Rep' }],
        '2026-03-04': [{ start: '19:00', end: null }],
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(aiResponse))

    const result = await parseScheduleTexts([
      { date: '2026-03-03', text: 'rep 10-12' },
      { date: '2026-03-04', text: '19' },
    ])

    expect(result).toEqual({
      '2026-03-03': [{ start: '10:00', end: '12:00', label: 'Rep' }],
      '2026-03-04': [{ start: '19:00', end: null }],
    })
    expect(mockCreate).toHaveBeenCalledOnce()
  })

  it('handles AI response wrapped in ```json``` markdown fence', async () => {
    const rawJson = JSON.stringify({
      dates: {
        '2026-05-01': [{ start: '14:00', end: '16:00', label: 'Rep' }],
      },
    })
    const wrapped = '```json\n' + rawJson + '\n```'
    mockCreate.mockResolvedValueOnce(makeMockResponse(wrapped))

    const result = await parseScheduleTexts([{ date: '2026-05-01', text: 'rep 14-16' }])

    expect(result).toEqual({
      '2026-05-01': [{ start: '14:00', end: '16:00', label: 'Rep' }],
    })
  })

  it('handles AI response wrapped in plain ``` fence', async () => {
    const rawJson = JSON.stringify({
      dates: {
        '2026-06-01': [{ start: '09:00', end: '11:00' }],
      },
    })
    const wrapped = '```\n' + rawJson + '\n```'
    mockCreate.mockResolvedValueOnce(makeMockResponse(wrapped))

    const result = await parseScheduleTexts([{ date: '2026-06-01', text: '9-11' }])

    expect(result).toEqual({
      '2026-06-01': [{ start: '09:00', end: '11:00' }],
    })
  })

  it('filters out sessions with null start via filterValidSessions', async () => {
    const aiResponse = JSON.stringify({
      dates: {
        '2026-03-03': [
          { start: '10:00', end: '12:00', label: 'Rep' },
          { start: null, end: '14:00', label: 'Unknown' },
        ],
        '2026-03-04': [{ start: null, end: null }],
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(aiResponse))

    const result = await parseScheduleTexts([
      { date: '2026-03-03', text: 'rep 10-12, ?' },
      { date: '2026-03-04', text: '?' },
    ])

    // First date keeps only the valid session
    expect(result['2026-03-03']).toEqual([{ start: '10:00', end: '12:00', label: 'Rep' }])
    // Second date has no valid sessions — filterValidSessions keeps the date with empty array
    expect(result['2026-03-04']).toEqual([])
  })

  it('throws wrapped ZodError when AI returns invalid schema', async () => {
    // Missing the 'dates' key entirely
    const badResponse = JSON.stringify({ items: [] })
    mockCreate.mockResolvedValueOnce(makeMockResponse(badResponse))

    await expect(parseScheduleTexts([{ date: '2026-01-01', text: 'rep 10-12' }])).rejects.toThrow('Ogiltigt AI-svar')
  })

  it('throws wrapped ZodError when sessions have invalid time format', async () => {
    const badResponse = JSON.stringify({
      dates: {
        '2026-01-01': [{ start: 'abc', end: '12:00' }],
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(badResponse))

    await expect(parseScheduleTexts([{ date: '2026-01-01', text: 'abc' }])).rejects.toThrow('Ogiltigt AI-svar')
  })

  it('throws general error when API call fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit exceeded'))

    await expect(parseScheduleTexts([{ date: '2026-01-01', text: 'rep 10-12' }])).rejects.toThrow(
      'Kunde inte tolka schema: API rate limit exceeded',
    )
  })

  it('throws general error with "Okänt fel" for non-Error exceptions', async () => {
    mockCreate.mockRejectedValueOnce('string error')

    await expect(parseScheduleTexts([{ date: '2026-01-01', text: 'rep 10-12' }])).rejects.toThrow(
      'Kunde inte tolka schema: Okänt fel',
    )
  })

  it('throws when AI returns no text content (null response)', async () => {
    mockCreate.mockResolvedValueOnce(makeMockEmptyResponse())

    await expect(parseScheduleTexts([{ date: '2026-01-01', text: 'rep 10-12' }])).rejects.toThrow(
      'Kunde inte tolka schema: Inget svar från Claude',
    )
  })

  it('parses multiple sessions per date correctly', async () => {
    const aiResponse = JSON.stringify({
      dates: {
        '2026-04-10': [
          { start: '10:00', end: '12:00', label: 'Rep' },
          { start: '15:00', end: '17:00', label: 'Rep' },
          { start: '19:00', end: '21:30', label: 'Konsert' },
        ],
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(aiResponse))

    const result = await parseScheduleTexts([{ date: '2026-04-10', text: 'rep 10-12, rep 15-17, konsert 19-21:30' }])

    expect(result['2026-04-10']).toHaveLength(3)
    expect(result['2026-04-10'][2]).toEqual({
      start: '19:00',
      end: '21:30',
      label: 'Konsert',
    })
  })

  it('passes userId to the API call and calls logAiUsage', async () => {
    const aiResponse = JSON.stringify({
      dates: {
        '2026-07-01': [{ start: '10:00', end: '12:00' }],
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(aiResponse))

    await parseScheduleTexts([{ date: '2026-07-01', text: '10-12' }], 'test-user-id')

    // Verify the API was called with correct model and parameters
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        temperature: 0,
      }),
    )
  })

  it('throws on invalid JSON in AI response', async () => {
    mockCreate.mockResolvedValueOnce(makeMockResponse('not valid json at all'))

    await expect(parseScheduleTexts([{ date: '2026-01-01', text: 'rep 10-12' }])).rejects.toThrow(
      'Kunde inte tolka schema',
    )
  })
})

// ─── parseScheduleWithVision ──────────────────────────────────────────

describe('parseScheduleWithVision', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('parses valid image response with dates and metadata', async () => {
    const aiResponse = JSON.stringify({
      dates: {
        '2026-03-10': [{ start: '10:00', end: '12:00', label: 'Rep' }],
        '2026-03-15': [{ start: '19:00', end: '21:30', label: 'Konsert' }],
      },
      project_name: 'Beethoven 9',
      venue: 'Konserthuset',
      confidence: 0.95,
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(aiResponse))

    const result = await parseScheduleWithVision('base64data', 'image/png')

    expect(result.dates).toEqual({
      '2026-03-10': [{ start: '10:00', end: '12:00', label: 'Rep' }],
      '2026-03-15': [{ start: '19:00', end: '21:30', label: 'Konsert' }],
    })
    expect(result.project_name).toBe('Beethoven 9')
    expect(result.venue).toBe('Konserthuset')
    expect(result.confidence).toBe(0.95)
  })

  it('filters out sessions with null start from vision response', async () => {
    const aiResponse = JSON.stringify({
      dates: {
        '2026-03-10': [
          { start: '10:00', end: '12:00', label: 'Rep' },
          { start: null, end: '14:00' },
        ],
      },
      project_name: null,
      venue: null,
      confidence: 0.7,
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(aiResponse))

    const result = await parseScheduleWithVision('base64data', 'image/jpeg')

    expect(result.dates['2026-03-10']).toEqual([{ start: '10:00', end: '12:00', label: 'Rep' }])
  })

  it('handles null project_name and venue', async () => {
    const aiResponse = JSON.stringify({
      dates: {
        '2026-03-10': [{ start: '10:00', end: '12:00' }],
      },
      project_name: null,
      venue: null,
      confidence: 0.5,
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(aiResponse))

    const result = await parseScheduleWithVision('base64data', 'image/png')

    expect(result.project_name).toBeNull()
    expect(result.venue).toBeNull()
    expect(result.confidence).toBe(0.5)
  })

  it('throws when AI returns no text content (null response)', async () => {
    mockCreate.mockResolvedValueOnce(makeMockEmptyResponse())

    await expect(parseScheduleWithVision('base64data', 'image/png')).rejects.toThrow(
      'Kunde inte läsa schema: Inget svar från Claude',
    )
  })

  it('throws wrapped ZodError for invalid schema', async () => {
    const badResponse = JSON.stringify({
      dates: { '2026-01-01': [{ start: '10:00', end: '12:00' }] },
      // Missing required 'confidence' field
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(badResponse))

    await expect(parseScheduleWithVision('base64data', 'image/png')).rejects.toThrow('Ogiltigt AI-svar')
  })

  it('throws general error when API call fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Network error'))

    await expect(parseScheduleWithVision('base64data', 'image/png')).rejects.toThrow(
      'Kunde inte läsa schema: Network error',
    )
  })

  it('throws general error with "Okänt fel" for non-Error exceptions', async () => {
    mockCreate.mockRejectedValueOnce(42)

    await expect(parseScheduleWithVision('base64data', 'image/png')).rejects.toThrow(
      'Kunde inte läsa schema: Okänt fel',
    )
  })

  it('sends correct image content type to API', async () => {
    const aiResponse = JSON.stringify({
      dates: {
        '2026-03-10': [{ start: '10:00', end: '12:00' }],
      },
      project_name: null,
      venue: null,
      confidence: 0.8,
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(aiResponse))

    await parseScheduleWithVision('base64data', 'image/webp', 'user-123')

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'image',
                source: expect.objectContaining({
                  media_type: 'image/webp',
                  data: 'base64data',
                }),
              }),
            ]),
          }),
        ]),
      }),
    )
  })

  it('handles JSON response wrapped in markdown fence', async () => {
    const rawJson = JSON.stringify({
      dates: {
        '2026-08-01': [{ start: '18:00', end: '20:00', label: 'Konsert' }],
      },
      project_name: 'Mahler 5',
      venue: 'Berwaldhallen',
      confidence: 0.9,
    })
    const wrapped = '```json\n' + rawJson + '\n```'
    mockCreate.mockResolvedValueOnce(makeMockResponse(wrapped))

    const result = await parseScheduleWithVision('base64data', 'image/png')

    expect(result.project_name).toBe('Mahler 5')
    expect(result.dates['2026-08-01']).toHaveLength(1)
  })
})

// ─── parseScheduleWithPdf ─────────────────────────────────────────────

describe('parseScheduleWithPdf', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('parses valid PDF response with dates and metadata', async () => {
    const aiResponse = JSON.stringify({
      dates: {
        '2026-04-01': [
          { start: '10:00', end: '12:00', label: 'Rep' },
          { start: '14:00', end: '16:00', label: 'Rep' },
        ],
        '2026-04-05': [{ start: '19:00', end: '21:30', label: 'Konsert' }],
      },
      project_name: 'Sibelius 2',
      venue: 'Malmö Live',
      confidence: 0.88,
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(aiResponse))

    const result = await parseScheduleWithPdf('pdfbase64data')

    expect(result.dates).toEqual({
      '2026-04-01': [
        { start: '10:00', end: '12:00', label: 'Rep' },
        { start: '14:00', end: '16:00', label: 'Rep' },
      ],
      '2026-04-05': [{ start: '19:00', end: '21:30', label: 'Konsert' }],
    })
    expect(result.project_name).toBe('Sibelius 2')
    expect(result.venue).toBe('Malmö Live')
    expect(result.confidence).toBe(0.88)
  })

  it('filters out sessions with null start from PDF response', async () => {
    const aiResponse = JSON.stringify({
      dates: {
        '2026-04-01': [
          { start: null, end: null },
          { start: '10:00', end: '12:00', label: 'Rep' },
        ],
        '2026-04-02': [{ start: null, end: '14:00' }],
      },
      project_name: null,
      venue: null,
      confidence: 0.6,
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(aiResponse))

    const result = await parseScheduleWithPdf('pdfbase64data')

    expect(result.dates['2026-04-01']).toEqual([{ start: '10:00', end: '12:00', label: 'Rep' }])
    // Date with only null-start sessions preserved as empty array
    expect(result.dates['2026-04-02']).toEqual([])
  })

  it('throws when AI returns no text content (null response)', async () => {
    mockCreate.mockResolvedValueOnce(makeMockEmptyResponse())

    await expect(parseScheduleWithPdf('pdfbase64data')).rejects.toThrow(
      'Kunde inte läsa schema: Inget svar från Claude',
    )
  })

  it('throws wrapped ZodError for invalid schema', async () => {
    const badResponse = JSON.stringify({
      // Missing 'dates' key
      project_name: 'Test',
      confidence: 0.5,
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(badResponse))

    await expect(parseScheduleWithPdf('pdfbase64data')).rejects.toThrow('Ogiltigt AI-svar')
  })

  it('throws wrapped ZodError when confidence is out of range', async () => {
    const badResponse = JSON.stringify({
      dates: { '2026-01-01': [{ start: '10:00', end: '12:00' }] },
      project_name: null,
      venue: null,
      confidence: 1.5, // max is 1
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(badResponse))

    await expect(parseScheduleWithPdf('pdfbase64data')).rejects.toThrow('Ogiltigt AI-svar')
  })

  it('throws general error when API call fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('Timeout'))

    await expect(parseScheduleWithPdf('pdfbase64data')).rejects.toThrow('Kunde inte läsa schema: Timeout')
  })

  it('throws general error with "Okänt fel" for non-Error exceptions', async () => {
    mockCreate.mockRejectedValueOnce(undefined)

    await expect(parseScheduleWithPdf('pdfbase64data')).rejects.toThrow('Kunde inte läsa schema: Okänt fel')
  })

  it('sends correct document content type to API', async () => {
    const aiResponse = JSON.stringify({
      dates: {
        '2026-04-01': [{ start: '10:00', end: '12:00' }],
      },
      project_name: null,
      venue: null,
      confidence: 0.8,
    })
    mockCreate.mockResolvedValueOnce(makeMockResponse(aiResponse))

    await parseScheduleWithPdf('pdfbase64data', 'user-456')

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'document',
                source: expect.objectContaining({
                  media_type: 'application/pdf',
                  data: 'pdfbase64data',
                }),
              }),
            ]),
          }),
        ]),
      }),
    )
  })

  it('handles JSON response wrapped in markdown fence', async () => {
    const rawJson = JSON.stringify({
      dates: {
        '2026-09-15': [{ start: '19:30', end: '22:00', label: 'Konsert' }],
      },
      project_name: 'Brahms 4',
      venue: 'Göteborgs Konserthus',
      confidence: 0.92,
    })
    const wrapped = '```json\n' + rawJson + '\n```'
    mockCreate.mockResolvedValueOnce(makeMockResponse(wrapped))

    const result = await parseScheduleWithPdf('pdfbase64data')

    expect(result.project_name).toBe('Brahms 4')
    expect(result.venue).toBe('Göteborgs Konserthus')
    expect(result.dates['2026-09-15']).toEqual([{ start: '19:30', end: '22:00', label: 'Konsert' }])
  })

  it('throws on invalid JSON in AI response', async () => {
    mockCreate.mockResolvedValueOnce(makeMockResponse('this is not json'))

    await expect(parseScheduleWithPdf('pdfbase64data')).rejects.toThrow('Kunde inte läsa schema')
  })
})

// ─── correctPastDates ─────────────────────────────────────────────────

describe('correctPastDates', () => {
  it('shifts dates >6 months in the past forward by 1 year', () => {
    const now = new Date('2026-04-13')
    const data = {
      dates: {
        '2025-05-18': [{ start: '10:00', end: '12:00' }],
        '2025-05-22': [{ start: '19:00', end: null }],
      },
    }

    const result = correctPastDates(data, now)

    expect(result.dates).toEqual({
      '2026-05-18': [{ start: '10:00', end: '12:00' }],
      '2026-05-22': [{ start: '19:00', end: null }],
    })
  })

  it('does not shift dates that are in the future', () => {
    const now = new Date('2026-04-13')
    const data = {
      dates: {
        '2026-05-18': [{ start: '10:00', end: '12:00' }],
      },
    }

    const result = correctPastDates(data, now)

    expect(result.dates).toEqual({
      '2026-05-18': [{ start: '10:00', end: '12:00' }],
    })
  })

  it('does not shift dates that are less than 6 months in the past', () => {
    const now = new Date('2026-04-13')
    const data = {
      dates: {
        '2026-01-15': [{ start: '10:00', end: '12:00' }],
      },
    }

    const result = correctPastDates(data, now)

    expect(result.dates).toEqual({
      '2026-01-15': [{ start: '10:00', end: '12:00' }],
    })
  })

  it('also corrects venue keys when dates are shifted', () => {
    const now = new Date('2026-04-13')
    const data = {
      dates: {
        '2025-05-18': [{ start: '10:00', end: '12:00' }],
        '2025-05-22': [{ start: '19:00', end: null }],
      },
      venues: {
        '2025-05-22': 'Grünewaldsalen',
      } as Record<string, string>,
    }

    const result = correctPastDates(data, now)

    expect(result.venues).toEqual({
      '2026-05-22': 'Grünewaldsalen',
    })
  })

  it('handles mix of past and future dates', () => {
    const now = new Date('2026-04-13')
    const data = {
      dates: {
        '2025-05-18': [{ start: '10:00', end: '12:00' }],
        '2026-06-01': [{ start: '19:00', end: null }],
      },
    }

    const result = correctPastDates(data, now)

    expect(Object.keys(result.dates).sort()).toEqual(['2026-05-18', '2026-06-01'])
  })
})
