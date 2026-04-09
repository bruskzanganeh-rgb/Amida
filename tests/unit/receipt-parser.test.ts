import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures the variable is available when vi.mock runs
// ---------------------------------------------------------------------------

const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => {
  // Must be a proper constructor so `new Anthropic(...)` works
  function MockAnthropic() {
    return { messages: { create: mockCreate } }
  }
  return { default: MockAnthropic }
})

vi.mock('@/lib/ai/usage-logger', () => ({
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}))

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  ReceiptDataSchema,
  parseReceiptWithVision,
  parseReceiptWithText,
  fileToBase64,
  getMimeType,
} from '@/lib/receipt/parser'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validReceiptJson(overrides: Record<string, unknown> = {}) {
  return {
    date: '2025-03-15',
    supplier: 'ICA Maxi',
    amount: 345.5,
    currency: 'SEK',
    category: 'food',
    notes: 'Lunch',
    confidence: 0.95,
    ...overrides,
  }
}

function anthropicResponse(text: string) {
  return {
    content: [{ type: 'text', text }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

// ---------------------------------------------------------------------------
// 1. ReceiptDataSchema — Zod validation
// ---------------------------------------------------------------------------
describe('ReceiptDataSchema', () => {
  it('accepts a fully valid receipt object', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson())
    expect(result.success).toBe(true)
  })

  it('applies default currency SEK when omitted', () => {
    const receipt = validReceiptJson()
    delete (receipt as Record<string, unknown>).currency
    const result = ReceiptDataSchema.parse(receipt)
    expect(result.currency).toBe('SEK')
  })

  it('applies default category "other" when omitted', () => {
    const receipt = validReceiptJson()
    delete (receipt as Record<string, unknown>).category
    const result = ReceiptDataSchema.parse(receipt)
    expect(result.category).toBe('other')
  })

  it('allows null date', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson({ date: null }))
    expect(result.success).toBe(true)
  })

  it('rejects invalid date format', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson({ date: '15-03-2025' }))
    expect(result.success).toBe(false)
  })

  it('rejects date with slashes', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson({ date: '2025/03/15' }))
    expect(result.success).toBe(false)
  })

  it('rejects empty supplier', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson({ supplier: '' }))
    expect(result.success).toBe(false)
  })

  it('rejects negative amount', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson({ amount: -100 }))
    expect(result.success).toBe(false)
  })

  it('rejects zero amount', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson({ amount: 0 }))
    expect(result.success).toBe(false)
  })

  it('rejects unsupported currency', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson({ currency: 'JPY' }))
    expect(result.success).toBe(false)
  })

  it('accepts all supported currencies', () => {
    for (const currency of ['SEK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK']) {
      const result = ReceiptDataSchema.safeParse(validReceiptJson({ currency }))
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid category', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson({ category: 'Bilar' }))
    expect(result.success).toBe(false)
  })

  it('rejects legacy Swedish category values', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson({ category: 'Resa' }))
    expect(result.success).toBe(false)
  })

  it('accepts all valid English canonical categories', () => {
    const categories = [
      'travel',
      'food',
      'hotel',
      'instrument',
      'sheet_music',
      'equipment',
      'office',
      'phone',
      'subscription',
      'accounting',
      'loan',
      'bank',
      'insurance',
      'representation',
      'training',
      'interest',
      'subcontractor',
      'other',
    ]
    for (const category of categories) {
      const result = ReceiptDataSchema.safeParse(validReceiptJson({ category }))
      expect(result.success).toBe(true)
    }
  })

  it('allows notes to be omitted (optional)', () => {
    const receipt = validReceiptJson()
    delete (receipt as Record<string, unknown>).notes
    const result = ReceiptDataSchema.safeParse(receipt)
    expect(result.success).toBe(true)
  })

  it('rejects confidence below 0', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson({ confidence: -0.1 }))
    expect(result.success).toBe(false)
  })

  it('rejects confidence above 1', () => {
    const result = ReceiptDataSchema.safeParse(validReceiptJson({ confidence: 1.1 }))
    expect(result.success).toBe(false)
  })

  it('accepts confidence at boundaries 0 and 1', () => {
    expect(ReceiptDataSchema.safeParse(validReceiptJson({ confidence: 0 })).success).toBe(true)
    expect(ReceiptDataSchema.safeParse(validReceiptJson({ confidence: 1 })).success).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. parseReceiptWithVision
// ---------------------------------------------------------------------------
describe('parseReceiptWithVision', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('returns parsed receipt data from a clean JSON response', async () => {
    const receipt = validReceiptJson()
    mockCreate.mockResolvedValue(anthropicResponse(JSON.stringify(receipt)))

    const result = await parseReceiptWithVision('base64data', 'image/png')
    expect(result).toEqual(receipt)
  })

  it('strips ```json markdown fences from the response', async () => {
    const receipt = validReceiptJson()
    const wrappedText = '```json\n' + JSON.stringify(receipt) + '\n```'
    mockCreate.mockResolvedValue(anthropicResponse(wrappedText))

    const result = await parseReceiptWithVision('base64data', 'image/jpeg')
    expect(result).toEqual(receipt)
  })

  it('strips bare ``` markdown fences from the response', async () => {
    const receipt = validReceiptJson()
    const wrappedText = '```\n' + JSON.stringify(receipt) + '\n```'
    mockCreate.mockResolvedValue(anthropicResponse(wrappedText))

    const result = await parseReceiptWithVision('base64data', 'image/jpeg')
    expect(result).toEqual(receipt)
  })

  it('throws if the AI returns no text content', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'tool_use', id: 'x' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    await expect(parseReceiptWithVision('data', 'image/png')).rejects.toThrow('Kunde inte läsa kvitto')
  })

  it('throws with Zod message when AI returns invalid data', async () => {
    const invalidReceipt = { ...validReceiptJson(), amount: -5 }
    mockCreate.mockResolvedValue(anthropicResponse(JSON.stringify(invalidReceipt)))

    await expect(parseReceiptWithVision('data', 'image/png')).rejects.toThrow('Ogiltigt AI-svar')
  })

  it('throws when AI returns invalid JSON', async () => {
    mockCreate.mockResolvedValue(anthropicResponse('not valid json at all'))

    await expect(parseReceiptWithVision('data', 'image/png')).rejects.toThrow('Kunde inte läsa kvitto')
  })

  it('passes userId to logAiUsage', async () => {
    const { logAiUsage } = await import('@/lib/ai/usage-logger')
    const receipt = validReceiptJson()
    mockCreate.mockResolvedValue(anthropicResponse(JSON.stringify(receipt)))

    await parseReceiptWithVision('data', 'image/png', 'user-123')
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        usageType: 'receipt_scan_vision',
        userId: 'user-123',
      }),
    )
  })

  it('sends correct model and image payload to Anthropic', async () => {
    const receipt = validReceiptJson()
    mockCreate.mockResolvedValue(anthropicResponse(JSON.stringify(receipt)))

    await parseReceiptWithVision('myBase64', 'image/webp')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        temperature: 0,
        messages: expect.arrayContaining([
          expect.objectContaining({
            content: expect.arrayContaining([
              expect.objectContaining({
                type: 'image',
                source: expect.objectContaining({
                  type: 'base64',
                  media_type: 'image/webp',
                  data: 'myBase64',
                }),
              }),
            ]),
          }),
        ]),
      }),
    )
  })

  it('applies default currency and category from schema', async () => {
    const minimalReceipt = {
      date: '2025-01-01',
      supplier: 'Test Shop',
      amount: 100,
      confidence: 0.8,
    }
    mockCreate.mockResolvedValue(anthropicResponse(JSON.stringify(minimalReceipt)))

    const result = await parseReceiptWithVision('data', 'image/png')
    expect(result.currency).toBe('SEK')
    expect(result.category).toBe('other')
  })
})

