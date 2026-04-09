import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { logAiUsage } from '@/lib/ai/usage-logger'
import { EXPENSE_CATEGORIES } from '@/lib/expenses/categories'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Schema för extraherad kvittodata
export const ReceiptDataSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  supplier: z.string().min(1),
  amount: z.number().positive(),
  currency: z.enum(['SEK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK']).default('SEK'),
  category: z.enum(EXPENSE_CATEGORIES).default('other'),
  notes: z.string().optional(),
  confidence: z.number().min(0).max(1),
})

export type ParsedReceiptData = z.infer<typeof ReceiptDataSchema>

const CATEGORY_LIST_EN = `- "travel": train, flight, taxi, petrol, parking
- "food": restaurant, café, groceries
- "hotel": accommodation, overnight stays
- "instrument": instrument purchases, repairs, accessories
- "sheet_music": sheet music purchases, copies
- "equipment": microphones, cables, stands, gear
- "office": paper, pens, office supplies
- "phone": phone bills, mobile plans
- "subscription": Spotify, software subscriptions, streaming services
- "accounting": accounting services, bookkeeper, auditor fees
- "loan": loan payments (principal only)
- "bank": bank fees, account fees
- "insurance": insurance premiums
- "representation": client entertainment, business meals (rep)
- "training": courses, masterclasses, continuing education
- "interest": interest expenses
- "subcontractor": payments to other musicians/performers
- "other": anything that doesn't fit above`

const CATEGORY_LIST_SV = `- "travel": tåg, flyg, taxi, bensin, parkering (Resa)
- "food": restaurang, fika, livsmedel (Mat)
- "hotel": övernattning, boende (Hotell)
- "instrument": köp, reparation, tillbehör
- "sheet_music": notköp, kopior (Noter)
- "equipment": mikrofoner, kablar, stativ (Utrustning)
- "office": papper, pennor, kontorsmaterial
- "phone": mobilräkning, abonnemang (Telefon)
- "subscription": Spotify, programvara, strömningstjänster (Prenumeration)
- "accounting": bokföringstjänster, revisor (Redovisning)
- "loan": amorteringar på lån (Lån)
- "bank": bankavgifter, kontoavgifter
- "insurance": försäkringar (Försäkring)
- "representation": kundrepresentation, affärsmiddagar (Representation)
- "training": kurser, mästarklasser, vidareutbildning (Utbildning)
- "interest": räntekostnader (Ränta)
- "subcontractor": betalningar till andra musiker (Underleverantör)
- "other": allt annat (Övrigt)`

function getSystemPrompt(locale: 'sv' | 'en' = 'sv'): string {
  if (locale === 'en') {
    return `You are a receipt reader for a bookkeeping system for freelance musicians.
Extract data from receipt images with high accuracy.

Rules:
- Date in ISO format (YYYY-MM-DD)
- Amount should be the TOTAL (including VAT/tax)
- Detect currency from symbols (kr/SEK, €/EUR, $/USD, £/GBP)
- Choose the best-fitting category

Category values (use these exact English keys — they are internal identifiers, not display labels):
${CATEGORY_LIST_EN}

Return ONLY JSON with these fields:
- date: date (YYYY-MM-DD) or null if unclear
- supplier: supplier/store/company name (keep original language)
- amount: total amount (number)
- currency: currency code (SEK/EUR/USD/GBP/DKK/NOK)
- category: one of the exact English keys listed above
- notes: short description of what was purchased, IN ENGLISH (optional)
- confidence: 0-1, your confidence

IMPORTANT: Return ONLY JSON, nothing else. The "notes" field must be in English. The "category" field MUST be an English key from the list above (never Swedish).`
  }

  return `Du är en kvittoläsare för ett bokföringssystem för frilansmusiker.
Extrahera data från kvittobilder med hög noggrannhet.

Regler:
- Datum i ISO-format (YYYY-MM-DD)
- Belopp ska vara TOTALSUMMAN (inklusive moms)
- Gissa valuta baserat på symboler (kr/SEK, €/EUR, $/USD, £/GBP)
- Välj kategori som passar bäst

Kategorivärden (använd EXAKT dessa engelska nycklar — de är interna identifierare, inte visningsetiketter):
${CATEGORY_LIST_SV}

Returnera ENDAST JSON med dessa fält:
- date: datum (YYYY-MM-DD) eller null om otydligt
- supplier: leverantör/butik/företag
- amount: totalbelopp (nummer)
- currency: valuta (SEK/EUR/USD/GBP/DKK/NOK)
- category: EN AV de engelska nycklarna ovan (t.ex. "travel", INTE "Resa")
- notes: kort beskrivning av vad som köpts PÅ SVENSKA (valfritt)
- confidence: 0-1, din säkerhet

VIKTIGT: Returnera BARA JSON, inget annat. Fältet "notes" ska vara på svenska. Fältet "category" MÅSTE vara en engelsk nyckel från listan (aldrig svenska).`
}

