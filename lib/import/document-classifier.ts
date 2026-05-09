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
  vatRate: z.number().nonnegative(),
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
  vatRate: z.number().nonnegative(),
  vatAmount: z.number().nonnegative(),
  total: z.number().nonnegative(),
})

// Schema för administrativa dokument
const DOCUMENT_CATEGORIES = [
  'annual_report',
  'bank_statement',
  'tax_authority',
  'registration',
  'contract',
  'other',
] as const
const DocumentDataSchema = z.object({
  category: z.enum(DOCUMENT_CATEGORIES),
  description: z.string(),
  documentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
})

// Kombinerat schema för klassificerat dokument
const ClassifiedDocumentSchema = z.object({
  type: z.enum(['expense', 'invoice', 'document']),
  confidence: z.number().min(0).max(1),
  data: z.union([ExpenseDataSchema, InvoiceDataSchema, DocumentDataSchema]),
  suggestedFilename: z.string(),
})

export type ExpenseData = z.infer<typeof ExpenseDataSchema>
export type InvoiceData = z.infer<typeof InvoiceDataSchema>
export type DocumentData = z.infer<typeof DocumentDataSchema>
export type ClassifiedDocument = z.infer<typeof ClassifiedDocumentSchema>

function getClassifierPrompt(companyName: string) {
  return `Du är en dokumentklassificerare för ett svenskt bokföringssystem. Användaren tillhör företaget "${companyName}".

UPPGIFT: Analysera dokumentet och bestäm om det är en UTGIFT, INKOMST, eller DOKUMENT, och extrahera relevant data.

## KLASSIFICERINGSREGLER - LÄS NOGA!

**VIKTIGAST — Kontrollera detta FÖRST:**
Om dokumentet INTE är ett kvitto eller faktura med ett belopp att betala/få betalt, klassificera det som **document**.
Exempel: affärsplaner, budgetar, registreringsbevis, kontoutdrag, bolagsordning, stadgar, skattebesked, bankansökningar, avtal utan specifika betalningsdetaljer.

**UTGIFT** (expense) - Fakturor och kvitton som "${companyName}" har MOTTAGIT och ska/har BETALAT:

STARKASTE LEDTRÅDAR (om dessa finns = ALLTID expense):
- "${companyName}" står som MOTTAGARE / "Faktureras till" / "Bill to" / "Attention"
- Avsändaren är ett ANNAT företag/person (inte "${companyName}")
- Titel säger "Receipt", "Kvitto", "Betalningsbekräftelse"
- Innehåller "paid", "betald", "betalat" (förfluten tid = redan betalt)

**VIKTIGT:** Om fakturan är STÄLLD TILL "${companyName}" (dvs "${companyName}" är kund/mottagare) = det är en UTGIFT!
Ett "Invoice number" på en faktura ställd till "${companyName}" betyder INTE att det är en faktura "${companyName}" skickat.

**INKOMST** (invoice) - Fakturor som "${companyName}" själv har SKICKAT till sina kunder:
- "${companyName}" står som AVSÄNDARE (inte mottagare)
- Innehåller "${companyName}":s bankgiro/kontonummer för inbetalning
- Kunden/mottagaren är ett annat företag som ska betala "${companyName}"
- "${companyName}":s org.nr står som utställare

**DOKUMENT** (document) - Administrativa dokument som INTE är fakturor/kvitton:
- Registreringsbevis, bolagsordning, organisationsbevis
- Kontoutdrag, årsbesked från bank
- Skattebesked, inkomstdeklaration, Skatteverket-handlingar
- Affärsplaner, budgetar, likviditetsbudgetar, resultatbudgetar
- Avtal, stadgar, protokoll
- Allt som inte har ett specifikt belopp att betala/få betalt

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

**För DOKUMENT:**
- category: EN AV: annual_report, bank_statement, tax_authority, registration, contract, other
- description: Kort beskrivning av dokumentet
- documentDate: Datum (YYYY-MM-DD) om det framgår, annars null

## FILNAMN

Skapa ett föreslaget filnamn efter mönster:
- Utgift: {datum}_{leverantör}_{beskrivning}
- Inkomst: {datum}_{kund}_Faktura{nummer}
- Dokument: {datum}_{typ}_{beskrivning}

Exempel:
- "2024-03-15_SJ_Tagresa-Stockholm"
- "2024-03-20_Konserthuset_Faktura127"
- "2022-01-31_Registreringsbevis"

## SVAR

Returnera ENDAST JSON (ingen markdown):
{
  "type": "expense" | "invoice" | "document",
  "confidence": 0-1,
  "data": { ... },
  "suggestedFilename": "..."
}`
}

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
async function classifyPdfWithVision(
  buffer: ArrayBuffer,
  originalFilename: string,
  companyName: string = 'Mitt företag',
): Promise<ClassifiedDocument> {
  const base64 = Buffer.from(buffer).toString('base64')
  const model = 'claude-haiku-4-5-20251001'
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0,
    system: getClassifierPrompt(companyName),
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
async function classifyWithText(
  text: string,
  originalFilename: string,
  companyName: string = 'Mitt företag',
): Promise<ClassifiedDocument> {
  const model = 'claude-haiku-4-5-20251001'
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0,
    system: getClassifierPrompt(companyName),
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
export async function classifyPdfDocument(
  buffer: ArrayBuffer,
  originalFilename: string,
  companyName: string = 'Mitt företag',
): Promise<ClassifiedDocument> {
  // 1. Försök extrahera text först (snabbast, billigast)
  try {
    const bufferCopy = buffer.slice(0)
    const text = await extractPdfText(bufferCopy)
    if (text && text.trim().length >= 50) {
      try {
        return await classifyWithText(text, originalFilename, companyName)
      } catch {
        // Text classification failed — fall through to PDF vision
      }
    }
  } catch {
    // Text extraction failed — fall back to PDF vision
  }

  // 2. Fallback: Skicka PDF direkt till Claude API (ingen canvas behövs)
  try {
    return await classifyPdfWithVision(buffer, originalFilename, companyName)
  } catch (error) {
    throw new Error(`Kunde inte analysera PDF: ${error instanceof Error ? error.message : 'Okänt fel'}`)
  }
}

// Klassificera bilddokument (kvitto)
export async function classifyImageDocument(
  imageBase64: string,
  mimeType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
  originalFilename: string,
  companyName: string = 'Mitt företag',
): Promise<ClassifiedDocument> {
  try {
    const model = 'claude-haiku-4-5-20251001'
    const message = await anthropic.messages.create({
      model,
      max_tokens: 1024,
      temperature: 0,
      system: getClassifierPrompt(companyName),
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

// Normaliseringshjälpare — gör AI-output Zod-säker
function normalizeDate(d: unknown): string | null {
  if (typeof d !== 'string' || !d) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d
  const parsed = new Date(d)
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  return null
}

function normalizeCurrency(c: unknown): 'SEK' | 'EUR' | 'USD' | 'GBP' | 'DKK' | 'NOK' {
  if (typeof c !== 'string') return 'SEK'
  const upper = c.toUpperCase().trim()
  const valid = ['SEK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK'] as const
  for (const v of valid) if (upper === v) return v
  const map: Record<string, (typeof valid)[number]> = { KR: 'SEK', KRONOR: 'SEK', '€': 'EUR', $: 'USD', '£': 'GBP' }
  return map[upper] || 'SEK'
}

function normalizeCategory(c: unknown): string {
  if (typeof c === 'string' && (EXPENSE_CATEGORIES as readonly string[]).includes(c)) return c
  return 'other'
}

// Parsa AI-svar
function parseAIResponse(message: Anthropic.Message): ClassifiedDocument {
  const responseText = message.content[0]?.type === 'text' ? message.content[0].text : null

  if (!responseText) {
    throw new Error('Inget svar från Claude')
  }

  // Extrahera JSON-objekt robust — hanterar markdown-wrapping och extra text
  let jsonText = responseText.trim()

  // Ta bort markdown code blocks
  const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    jsonText = codeBlockMatch[1].trim()
  }

  // Om det fortfarande inte börjar med { — hitta första { och sista }
  if (!jsonText.startsWith('{')) {
    const start = jsonText.indexOf('{')
    const end = jsonText.lastIndexOf('}')
    if (start !== -1 && end > start) {
      jsonText = jsonText.substring(start, end + 1)
    }
  }

  // Parsa JSON
  const parsed = JSON.parse(jsonText)

  // Preprocessa data för att hantera null/undefined värden
  if (parsed.data) {
    if (parsed.type === 'expense') {
      // Normalisera alla fält till Zod-säkra värden
      parsed.data.date = normalizeDate(parsed.data.date)
      parsed.data.supplier = parsed.data.supplier || 'Okänd leverantör'
      parsed.data.currency = normalizeCurrency(parsed.data.currency)
      parsed.data.category = normalizeCategory(parsed.data.category)

      // Hantera moms - beräkna saknade värden
      const total = Number(parsed.data.total ?? parsed.data.amount ?? 0) || 0
      const vatRate = parsed.data.vatRate != null ? Number(parsed.data.vatRate) : 25

      if (parsed.data.subtotal && parsed.data.vatAmount) {
        parsed.data.subtotal = Number(parsed.data.subtotal) || 0
        parsed.data.vatAmount = Number(parsed.data.vatAmount) || 0
        parsed.data.total = total
      } else if (total > 0) {
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
    } else if (parsed.type === 'document') {
      const validCategories = DOCUMENT_CATEGORIES as readonly string[]
      parsed.data.category = validCategories.includes(parsed.data.category) ? parsed.data.category : 'other'
      parsed.data.description = parsed.data.description || 'Dokument'
      parsed.data.documentDate = normalizeDate(parsed.data.documentDate)
    } else if (parsed.type === 'invoice') {
      // Konvertera invoiceNumber till heltal
      if (typeof parsed.data.invoiceNumber === 'string') {
        const digits = parsed.data.invoiceNumber.match(/\d+/)
        parsed.data.invoiceNumber = digits ? parseInt(digits[0], 10) : 0
      }
      parsed.data.invoiceNumber = Number(parsed.data.invoiceNumber) || 0
      parsed.data.clientName = parsed.data.clientName || 'Okänd kund'
      parsed.data.invoiceDate = normalizeDate(parsed.data.invoiceDate)
      parsed.data.dueDate = normalizeDate(parsed.data.dueDate)
      parsed.data.subtotal = Number(parsed.data.subtotal) || 0
      parsed.data.vatRate = Number(parsed.data.vatRate) || 25
      parsed.data.vatAmount = Number(parsed.data.vatAmount) || 0
      parsed.data.total = Number(parsed.data.total) || 0
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
export async function classifyDocument(file: File, companyName: string = 'Mitt företag'): Promise<ClassifiedDocument> {
  const mimeType = file.type

  if (mimeType === 'application/pdf') {
    const buffer = await file.arrayBuffer()
    return classifyPdfDocument(buffer, file.name, companyName)
  }

  const imageMime = getImageMimeType(file)
  if (imageMime) {
    const base64 = await fileToBase64(file)
    return classifyImageDocument(base64, imageMime, file.name, companyName)
  }

  throw new Error(`Filtypen ${mimeType} stöds inte. Använd PDF eller bild (JPEG/PNG/WebP).`)
}
