import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { ParsedInvoiceData } from '@/lib/types/import'
import { logAiUsage } from '@/lib/ai/usage-logger'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Zod schema for validation
const InvoiceParseSchema = z.object({
  invoiceNumber: z.number().int().min(1),
  clientName: z.string().min(1),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subtotal: z.number().nonnegative(),
  vatRate: z.union([z.literal(0), z.literal(6), z.literal(25)]),
  vatAmount: z.number().nonnegative(),
  total: z.number().positive(),
  confidence: z.number().min(0).max(1),
})

const SYSTEM_PROMPT = `You are an invoice data extraction assistant for a Swedish musician's accounting system.
Extract invoice data from OCR text with high accuracy.

CRITICAL: You must extract the ACTUAL client name from the invoice text, not a placeholder or generic name.
The client name is typically found after labels like "Kund:", "Faktureras till:", or at the top of the billing address section.

Rules:
- All monetary amounts in SEK (kr)
- Dates in ISO format (YYYY-MM-DD). Ambiguous dates like 04/03/2026 should be interpreted as European (dd/mm/yyyy = March 4th), NOT American (mm/dd/yyyy)
- VAT rate must be exactly 0, 6, or 25 (Swedish rates)
- Invoice numbers are integers
- Client name MUST be the actual organization name from the invoice, not "Företag AB" or similar placeholders
- Return JSON only, no markdown or explanation

Extract these fields:
1. invoiceNumber (Fakturanummer) - integer only, extract digits
2. clientName (Kund) - ACTUAL full legal name from invoice (e.g., "Stockholms Konserthusstiftelse", "Solna Församling", "Region Norrbotten")
3. invoiceDate (Fakturadatum) - YYYY-MM-DD
4. dueDate (Förfallodag) - YYYY-MM-DD
5. subtotal (Nettobelopp before VAT) - number
6. vatRate (Momssats) - must be 0, 6, or 25
7. vatAmount (Momsbelopp) - number
8. total (Totalbelopp) - number
9. confidence (0-1, your confidence in this extraction)

IMPORTANT: If you cannot find the actual client name in the text, set clientName to an empty string "".
Do NOT use placeholder names like "Företag AB", "Company AB", or similar generic names.

Return ONLY a JSON object with these exact keys.`

export async function parseInvoiceWithAI(extractedText: string): Promise<ParsedInvoiceData> {
  try {
    const model = 'claude-haiku-4-5-20251001'
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Extract invoice data from this Swedish invoice OCR text:\n\n${extractedText}`,
        },
      ],
    })

    // Log AI usage for cost tracking
    await logAiUsage({
      usageType: 'invoice_parse',
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    })

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : null

    if (!responseText) {
      throw new Error('No response from Claude')
    }

    // Extract JSON from response (Claude might wrap it in markdown)
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '')
    }

    // Parse JSON response
    const parsed = JSON.parse(jsonText)

    // Convert invoiceNumber to integer if it's a string
    if (typeof parsed.invoiceNumber === 'string') {
      // Extract only digits from the invoice number string
      const digits = parsed.invoiceNumber.match(/\d+/)
      parsed.invoiceNumber = digits ? parseInt(digits[0], 10) : 0
    }

    // Validate with Zod
    const validated = InvoiceParseSchema.parse(parsed)

    return validated as ParsedInvoiceData
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Invalid AI response format: ${error.message}`)
    }
    throw new Error(`Failed to parse invoice with Claude: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