// ---------------------------------------------------------------------------
// 3. parseReceiptWithText
// ---------------------------------------------------------------------------
describe('parseReceiptWithText', () => {
  beforeEach(() => {
    mockCreate.mockReset()
  })

  it('returns parsed receipt data from a clean JSON response', async () => {
    const receipt = validReceiptJson()
    mockCreate.mockResolvedValue(anthropicResponse(JSON.stringify(receipt)))

    const result = await parseReceiptWithText('Some receipt text')
    expect(result).toEqual(receipt)
  })

  it('strips ```json markdown fences from the response', async () => {
    const receipt = validReceiptJson()
    const wrappedText = '```json\n' + JSON.stringify(receipt) + '\n```'
    mockCreate.mockResolvedValue(anthropicResponse(wrappedText))

    const result = await parseReceiptWithText('receipt text')
    expect(result).toEqual(receipt)
  })

  it('strips bare ``` markdown fences from the response', async () => {
    const receipt = validReceiptJson()
    const wrappedText = '```\n' + JSON.stringify(receipt) + '\n```'
    mockCreate.mockResolvedValue(anthropicResponse(wrappedText))

    const result = await parseReceiptWithText('receipt text')
    expect(result).toEqual(receipt)
  })

  it('throws if the AI returns no text content', async () => {
    mockCreate.mockResolvedValue({
      content: [],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    await expect(parseReceiptWithText('receipt text')).rejects.toThrow('Kunde inte läsa kvitto')
  })

  it('throws with Zod message when AI returns invalid data', async () => {
    const invalidReceipt = { ...validReceiptJson(), supplier: '' }
    mockCreate.mockResolvedValue(anthropicResponse(JSON.stringify(invalidReceipt)))

    await expect(parseReceiptWithText('receipt text')).rejects.toThrow('Ogiltigt AI-svar')
  })

  it('throws when AI returns invalid JSON', async () => {
    mockCreate.mockResolvedValue(anthropicResponse('{broken json'))

    await expect(parseReceiptWithText('receipt text')).rejects.toThrow('Kunde inte läsa kvitto')
  })

  it('logs usage as receipt_scan_text type', async () => {
    const { logAiUsage } = await import('@/lib/ai/usage-logger')
    const receipt = validReceiptJson()
    mockCreate.mockResolvedValue(anthropicResponse(JSON.stringify(receipt)))

    await parseReceiptWithText('receipt text', 'user-456')
    expect(logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        usageType: 'receipt_scan_text',
        userId: 'user-456',
      }),
    )
  })

  it('sends text content as a string message (not image)', async () => {
    const receipt = validReceiptJson()
    mockCreate.mockResolvedValue(anthropicResponse(JSON.stringify(receipt)))

    await parseReceiptWithText('My receipt:\nTotal: 100 SEK')
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('My receipt:'),
          }),
        ],
      }),
    )
  })

  it('wraps generic errors with "Kunde inte läsa kvitto"', async () => {
    mockCreate.mockRejectedValue(new Error('Network timeout'))

    await expect(parseReceiptWithText('receipt')).rejects.toThrow('Kunde inte läsa kvitto: Network timeout')
  })

  it('wraps non-Error throws with "Okänt fel"', async () => {
    mockCreate.mockRejectedValue('string error')

    await expect(parseReceiptWithText('receipt')).rejects.toThrow('Kunde inte läsa kvitto: Okänt fel')
  })
})

