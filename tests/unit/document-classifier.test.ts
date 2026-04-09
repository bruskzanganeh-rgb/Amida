import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock external dependencies BEFORE importing modules under test
// ---------------------------------------------------------------------------

// Use vi.hoisted so mock references are available inside vi.mock factories
const { mockCreate, mockFrom } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockFrom: vi.fn(),
}))

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  const MockAnthropic = function () {
    return { messages: { create: mockCreate } }
  }
  return { default: MockAnthropic }
})

// Mock unpdf
vi.mock('unpdf', () => ({
  extractText: vi.fn(),
  renderPageAsImage: vi.fn(),
}))

// Mock AI usage logger
vi.mock('@/lib/ai/usage-logger', () => ({
  logAiUsage: vi.fn().mockResolvedValue(undefined),
}))

// Mock Supabase server client (used by client-matcher)
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}))

// Mock fastest-levenshtein with a real implementation for accurate tests
vi.mock('fastest-levenshtein', () => ({
  distance: (a: string, b: string): number => {
    // Simple Levenshtein distance implementation
    const m = a.length
    const n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      }
    }
    return dp[m][n]
  },
}))

// ---------------------------------------------------------------------------
// Import modules under test
// ---------------------------------------------------------------------------

// We need to import the private functions via a workaround:
// parseAIResponse and sanitizeFilename are not exported, so we test them
// indirectly through the exported functions. However, we CAN test the
// exported functions: classifyDocument, classifyPdfDocument,
// classifyImageDocument, fileToBase64, getImageMimeType.

import {
  classifyPdfDocument,
  classifyImageDocument,
  classifyDocument,
  fileToBase64,
  getImageMimeType,
} from '@/lib/import/document-classifier'
import type { ExpenseData, InvoiceData } from '@/lib/import/document-classifier'

import { matchClient } from '@/lib/import/client-matcher'

import { extractText, renderPageAsImage } from 'unpdf'

// ===========================================================================
// Helpers
// ===========================================================================

/** Build a mock Anthropic Message response */
function makeMockMessage(jsonResponse: Record<string, unknown>) {
  return {
    content: [{ type: 'text', text: JSON.stringify(jsonResponse) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  }
}

/** Build an expense classification response */
function makeExpenseResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: 'expense',
    confidence: 0.95,
    data: {
      date: '2025-03-15',
      supplier: 'SJ AB',
      subtotal: 200,
      vatRate: 6,
      vatAmount: 12,
      total: 212,
      currency: 'SEK',
      category: 'travel',
      notes: 'Tågresa Stockholm-Göteborg',
      ...((overrides.data as Record<string, unknown>) || {}),
    },
    suggestedFilename: '2025-03-15_SJ_Tagresa',
    ...overrides,
  }
}

/** Build an invoice classification response */
function makeInvoiceResponse(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    type: 'invoice',
    confidence: 0.9,
    data: {
      invoiceNumber: 127,
      clientName: 'Konserthuset',
      invoiceDate: '2025-03-20',
      dueDate: '2025-04-20',
      subtotal: 10000,
      vatRate: 25,
      vatAmount: 2500,
      total: 12500,
      ...((overrides.data as Record<string, unknown>) || {}),
    },
    suggestedFilename: '2025-03-20_Konserthuset_Faktura127',
    ...overrides,
  }
}

/** Create a mock File object */
function createMockFile(content: string | ArrayBuffer, name: string, type: string): File {
  const blob = new Blob([content], { type })
  return new File([blob], name, { type })
}

// ===========================================================================
// document-classifier.ts — getImageMimeType
// ===========================================================================
describe('getImageMimeType', () => {
  it('returns image/jpeg for JPEG files', () => {
    const file = createMockFile('', 'photo.jpg', 'image/jpeg')
    expect(getImageMimeType(file)).toBe('image/jpeg')
  })

  it('returns image/png for PNG files', () => {
    const file = createMockFile('', 'screenshot.png', 'image/png')
    expect(getImageMimeType(file)).toBe('image/png')
  })

  it('returns image/gif for GIF files', () => {
    const file = createMockFile('', 'animation.gif', 'image/gif')
    expect(getImageMimeType(file)).toBe('image/gif')
  })

  it('returns image/webp for WebP files', () => {
    const file = createMockFile('', 'photo.webp', 'image/webp')
    expect(getImageMimeType(file)).toBe('image/webp')
  })

  it('returns null for PDF files', () => {
    const file = createMockFile('', 'document.pdf', 'application/pdf')
    expect(getImageMimeType(file)).toBeNull()
  })

  it('returns null for text files', () => {
    const file = createMockFile('', 'readme.txt', 'text/plain')
    expect(getImageMimeType(file)).toBeNull()
  })

  it('returns null for SVG files', () => {
    const file = createMockFile('', 'icon.svg', 'image/svg+xml')
    expect(getImageMimeType(file)).toBeNull()
  })

  it('returns null for TIFF files', () => {
    const file = createMockFile('', 'scan.tiff', 'image/tiff')
    expect(getImageMimeType(file)).toBeNull()
  })

  it('returns null for empty mime type', () => {
    const file = createMockFile('', 'unknown', '')
    expect(getImageMimeType(file)).toBeNull()
  })
})

