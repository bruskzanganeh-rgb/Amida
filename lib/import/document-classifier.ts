import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { extractText } from 'unpdf'
import { logAiUsage } from '@/lib/ai/usage-logger'
import { EXPENSE_CATEGORIES } from '@/lib/expenses/categories'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Schema för utgiftsdata - flexibelt för att hantera ofullständiga PDFs
const ExpenseDataSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  supplier: z.string(),
  subtotal: z.number().nonnegative(),
  vatRate: z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(25)]),
  vatAmount: z.number().nonnegative(),
  total: z.number().nonnegative(),
  currency: z.enum(['SEK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK']),
  category: z.enum(EXPENSE_CATEGORIES),
  notes: z.string().optional(),
})

// Schema för fakturadata - flexibelt för ofullständig data
const InvoiceDataSchema = z.object({
  invoiceNumber: z.number().int(),
  clientName: z.string(),
  invoiceDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  subtotal: z.number().nonnegative(),
  vatRate: z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(25)]),
  vatAmount: z.number().nonnegative(),
  total: z.number().nonnegative(),
})

// Kombinerat schema för klassificerat dokument
const ClassifiedDocumentSchema = z.object({
  type: z.enum(['expense', 'invoice']),
  confidence: z.number().min(0).max(1),
  data: z.union([ExpenseDataSchema, InvoiceDataSchema]),
  suggestedFilename: z.string(),
})

export type ExpenseData = z.infer<typeof ExpenseDataSchema>
export type InvoiceData = z.infer<typeof InvoiceDataSchema>
export type ClassifiedDocument = z.infer<typeof ClassifiedDocumentSchema>

const CLASSIFIER_PROMPT = `Du är en dokumentklassificerare för ett svenskt bokföringssystem för frilansmusiker (Babalisk AB).

UPPGIFT: Analysera dokumentet och bestäm om det är en UTGIFT eller INKOMST, och extrahera relevant data.

## KLASSIFICERINGSREGLER - LÄS NOGA!

**UTGIFT** (expense) - Kvitton och mottagna fakturor som du har BETALAT:

STARKASTE LEDTRÅDAR (om dessa finns = ALLTID expense):
- Titel säger "Receipt", "Kvitto", "Betalningsbekräftelse", "Orderbekräftelse"
- Innehåller "paid", "betald", "betalat", "betalt" (förfluten tid = redan betalt)
- "Amount paid" / "Belopp betalt" (inte "Amount due" / "Att betala")
- "Date paid" / "Betalningsdatum" (inte "Due date" / "Förfallodatum")

Andra ledtrådar:
- Du (användaren) står som "Bill to" / "Faktureras till" / "Ship to"
- Leverantören är ett välkänt företag (Anthropic, SJ, Spotify, Netflix, etc.)
- "Tack för ditt köp", "Thank you for your purchase"
- Kvitton från butiker (ICA, Coop, etc), tågbiljetter, flygbiljetter, hotell

**VIKTIGT:** Ett dokument som säger "Receipt" eller "Kvitto" är ALLTID en utgift!
Ett "Invoice number" på ett receipt betyder INTE att det är en faktura du skickat.
Skillnaden: Kvitto/Receipt = du har BETALAT. Faktura = kunden SKA betala dig.

**INKOMST** (invoice) - Fakturor du själv har SKICKAT till kunder:
- Ditt företagsnamn (Babalisk AB) står som AVSÄNDARE (inte mottagare)
- Innehåller "Att betala", "To pay", "Amount due"
- Har "Förfallodatum" / "Due date" (framtida datum)
- Bankgiro/kontonummer för inbetalning TILL DIG
- Kunden är mottagare som ska betala

## EXTRAHERA DATA

**VIKTIGT:** Om ett värde inte kan extraheras från dokumentet, använd null. Gör alltid ditt bästa försök.

**För UTGIFT:**
- date: Datum (YYYY-MM-DD), null om otydligt
- supplier: Leverantör/butik, null om okänt
- subtotal: Nettobelopp före moms (om bara total finns: total / 1.25 för 25% moms)
- vatRate: 0, 6, 12, eller 25 (default: 25 för Sverige)
- vatAmount: Momsbelopp (om bara total finns: total - subtotal)
- total: Totalbelopp inkl moms
- currency: SEK/EUR/USD/GBP/DKK/NOK (default: SEK)
- category: Välj EN engelsk nyckel från: travel, food, hotel, instrument, sheet_music, equipment, office, phone, subscription, accounting, loan, bank, insurance, representation, training, interest, subcontractor, other
- notes: Kort beskrivning

TIPS för moms på kvitton:
- Om kvittot visar "Tax" eller "VAT" eller "Moms" = extrahera det
- Utländska kvitton (USD, EUR): ofta 0% moms eller redan inkluderad
- Om bara totalbelopp syns: anta 25% moms och beräkna subtotal = total / 1.25

**För INKOMST:**
- invoiceNumber: Fakturanummer (heltal), null om saknas
- clientName: Kundnamn (mottagaren), null om okänt
- invoiceDate: Fakturadatum (YYYY-MM-DD), null om otydligt
- dueDate: Förfallodag (YYYY-MM-DD), null om saknas
- subtotal: Nettobelopp före moms (0 om okänt)
- vatRate: 0, 6, eller 25 (default: 25)
- vatAmount: Momsbelopp (0 om okänt)
- total: Totalbelopp, null om ej synligt

## FILNAMN

Skapa ett föreslaget filnamn efter mönster:
- Utgift: {datum}_{leverantör}_{beskrivning}
- Inkomst: {datum}_{kund}_Faktura{nummer}

Exempel:
- "2024-03-15_SJ_Tagresa-Stockholm"
- "2024-03-20_Konserthuset_Faktura127"

## SVAR

Returnera ENDAST JSON (ingen markdown):
{
  "type": "expense" | "invoice",
  "confidence": 0-1,
  "data": { ... },
  "suggestedFilename": "..."
}`