export async function parseReceiptWithVision(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
  userId?: string,
  locale: 'sv' | 'en' = 'sv',
): Promise<ParsedReceiptData> {
  try {
    const model = 'claude-haiku-4-5-20251001'
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0,
      system: getSystemPrompt(locale),
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
              text:
                locale === 'en' ? 'Read this receipt and extract the data.' : 'Läs detta kvitto och extrahera data.',
            },
          ],
        },
      ],
    })

    // Log AI usage for cost tracking
    await logAiUsage({
      usageType: 'receipt_scan_vision',
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      userId,
    })

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : null

    if (!responseText) {
      throw new Error('Inget svar från Claude')
    }

    // Rensa eventuell markdown
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '')
    }

    // Parsa JSON
    const parsed = JSON.parse(jsonText)

    // Validera med Zod
    const validated = ReceiptDataSchema.parse(parsed)

    return validated
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Ogiltigt AI-svar: ${error.message}`)
    }
    throw new Error(`Kunde inte läsa kvitto: ${error instanceof Error ? error.message : 'Okänt fel'}`)
  }
}

/**
 * Parse receipt from extracted text (cheaper than vision)
 */
export async function parseReceiptWithText(
  text: string,
  userId?: string,
  locale: 'sv' | 'en' = 'sv',
): Promise<ParsedReceiptData> {
  try {
    const model = 'claude-haiku-4-5-20251001'
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0,
      system: getSystemPrompt(locale),
      messages: [
        {
          role: 'user',
          content:
            locale === 'en'
              ? `Read this receipt text and extract the data:\n\n${text}`
              : `Läs denna kvittotext och extrahera data:\n\n${text}`,
        },
      ],
    })

    // Log AI usage for cost tracking
    await logAiUsage({
      usageType: 'receipt_scan_text',
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      userId,
    })

    const responseText = message.content[0]?.type === 'text' ? message.content[0].text : null

    if (!responseText) {
      throw new Error('Inget svar från Claude')
    }

    // Rensa eventuell markdown
    let jsonText = responseText.trim()
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n?/, '').replace(/\n?```$/, '')
    }

    // Parsa JSON
    const parsed = JSON.parse(jsonText)

    // Validera med Zod
    const validated = ReceiptDataSchema.parse(parsed)

    return validated
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Ogiltigt AI-svar: ${error.message}`)
    }
    throw new Error(`Kunde inte läsa kvitto: ${error instanceof Error ? error.message : 'Okänt fel'}`)
  }
}

// Hjälpfunktion för att konvertera fil till base64
export async function fileToBase64(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Hjälpfunktion för att få MIME-typ
export function getMimeType(file: File): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  const type = file.type
  if (type === 'image/jpeg' || type === 'image/png' || type === 'image/gif' || type === 'image/webp') {
    return type
  }
  // Default till JPEG om okänd typ
  return 'image/jpeg'
}