// ===========================================================================
// document-classifier.ts — fileToBase64
// ===========================================================================
describe('fileToBase64', () => {
  it('converts a file with ASCII content to base64', async () => {
    const file = createMockFile('Hello, World!', 'test.txt', 'text/plain')
    const result = await fileToBase64(file)
    expect(result).toBe(btoa('Hello, World!'))
  })

  it('converts an empty file to empty base64', async () => {
    const file = createMockFile('', 'empty.txt', 'text/plain')
    const result = await fileToBase64(file)
    expect(result).toBe('')
  })

  it('handles binary-like content', async () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 64])
    const file = createMockFile(bytes.buffer, 'binary.bin', 'application/octet-stream')
    const result = await fileToBase64(file)
    // Verify it is valid base64
    expect(() => atob(result)).not.toThrow()
  })
})

// ===========================================================================
// document-classifier.ts — classifyImageDocument (tests parseAIResponse indirectly)
// ===========================================================================
describe('classifyImageDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('classifies an expense image correctly', async () => {
    const response = makeExpenseResponse()
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'kvitto.jpg')

    expect(result.type).toBe('expense')
    expect(result.confidence).toBe(0.95)
    const data = result.data as ExpenseData
    expect(data.supplier).toBe('SJ AB')
    expect(data.total).toBe(212)
    expect(data.vatRate).toBe(6)
    expect(data.currency).toBe('SEK')
    expect(data.category).toBe('travel')
  })

  it('classifies an invoice image correctly', async () => {
    const response = makeInvoiceResponse()
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/png', 'faktura.png')

    expect(result.type).toBe('invoice')
    expect(result.confidence).toBe(0.9)
    const data = result.data as InvoiceData
    expect(data.invoiceNumber).toBe(127)
    expect(data.clientName).toBe('Konserthuset')
    expect(data.total).toBe(12500)
  })

  it('sanitizes the suggested filename', async () => {
    const response = makeExpenseResponse({
      suggestedFilename: '2025-03-15_SJ_Tåg:resa/"test"',
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')

    // Should remove <, >, :, ", /, \, |, ?, *
    // Should replace å with a, spaces with -
    expect(result.suggestedFilename).not.toContain(':')
    expect(result.suggestedFilename).not.toContain('"')
    expect(result.suggestedFilename).not.toContain('/')
  })

  it('truncates long suggested filenames to 50 characters', async () => {
    const longName = 'A'.repeat(100)
    const response = makeExpenseResponse({ suggestedFilename: longName })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')

    expect(result.suggestedFilename.length).toBeLessThanOrEqual(50)
  })

  it('replaces Swedish characters in filenames', async () => {
    const response = makeExpenseResponse({
      suggestedFilename: '2025_Övrig_Ärende_Åtgärd',
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')

    expect(result.suggestedFilename).not.toContain('Ö')
    expect(result.suggestedFilename).not.toContain('Ä')
    expect(result.suggestedFilename).not.toContain('Å')
    expect(result.suggestedFilename).not.toContain('ö')
    expect(result.suggestedFilename).not.toContain('ä')
    expect(result.suggestedFilename).not.toContain('å')
  })

  it('replaces whitespace with hyphens in filenames', async () => {
    const response = makeExpenseResponse({
      suggestedFilename: '2025 03 15 SJ   Tågresa',
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')

    expect(result.suggestedFilename).not.toContain(' ')
    // Multiple spaces should become single hyphen
    expect(result.suggestedFilename).not.toContain('--')
  })

  it('handles markdown-wrapped JSON in AI response', async () => {
    const response = makeExpenseResponse()
    const wrappedMessage = {
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(response) + '\n```' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }
    mockCreate.mockResolvedValueOnce(wrappedMessage)

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')

    expect(result.type).toBe('expense')
    expect(result.confidence).toBe(0.95)
  })

  it('handles generic markdown code block in AI response', async () => {
    const response = makeExpenseResponse()
    const wrappedMessage = {
      content: [{ type: 'text', text: '```\n' + JSON.stringify(response) + '\n```' }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }
    mockCreate.mockResolvedValueOnce(wrappedMessage)

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')

    expect(result.type).toBe('expense')
  })

  it('throws when AI returns no text content', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'tool_use', id: 'x', name: 'y', input: {} }],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow(
      'Inget svar från Claude',
    )
  })

  it('throws when AI returns empty content array', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [],
      usage: { input_tokens: 10, output_tokens: 5 },
    })

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow(
      'Inget svar från Claude',
    )
  })

  it('throws when API call fails', async () => {
    mockCreate.mockRejectedValueOnce(new Error('API rate limit'))

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow(
      'Kunde inte klassificera bild',
    )
  })

  it('wraps non-Error exceptions in the error message', async () => {
    mockCreate.mockRejectedValueOnce('string error')

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow('Okänt fel')
  })
})