// ---------------------------------------------------------------------------
// 4. getMimeType — pure function
// ---------------------------------------------------------------------------
describe('getMimeType', () => {
  it('returns image/jpeg for JPEG files', () => {
    const file = new File([''], 'photo.jpg', { type: 'image/jpeg' })
    expect(getMimeType(file)).toBe('image/jpeg')
  })

  it('returns image/png for PNG files', () => {
    const file = new File([''], 'photo.png', { type: 'image/png' })
    expect(getMimeType(file)).toBe('image/png')
  })

  it('returns image/gif for GIF files', () => {
    const file = new File([''], 'photo.gif', { type: 'image/gif' })
    expect(getMimeType(file)).toBe('image/gif')
  })

  it('returns image/webp for WebP files', () => {
    const file = new File([''], 'photo.webp', { type: 'image/webp' })
    expect(getMimeType(file)).toBe('image/webp')
  })

  it('defaults to image/jpeg for unknown/unsupported types', () => {
    const file = new File([''], 'document.pdf', { type: 'application/pdf' })
    expect(getMimeType(file)).toBe('image/jpeg')
  })

  it('defaults to image/jpeg when type is empty', () => {
    const file = new File([''], 'no-ext')
    expect(getMimeType(file)).toBe('image/jpeg')
  })

  it('defaults to image/jpeg for non-image MIME types', () => {
    const file = new File([''], 'video.mp4', { type: 'video/mp4' })
    expect(getMimeType(file)).toBe('image/jpeg')
  })
})

// ---------------------------------------------------------------------------
// 5. fileToBase64
// ---------------------------------------------------------------------------
describe('fileToBase64', () => {
  it('converts a simple text file to base64', async () => {
    const file = new File(['hello'], 'test.txt', { type: 'text/plain' })
    const result = await fileToBase64(file)
    expect(result).toBe(btoa('hello'))
  })

  it('converts an empty file to empty string', async () => {
    const file = new File([], 'empty.txt')
    const result = await fileToBase64(file)
    expect(result).toBe('')
  })

  it('handles binary data correctly', async () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 64])
    const file = new File([bytes], 'binary.bin')
    const result = await fileToBase64(file)
    // Verify it decodes back to the same bytes
    const decoded = atob(result)
    expect(decoded.length).toBe(6)
    expect(decoded.charCodeAt(0)).toBe(0)
    expect(decoded.charCodeAt(3)).toBe(255)
    expect(decoded.charCodeAt(4)).toBe(128)
    expect(decoded.charCodeAt(5)).toBe(64)
  })

  it('returns valid base64 string', async () => {
    const file = new File(['test content here'], 'test.txt')
    const result = await fileToBase64(file)
    // Should only contain base64 characters
    expect(result).toMatch(/^[A-Za-z0-9+/]*={0,2}$/)
  })
})