// Sanitera filnamn
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[åäÅÄ]/g, 'a')
    .replace(/[öÖ]/g, 'o')
    .substring(0, 50)
}

// Extrahera text från PDF
async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const uint8Array = new Uint8Array(buffer)
  const result = await extractText(uint8Array)
  return result.text.join('\n')
}

// Klassificera PDF direkt via Claude API (stöder PDF nativt)
async function classifyPdfWithVision(buffer: ArrayBuffer, originalFilename: string): Promise<ClassifiedDocument> {
  const base64 = Buffer.from(buffer).toString('base64')
  const model = 'claude-haiku-4-5-20251001'
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0,
    system: CLASSIFIER_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: base64,
            },
          },
          {
            type: 'text',
            text: `Klassificera detta dokument.\n\nFilnamn: ${originalFilename}`,
          },
        ],
      },
    ],
  })

  await logAiUsage({
    usageType: 'document_classify_vision',
    model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    metadata: { filename: originalFilename },
  })

  return parseAIResponse(message)
}

// Klassificera med text (snabbare, använder Haiku utan vision)
async function classifyWithText(text: string, originalFilename: string): Promise<ClassifiedDocument> {
  const model = 'claude-haiku-4-5-20251001'
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0,
    system: CLASSIFIER_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Klassificera detta dokument:\n\nFilnamn: ${originalFilename}\n\nInnehåll:\n${text.substring(0, 4000)}`,
      },
    ],
  })

  // Log AI usage for cost tracking
  await logAiUsage({
    usageType: 'document_classify_text',
    model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    metadata: { filename: originalFilename },
  })

  return parseAIResponse(message)
}

// Klassificera PDF-dokument (med automatisk Vision-fallback)
export async function classifyPdfDocument(buffer: ArrayBuffer, originalFilename: string): Promise<ClassifiedDocument> {
  // 1. Försök extrahera text först (snabbast, billigast)
  try {
    const bufferCopy = buffer.slice(0)
    const text = await extractPdfText(bufferCopy)
    if (text && text.trim().length >= 50) {
      try {
        return await classifyWithText(text, originalFilename)
      } catch {
        // Text classification failed — fall through to PDF vision
      }
    }
  } catch {
    // Text extraction failed — fall back to PDF vision
  }

  // 2. Fallback: Skicka PDF direkt till Claude API (ingen canvas behövs)
  try {
    return await classifyPdfWithVision(buffer, originalFilename)
  } catch (error) {
    throw new Error(`Kunde inte analysera PDF: ${error instanceof Error ? error.message : 'Okänt fel'}`)
  }
}

// Klassificera bilddokument (kvitto)
export async function classifyImageDocument(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
  originalFilename: string,
): Promise<ClassifiedDocument> {
  try {
    const model = 'claude-haiku-4-5-20251001'
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0,
      system: CLASSIFIER_PROMPT,
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
              text: `Klassificera detta dokument.\n\nFilnamn: ${originalFilename}`,
            },
          ],
        },
      ],
    })

    // Log AI usage for cost tracking
    await logAiUsage({
      usageType: 'document_classify_vision',
      model,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      metadata: { filename: originalFilename },
    })

    return parseAIResponse(message)
  } catch (error) {
    throw new Error(`Kunde inte klassificera bild: ${error instanceof Error ? error.message : 'Okänt fel'}`)
  }
}

// Parsa AI-svar
function parseAIResponse(message: Anthropic.Message): ClassifiedDocument {
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

  // Preprocessa data för att hantera null/undefined värden
  if (parsed.data) {
    if (parsed.type === 'expense') {
      // Sätt defaults för utgifter
      parsed.data.supplier = parsed.data.supplier || 'Okänd leverantör'
      parsed.data.currency = parsed.data.currency || 'SEK'
      parsed.data.category = parsed.data.category || 'other'

      // Hantera moms - beräkna saknade värden
      const total = parsed.data.total ?? parsed.data.amount ?? 0
      const vatRate = parsed.data.vatRate ?? 25

      if (parsed.data.subtotal && parsed.data.vatAmount) {
        // Båda finns - använd dem
        parsed.data.subtotal = parsed.data.subtotal
        parsed.data.vatAmount = parsed.data.vatAmount
        parsed.data.total = total
      } else if (total > 0) {
        // Bara total - beräkna subtotal och moms
        const divisor = 1 + vatRate / 100
        parsed.data.subtotal = Math.round((total / divisor) * 100) / 100
        parsed.data.vatAmount = Math.round((total - parsed.data.subtotal) * 100) / 100
        parsed.data.total = total
      } else {
        parsed.data.subtotal = 0
        parsed.data.vatAmount = 0
        parsed.data.total = 0
      }
      parsed.data.vatRate = vatRate

      // Ta bort gamla amount fältet om det finns
      delete parsed.data.amount
    } else if (parsed.type === 'invoice') {
      // Konvertera invoiceNumber till heltal om det är en sträng
      if (typeof parsed.data.invoiceNumber === 'string') {
        const digits = parsed.data.invoiceNumber.match(/\d+/)
        parsed.data.invoiceNumber = digits ? parseInt(digits[0], 10) : 0
      }
      // Sätt defaults för fakturor
      parsed.data.invoiceNumber = parsed.data.invoiceNumber ?? 0
      parsed.data.clientName = parsed.data.clientName || 'Okänd kund'
      parsed.data.subtotal = parsed.data.subtotal ?? 0
      parsed.data.vatRate = parsed.data.vatRate ?? 25
      parsed.data.vatAmount = parsed.data.vatAmount ?? 0
      parsed.data.total = parsed.data.total ?? 0
    }
  }

  // Validera
  const validated = ClassifiedDocumentSchema.parse(parsed)

  // Sanitera filnamnet
  validated.suggestedFilename = sanitizeFilename(validated.suggestedFilename)

  return validated
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
export function getImageMimeType(file: File): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  const type = file.type
  if (type === 'image/jpeg' || type === 'image/png' || type === 'image/gif' || type === 'image/webp') {
    return type
  }
  return null
}

// Huvudfunktion för att klassificera fil
export async function classifyDocument(file: File): Promise<ClassifiedDocument> {
  const mimeType = file.type

  if (mimeType === 'application/pdf') {
    const buffer = await file.arrayBuffer()
    return classifyPdfDocument(buffer, file.name)
  }

  const imageMime = getImageMimeType(file)
  if (imageMime) {
    const base64 = await fileToBase64(file)
    return classifyImageDocument(base64, imageMime, file.name)
  }

  throw new Error(`Filtypen ${mimeType} stöds inte. Använd PDF eller bild (JPEG/PNG/WebP).`)
}