// ===========================================================================
// document-classifier.ts — parseAIResponse data preprocessing (expense)
// ===========================================================================
describe('parseAIResponse — expense preprocessing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets default supplier when supplier is null', async () => {
    const response = makeExpenseResponse({
      data: { ...makeExpenseResponse().data, supplier: null },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.supplier).toBe('Okänd leverantör')
  })

  it('sets default supplier when supplier is empty string', async () => {
    const response = makeExpenseResponse({
      data: { ...makeExpenseResponse().data, supplier: '' },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.supplier).toBe('Okänd leverantör')
  })

  it('sets default currency to SEK when missing', async () => {
    const response = makeExpenseResponse({
      data: { ...makeExpenseResponse().data, currency: null },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.currency).toBe('SEK')
  })

  it('sets default category to "other" when missing', async () => {
    const response = makeExpenseResponse({
      data: { ...makeExpenseResponse().data, category: null },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.category).toBe('other')
  })

  it('calculates subtotal and vatAmount from total when only total is provided', async () => {
    const response = makeExpenseResponse({
      data: {
        date: '2025-03-15',
        supplier: 'ICA',
        subtotal: null,
        vatRate: 25,
        vatAmount: null,
        total: 125,
        currency: 'SEK',
        category: 'food',
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.subtotal).toBe(100)
    expect(data.vatAmount).toBe(25)
    expect(data.total).toBe(125)
  })

  it('uses both subtotal and vatAmount when provided', async () => {
    const response = makeExpenseResponse({
      data: {
        date: '2025-03-15',
        supplier: 'Coop',
        subtotal: 80,
        vatRate: 12,
        vatAmount: 9.6,
        total: 89.6,
        currency: 'SEK',
        category: 'food',
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.subtotal).toBe(80)
    expect(data.vatAmount).toBe(9.6)
    expect(data.total).toBe(89.6)
  })

  it('sets zeros when total is 0 and subtotal/vatAmount are missing', async () => {
    const response = makeExpenseResponse({
      data: {
        date: '2025-03-15',
        supplier: 'Test',
        subtotal: null,
        vatRate: 25,
        vatAmount: null,
        total: 0,
        currency: 'SEK',
        category: 'other',
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.subtotal).toBe(0)
    expect(data.vatAmount).toBe(0)
    expect(data.total).toBe(0)
  })

  it('defaults vatRate to 25 when missing', async () => {
    const response = makeExpenseResponse({
      data: {
        date: '2025-03-15',
        supplier: 'Test',
        subtotal: null,
        vatRate: null,
        vatAmount: null,
        total: 125,
        currency: 'SEK',
        category: 'other',
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.vatRate).toBe(25)
    // With 25% vat: 125 / 1.25 = 100
    expect(data.subtotal).toBe(100)
    expect(data.vatAmount).toBe(25)
  })

  it('handles legacy "amount" field by converting to total', async () => {
    const response = {
      type: 'expense',
      confidence: 0.9,
      data: {
        date: '2025-03-15',
        supplier: 'SJ',
        amount: 250,
        subtotal: null,
        vatRate: 6,
        vatAmount: null,
        total: null,
        currency: 'SEK',
        category: 'travel',
      },
      suggestedFilename: '2025-03-15_SJ_Resa',
    }
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    // total should come from amount field: 250
    expect(data.total).toBe(250)
    // subtotal = 250 / 1.06 ≈ 235.85
    expect(data.subtotal).toBeCloseTo(235.85, 1)
    expect(data.vatAmount).toBeCloseTo(14.15, 1)
  })

  it('calculates VAT correctly with 6% rate', async () => {
    const response = makeExpenseResponse({
      data: {
        date: '2025-01-10',
        supplier: 'Bokhandeln',
        subtotal: null,
        vatRate: 6,
        vatAmount: null,
        total: 106,
        currency: 'SEK',
        category: 'sheet_music',
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.subtotal).toBe(100)
    expect(data.vatAmount).toBe(6)
    expect(data.vatRate).toBe(6)
  })

  it('calculates VAT correctly with 12% rate', async () => {
    const response = makeExpenseResponse({
      data: {
        date: '2025-01-10',
        supplier: 'Restaurang',
        subtotal: null,
        vatRate: 12,
        vatAmount: null,
        total: 112,
        currency: 'SEK',
        category: 'food',
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.subtotal).toBe(100)
    expect(data.vatAmount).toBe(12)
    expect(data.vatRate).toBe(12)
  })

  it('handles 0% VAT rate correctly', async () => {
    const response = makeExpenseResponse({
      data: {
        date: '2025-01-10',
        supplier: 'Foreign Shop',
        subtotal: null,
        vatRate: 0,
        vatAmount: null,
        total: 100,
        currency: 'EUR',
        category: 'equipment',
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.subtotal).toBe(100)
    expect(data.vatAmount).toBe(0)
    expect(data.vatRate).toBe(0)
  })
})

// ===========================================================================
// document-classifier.ts — parseAIResponse data preprocessing (invoice)
// ===========================================================================
describe('parseAIResponse — invoice preprocessing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('converts string invoiceNumber to integer', async () => {
    const response = makeInvoiceResponse({
      data: {
        ...makeInvoiceResponse().data,
        invoiceNumber: 'INV-0042',
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'faktura.jpg')
    const data = result.data as InvoiceData
    expect(data.invoiceNumber).toBe(42)
  })

  it('converts string invoiceNumber with only digits', async () => {
    const response = makeInvoiceResponse({
      data: {
        ...makeInvoiceResponse().data,
        invoiceNumber: '127',
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'faktura.jpg')
    const data = result.data as InvoiceData
    expect(data.invoiceNumber).toBe(127)
  })

  it('defaults invoiceNumber to 0 when string has no digits', async () => {
    const response = makeInvoiceResponse({
      data: {
        ...makeInvoiceResponse().data,
        invoiceNumber: 'N/A',
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'faktura.jpg')
    const data = result.data as InvoiceData
    expect(data.invoiceNumber).toBe(0)
  })

  it('defaults invoiceNumber to 0 when null', async () => {
    const response = makeInvoiceResponse({
      data: {
        ...makeInvoiceResponse().data,
        invoiceNumber: null,
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'faktura.jpg')
    const data = result.data as InvoiceData
    expect(data.invoiceNumber).toBe(0)
  })

  it('defaults clientName to "Okänd kund" when empty', async () => {
    const response = makeInvoiceResponse({
      data: {
        ...makeInvoiceResponse().data,
        clientName: '',
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'faktura.jpg')
    const data = result.data as InvoiceData
    expect(data.clientName).toBe('Okänd kund')
  })

  it('defaults clientName to "Okänd kund" when null', async () => {
    const response = makeInvoiceResponse({
      data: {
        ...makeInvoiceResponse().data,
        clientName: null,
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'faktura.jpg')
    const data = result.data as InvoiceData
    expect(data.clientName).toBe('Okänd kund')
  })

  it('defaults numeric fields to 0 when null', async () => {
    const response = makeInvoiceResponse({
      data: {
        invoiceNumber: 1,
        clientName: 'Test',
        invoiceDate: '2025-01-01',
        dueDate: '2025-02-01',
        subtotal: null,
        vatRate: null,
        vatAmount: null,
        total: null,
      },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'faktura.jpg')
    const data = result.data as InvoiceData
    expect(data.subtotal).toBe(0)
    expect(data.vatRate).toBe(25) // defaults to 25
    expect(data.vatAmount).toBe(0)
    expect(data.total).toBe(0)
  })
})

// ===========================================================================
// document-classifier.ts — classifyPdfDocument
// ===========================================================================
describe('classifyPdfDocument', () => {
  const mockedExtractText = vi.mocked(extractText)
  const mockedRenderPage = vi.mocked(renderPageAsImage)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses text extraction when PDF has enough text', async () => {
    mockedExtractText.mockResolvedValueOnce({
      text: ['Kvitto från SJ AB\nDatum: 2025-03-15\nTotalt: 212 SEK'],
      totalPages: 1,
    } as unknown)

    const response = makeExpenseResponse()
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const buffer = new ArrayBuffer(10)
    const result = await classifyPdfDocument(buffer, 'kvitto.pdf')

    expect(result.type).toBe('expense')
    expect(mockedExtractText).toHaveBeenCalledTimes(1)
    expect(mockedRenderPage).not.toHaveBeenCalled()
  })

  it('falls back to vision when text extraction yields too little text', async () => {
    mockedExtractText.mockResolvedValueOnce({
      text: ['short'],
      totalPages: 1,
    } as unknown)

    // renderPageAsImage returns an ArrayBuffer
    const imageBuffer = new ArrayBuffer(4)
    mockedRenderPage.mockResolvedValueOnce(imageBuffer as unknown)

    const response = makeExpenseResponse()
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const buffer = new ArrayBuffer(10)
    const result = await classifyPdfDocument(buffer, 'scan.pdf')

    expect(result.type).toBe('expense')
    expect(mockedRenderPage).toHaveBeenCalledTimes(1)
  })

  it('falls back to vision when text extraction throws', async () => {
    mockedExtractText.mockRejectedValueOnce(new Error('PDF parse error'))

    const imageBuffer = new ArrayBuffer(4)
    mockedRenderPage.mockResolvedValueOnce(imageBuffer as unknown)

    const response = makeExpenseResponse()
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const buffer = new ArrayBuffer(10)
    const result = await classifyPdfDocument(buffer, 'corrupt.pdf')

    expect(result.type).toBe('expense')
    expect(mockedRenderPage).toHaveBeenCalledTimes(1)
  })

  it('throws when both text extraction and vision fail', async () => {
    mockedExtractText.mockRejectedValueOnce(new Error('Text parse error'))
    mockedRenderPage.mockRejectedValueOnce(new Error('Render error'))

    const buffer = new ArrayBuffer(10)
    await expect(classifyPdfDocument(buffer, 'broken.pdf')).rejects.toThrow('Kunde inte analysera PDF')
  })

  it('falls back to vision when extracted text is empty', async () => {
    mockedExtractText.mockResolvedValueOnce({
      text: [''],
      totalPages: 1,
    } as unknown)

    const imageBuffer = new ArrayBuffer(4)
    mockedRenderPage.mockResolvedValueOnce(imageBuffer as unknown)

    const response = makeInvoiceResponse()
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const buffer = new ArrayBuffer(10)
    const result = await classifyPdfDocument(buffer, 'scanned-invoice.pdf')

    expect(result.type).toBe('invoice')
    expect(mockedRenderPage).toHaveBeenCalled()
  })

  it('falls back to vision when extracted text is only whitespace', async () => {
    mockedExtractText.mockResolvedValueOnce({
      text: ['   \n\t  '],
      totalPages: 1,
    } as unknown)

    const imageBuffer = new ArrayBuffer(4)
    mockedRenderPage.mockResolvedValueOnce(imageBuffer as unknown)

    const response = makeExpenseResponse()
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const buffer = new ArrayBuffer(10)
    const result = await classifyPdfDocument(buffer, 'whitespace.pdf')

    expect(result.type).toBe('expense')
    expect(mockedRenderPage).toHaveBeenCalled()
  })
})

// ===========================================================================
// document-classifier.ts — classifyDocument (main entry point)
// ===========================================================================
describe('classifyDocument', () => {
  const mockedExtractText = vi.mocked(extractText)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes PDF files to classifyPdfDocument', async () => {
    mockedExtractText.mockResolvedValueOnce({
      text: ['Kvitto från Spotify\nTotal: 99 SEK'],
      totalPages: 1,
    } as unknown)

    const response = makeExpenseResponse()
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const file = createMockFile('fake-pdf-content', 'receipt.pdf', 'application/pdf')
    const result = await classifyDocument(file)

    expect(result.type).toBe('expense')
    expect(mockedExtractText).toHaveBeenCalled()
  })

  it('routes JPEG files to classifyImageDocument', async () => {
    const response = makeExpenseResponse()
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const file = createMockFile('fake-image', 'receipt.jpg', 'image/jpeg')
    const result = await classifyDocument(file)

    expect(result.type).toBe('expense')
    expect(mockCreate).toHaveBeenCalledTimes(1)
    // Verify that the message was sent with image content
    const callArgs = mockCreate.mock.calls[0][0]
    expect(callArgs.messages[0].content[0].type).toBe('image')
  })

  it('routes PNG files to classifyImageDocument', async () => {
    const response = makeInvoiceResponse()
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const file = createMockFile('fake-image', 'faktura.png', 'image/png')
    const result = await classifyDocument(file)

    expect(result.type).toBe('invoice')
  })

  it('routes WebP files to classifyImageDocument', async () => {
    const response = makeExpenseResponse()
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const file = createMockFile('fake-image', 'receipt.webp', 'image/webp')
    const result = await classifyDocument(file)

    expect(result.type).toBe('expense')
  })

  it('throws for unsupported file types', async () => {
    const file = createMockFile('text content', 'document.txt', 'text/plain')

    await expect(classifyDocument(file)).rejects.toThrow('Filtypen text/plain stöds inte')
  })

  it('throws for Excel files', async () => {
    const file = createMockFile('', 'data.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

    await expect(classifyDocument(file)).rejects.toThrow('stöds inte')
  })

  it('error message suggests supported formats', async () => {
    const file = createMockFile(
      '',
      'doc.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )

    await expect(classifyDocument(file)).rejects.toThrow('Använd PDF eller bild (JPEG/PNG/WebP)')
  })
})

// ===========================================================================
// document-classifier.ts — Zod schema validation
// ===========================================================================
describe('Zod schema validation via classifyImageDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects invalid confidence values above 1', async () => {
    const response = makeExpenseResponse({ confidence: 1.5 })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow()
  })

  it('rejects negative confidence values', async () => {
    const response = makeExpenseResponse({ confidence: -0.1 })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow()
  })

  it('rejects invalid document type', async () => {
    const response = { ...makeExpenseResponse(), type: 'receipt' }
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow()
  })

  it('rejects invalid currency', async () => {
    const response = makeExpenseResponse({
      data: { ...makeExpenseResponse().data, currency: 'JPY' },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow()
  })

  it('rejects invalid category', async () => {
    const response = makeExpenseResponse({
      data: { ...makeExpenseResponse().data, category: 'Bilar' },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow()
  })

  it('rejects invalid date format', async () => {
    const response = makeExpenseResponse({
      data: { ...makeExpenseResponse().data, date: '15/03/2025' },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow()
  })

  it('allows null date', async () => {
    const response = makeExpenseResponse({
      data: { ...makeExpenseResponse().data, date: null },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
    const data = result.data as ExpenseData
    expect(data.date).toBeNull()
  })

  it('rejects negative total', async () => {
    const response = makeExpenseResponse({
      data: { ...makeExpenseResponse().data, subtotal: 100, vatAmount: 25, total: -125 },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow()
  })

  it('accepts all valid currencies', async () => {
    for (const currency of ['SEK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK']) {
      vi.clearAllMocks()
      const response = makeExpenseResponse({
        data: { ...makeExpenseResponse().data, currency },
      })
      mockCreate.mockResolvedValueOnce(makeMockMessage(response))

      const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
      const data = result.data as ExpenseData
      expect(data.currency).toBe(currency)
    }
  })

  it('accepts all valid categories', async () => {
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
      'other',
    ]
    for (const category of categories) {
      vi.clearAllMocks()
      const response = makeExpenseResponse({
        data: { ...makeExpenseResponse().data, category },
      })
      mockCreate.mockResolvedValueOnce(makeMockMessage(response))

      const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
      const data = result.data as ExpenseData
      expect(data.category).toBe(category)
    }
  })

  it('rejects invalid vatRate', async () => {
    const response = makeExpenseResponse({
      data: { ...makeExpenseResponse().data, subtotal: 100, vatRate: 10, vatAmount: 10, total: 110 },
    })
    mockCreate.mockResolvedValueOnce(makeMockMessage(response))

    await expect(classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')).rejects.toThrow()
  })

  it('accepts all valid vatRate values', async () => {
    for (const vatRate of [0, 6, 12, 25]) {
      vi.clearAllMocks()
      const total = 100
      const subtotal = Math.round((total / (1 + vatRate / 100)) * 100) / 100
      const vatAmount = Math.round((total - subtotal) * 100) / 100
      const response = makeExpenseResponse({
        data: {
          ...makeExpenseResponse().data,
          subtotal,
          vatRate,
          vatAmount,
          total,
        },
      })
      mockCreate.mockResolvedValueOnce(makeMockMessage(response))

      const result = await classifyImageDocument('base64data', 'image/jpeg', 'receipt.jpg')
      const data = result.data as ExpenseData
      expect(data.vatRate).toBe(vatRate)
    }
  })
})

// ===========================================================================
// client-matcher.ts — calculateSimilarity (tested indirectly through matchClient)
// ===========================================================================
// Since calculateSimilarity, extractTokens, and tokenBasedSimilarity are private,
// we test them indirectly through matchClient. But we can also verify the logic
// patterns directly.

describe('client-matcher — calculateSimilarity logic', () => {
  // We replicate the function logic here for unit testing since it's not exported
  function calculateSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length)
    if (maxLen === 0) return 1
    // Simple Levenshtein
    const a = str1.toLowerCase()
    const b = str2.toLowerCase()
    const m = a.length
    const n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      }
    }
    const dist = dp[m][n]
    return 1 - dist / maxLen
  }

  it('returns 1 for identical strings', () => {
    expect(calculateSimilarity('Konserthuset', 'Konserthuset')).toBe(1)
  })

  it('returns 1 for two empty strings', () => {
    expect(calculateSimilarity('', '')).toBe(1)
  })

  it('is case-insensitive', () => {
    expect(calculateSimilarity('ABC', 'abc')).toBe(1)
  })

  it('returns 0 for completely different single chars', () => {
    expect(calculateSimilarity('a', 'b')).toBe(0)
  })

  it('returns high similarity for small edit distance', () => {
    const sim = calculateSimilarity('Konserthuset', 'Konserhuset')
    expect(sim).toBeGreaterThan(0.9)
  })

  it('returns low similarity for very different strings', () => {
    const sim = calculateSimilarity('Apple', 'Microsoft')
    expect(sim).toBeLessThan(0.5)
  })
})

// ===========================================================================
// client-matcher — extractTokens logic
// ===========================================================================
describe('client-matcher — extractTokens logic', () => {
  // Replicate for unit testing since not exported
  function extractTokens(name: string): string[] {
    const ignore = ['ab', 'hb', 'kb', 'the', 'i', 'of', 'and', 'för', 'och']
    return name
      .toLowerCase()
      .replace(/[^a-zåäö0-9\s]/g, '')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !ignore.includes(token))
  }

  it('lowercases and splits by whitespace', () => {
    const tokens = extractTokens('Göteborgs Symfoniker')
    expect(tokens).toContain('göteborgs')
    expect(tokens).toContain('symfoniker')
  })

  it('removes short tokens (length <= 2)', () => {
    const tokens = extractTokens('SJ AB')
    // "sj" is length 2 -> filtered, "ab" is ignored
    expect(tokens).toHaveLength(0)
  })

  it('removes common company suffixes from tokens', () => {
    const tokens = extractTokens('Musikhuset AB')
    expect(tokens).not.toContain('ab')
    expect(tokens).toContain('musikhuset')
  })

  it('removes Swedish stop words', () => {
    const tokens = extractTokens('Förening för Musik och Dans')
    expect(tokens).not.toContain('för')
    expect(tokens).not.toContain('och')
    expect(tokens).toContain('förening')
    expect(tokens).toContain('musik')
    expect(tokens).toContain('dans')
  })

  it('removes English stop words', () => {
    const tokens = extractTokens('The Royal Academy of Music')
    expect(tokens).not.toContain('the')
    expect(tokens).not.toContain('of')
    expect(tokens).toContain('royal')
    expect(tokens).toContain('academy')
    expect(tokens).toContain('music')
  })

  it('removes punctuation', () => {
    const tokens = extractTokens('Konsert & Kongress, AB')
    expect(tokens).toContain('konsert')
    expect(tokens).toContain('kongress')
    expect(tokens).not.toContain('&')
  })

  it('handles empty string', () => {
    const tokens = extractTokens('')
    expect(tokens).toHaveLength(0)
  })

  it('preserves Swedish characters å, ä, ö', () => {
    const tokens = extractTokens('Örebro Konserthus')
    expect(tokens).toContain('örebro')
    expect(tokens).toContain('konserthus')
  })
})

// ===========================================================================
// client-matcher — tokenBasedSimilarity logic
// ===========================================================================
describe('client-matcher — tokenBasedSimilarity logic', () => {
  // Replicate for testing
  function calculateSimilarity(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length)
    if (maxLen === 0) return 1
    const a = str1.toLowerCase()
    const b = str2.toLowerCase()
    const m = a.length
    const n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      }
    }
    return 1 - dp[m][n] / maxLen
  }

  function extractTokens(name: string): string[] {
    const ignore = ['ab', 'hb', 'kb', 'the', 'i', 'of', 'and', 'för', 'och']
    return name
      .toLowerCase()
      .replace(/[^a-zåäö0-9\s]/g, '')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !ignore.includes(token))
  }

  function tokenBasedSimilarity(name1: string, name2: string): number {
    const tokens1 = extractTokens(name1)
    const tokens2 = extractTokens(name2)
    if (tokens1.length === 0 || tokens2.length === 0) return 0
    let matches = 0
    for (const token1 of tokens1) {
      for (const token2 of tokens2) {
        if (calculateSimilarity(token1, token2) > 0.8) {
          matches++
          break
        }
      }
    }
    return matches / Math.max(tokens1.length, tokens2.length)
  }

  it('returns 1 for identical multi-word names', () => {
    expect(tokenBasedSimilarity('Göteborgs Symfoniker', 'Göteborgs Symfoniker')).toBe(1)
  })

  it('returns high similarity when key tokens match despite different suffixes', () => {
    const sim = tokenBasedSimilarity('Göteborgs Symfoniker AB', 'Göteborgs Symfoniker')
    expect(sim).toBe(1)
  })

  it('returns 0 when one name has no significant tokens', () => {
    expect(tokenBasedSimilarity('AB', 'Göteborgs Symfoniker')).toBe(0)
  })

  it('returns 0 when both names have no significant tokens', () => {
    expect(tokenBasedSimilarity('AB', 'HB')).toBe(0)
  })

  it('handles partial token overlap', () => {
    const sim = tokenBasedSimilarity('Kungliga Filharmonikerna Stockholm', 'Kungliga Operan Stockholm')
    // "kungliga" and "stockholm" match, "filharmonikerna" vs "operan" don't
    // 2 matches / max(3, 3) = 0.667
    expect(sim).toBeCloseTo(0.667, 1)
  })

  it('matches tokens with small typos (similarity > 0.8)', () => {
    const sim = tokenBasedSimilarity('Konserthuset', 'Konserhuset')
    // Both have a single token; "konserthuset" vs "konserhuset" similarity > 0.8
    expect(sim).toBe(1)
  })

  it('does not match tokens with large differences', () => {
    const sim = tokenBasedSimilarity('Apple Music', 'Microsoft Office')
    expect(sim).toBe(0)
  })
})

// ===========================================================================
// client-matcher — matchClient (integration with Supabase mock)
// ===========================================================================
describe('matchClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockClients = [
    { id: 'c1', name: 'Göteborgs Symfoniker', client_code: 'GSO' },
    { id: 'c2', name: 'Kungliga Filharmonikerna', client_code: 'KF' },
    { id: 'c3', name: 'Malmö Opera', client_code: 'MO' },
    { id: 'c4', name: 'Stockholms Konserthus', client_code: 'SK' },
    { id: 'c5', name: 'Norrlandsoperan', client_code: 'NO' },
  ]

  function setupMockClients(clients: typeof mockClients) {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: clients, error: null }),
      }),
    })
  }

  it('returns exact match with confidence 1.0', async () => {
    setupMockClients(mockClients)

    const result = await matchClient('Göteborgs Symfoniker')

    expect(result.clientId).toBe('c1')
    expect(result.confidence).toBe(1.0)
    expect(result.matchMethod).toBe('exact')
    expect(result.suggestions).toHaveLength(0)
  })

  it('exact match is case-insensitive', async () => {
    setupMockClients(mockClients)

    const result = await matchClient('göteborgs symfoniker')

    expect(result.clientId).toBe('c1')
    expect(result.confidence).toBe(1.0)
    expect(result.matchMethod).toBe('exact')
  })

  it('exact match trims whitespace', async () => {
    setupMockClients(mockClients)

    const result = await matchClient('  Göteborgs Symfoniker  ')

    expect(result.clientId).toBe('c1')
    expect(result.confidence).toBe(1.0)
    expect(result.matchMethod).toBe('exact')
  })

  it('returns fuzzy match when similarity >= 0.85', async () => {
    setupMockClients(mockClients)

    // "Göteborgs Symfonikr" is very close to "Göteborgs Symfoniker" (one char missing)
    const result = await matchClient('Göteborgs Symfonikr')

    expect(result.clientId).toBe('c1')
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
    expect(result.matchMethod).toBe('fuzzy')
  })

  it('fuzzy match includes other suggestions above 0.7 similarity', async () => {
    setupMockClients(mockClients)

    // Something close to "Malmö Opera" but not exact
    const result = await matchClient('Malmö Opra')

    expect(result.clientId).toBe('c3')
    expect(result.confidence).toBeGreaterThanOrEqual(0.85)
    expect(result.matchMethod).toBe('fuzzy')
  })

  it('returns no match when no clients exist', async () => {
    setupMockClients([])

    const result = await matchClient('Whatever Company')

    expect(result.clientId).toBeNull()
    expect(result.confidence).toBe(0)
    expect(result.suggestions).toHaveLength(0)
  })

  it('returns no match with suggestions for completely different name', async () => {
    setupMockClients(mockClients)

    const result = await matchClient('ACME Corporation International')

    expect(result.clientId).toBeNull()
    expect(result.confidence).toBe(0)
    expect(result.matchMethod).toBe('manual')
    // Should have up to 5 suggestions
    expect(result.suggestions.length).toBeGreaterThan(0)
    expect(result.suggestions.length).toBeLessThanOrEqual(5)
  })

  it('suggestions are sorted by similarity descending', async () => {
    setupMockClients(mockClients)

    const result = await matchClient('Totally Unknown Orchestra')

    if (result.suggestions.length > 1) {
      for (let i = 1; i < result.suggestions.length; i++) {
        expect(result.suggestions[i - 1].similarity).toBeGreaterThanOrEqual(result.suggestions[i].similarity)
      }
    }
  })

  it('token-based match works for reordered names', async () => {
    setupMockClients([{ id: 'c1', name: 'Kungliga Filharmonikerna Stockholm', client_code: 'KFS' }])

    // Token-based should still match since both contain "kungliga", "filharmonikerna", "stockholm"
    const result = await matchClient('Stockholm Kungliga Filharmonikerna')

    expect(result.clientId).toBe('c1')
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('manual match returns suggestions sorted by fuzzy similarity', async () => {
    setupMockClients(mockClients)

    const result = await matchClient('Xyz Abc Def')

    expect(result.clientId).toBeNull()
    expect(result.matchMethod).toBe('manual')
    expect(result.suggestions.length).toBeLessThanOrEqual(5)
    // Each suggestion should have id, name, and similarity
    for (const s of result.suggestions) {
      expect(s).toHaveProperty('id')
      expect(s).toHaveProperty('name')
      expect(s).toHaveProperty('similarity')
    }
  })
})
