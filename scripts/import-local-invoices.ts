import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'
import { extractText } from 'unpdf'
import Anthropic from '@anthropic-ai/sdk'
import { distance } from 'fastest-levenshtein'
import { z } from 'zod'
import { config as loadEnv } from 'dotenv'

// Load environment variables
loadEnv({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const anthropicApiKey = process.env.ANTHROPIC_API_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

if (!anthropicApiKey) {
  console.error('❌ Missing ANTHROPIC_API_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const anthropic = new Anthropic({ apiKey: anthropicApiKey })

// Local folder path
const LOCAL_FOLDER = '/Users/bruskzanganeh/Desktop/Babalisk AB'

// Zod schema for validation
const InvoiceParseSchema = z.object({
  invoiceNumber: z.number().int().min(1),
  clientName: z.string(),
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
- Dates in ISO format (YYYY-MM-DD)
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

interface Client {
  id: string
  name: string
}

interface InvoiceFile {
  path: string
  name: string
  invoiceNumber: number
}

// Extract text from PDF using unpdf
async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  const uint8Array = new Uint8Array(pdfBuffer)
  const result = await extractText(uint8Array)
  return result.text.join('\n')
}

// Parse invoice with AI
async function parseInvoiceWithAI(extractedText: string) {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
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

  const responseText = message.content[0]?.type === 'text' ? message.content[0].text : null

  if (!responseText) {
    throw new Error('No response from Claude')
  }

  let jsonText = responseText.trim()
  if (jsonText.startsWith('```json')) {
    jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '')
  } else if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '')
  }

  const parsed = JSON.parse(jsonText)

  if (typeof parsed.invoiceNumber === 'string') {
    const digits = parsed.invoiceNumber.match(/\d+/)
    parsed.invoiceNumber = digits ? parseInt(digits[0], 10) : 0
  }

  return InvoiceParseSchema.parse(parsed)
}

// Normalize string for matching
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+ab$/i, '')
    .replace(/\s+aktiebolag$/i, '')
    .replace(/\s+hb$/i, '')
    .replace(/\s+kb$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Match client using fuzzy matching
function matchClient(clientName: string, clients: Client[]): Client | null {
  if (!clientName || clients.length === 0) {
    return null
  }

  const normalizedInput = normalizeString(clientName)

  let bestMatch: Client | null = null
  let bestDistance = Infinity

  for (const client of clients) {
    const normalizedClientName = normalizeString(client.name)
    const dist = distance(normalizedInput, normalizedClientName)

    if (dist < bestDistance) {
      bestDistance = dist
      bestMatch = client
    }
  }

  const maxAllowedDistance = Math.ceil(normalizedInput.length * 0.3)

  if (bestMatch && bestDistance <= maxAllowedDistance) {
    return bestMatch
  }

  return null
}

// Find all invoice PDFs in the local folder
function findInvoicePDFs(): InvoiceFile[] {
  const invoices: InvoiceFile[] = []

  // Folders to ignore
  const IGNORE_FOLDERS = ['Gröna Linjen', 'mall', 'Kostnader', 'Kontoutdrag', 'Marginalen Lån']

  function scanDirectory(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        // Skip ignored folders
        if (IGNORE_FOLDERS.includes(entry.name)) {
          continue
        }
        // Scan year folders, month folders, "Fakturor skickade kund", and "Kundfakturor"
        if (
          entry.name.match(/^20\d{2}$/) || // Year folders like 2021, 2022
          entry.name.match(/^\d{2}\s+/i) || // Month folders like "01 Januari", "12 Dec"
          entry.name === 'Fakturor skickade kund' ||
          entry.name === 'Kundfakturor'
        ) {
          scanDirectory(fullPath)
        }
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
        // Extract invoice number from filename - only match "Faktura-XXX.pdf" pattern
        const match = entry.name.match(/^Faktura-(\d+)\.pdf$/i)
        if (match) {
          const invoiceNumber = parseInt(match[1], 10)
          // Skip unreasonable invoice numbers (e.g., dates encoded as numbers)
          if (invoiceNumber < 10000) {
            invoices.push({
              path: fullPath,
              name: entry.name,
              invoiceNumber,
            })
          }
        }
      }
    }
  }

  scanDirectory(LOCAL_FOLDER)
  return invoices.sort((a, b) => a.invoiceNumber - b.invoiceNumber)
}

// Check which invoices already exist in the database
async function getExistingInvoiceNumbers(): Promise<Set<number>> {
  const { data, error } = await supabase.from('invoices').select('invoice_number')

  if (error) {
    console.error('Error fetching existing invoices:', error)
    return new Set()
  }

  return new Set(data.map((inv) => inv.invoice_number))
}

// Main import function
async function importInvoices() {
  console.log('🔍 Scanning local folder for invoice PDFs...')
  const allInvoices = findInvoicePDFs()
  console.log(`Found ${allInvoices.length} invoice PDFs`)

  console.log('\n📊 Checking existing invoices in database...')
  const existingNumbers = await getExistingInvoiceNumbers()
  console.log(`Found ${existingNumbers.size} existing invoices`)

  // Filter to only missing invoices
  const missingInvoices = allInvoices.filter((inv) => !existingNumbers.has(inv.invoiceNumber))
  console.log(`\n📋 ${missingInvoices.length} invoices need to be imported`)

  if (missingInvoices.length === 0) {
    console.log('✅ All invoices already imported!')
    return
  }

  // Get all clients for matching
  const { data: clients, error: clientsError } = await supabase.from('clients').select('id, name')

  if (clientsError) {
    console.error('Error fetching clients:', clientsError)
    return
  }

  console.log(`\n👥 Loaded ${clients?.length || 0} clients for matching`)

  // Process invoices
  let imported = 0
  let failed = 0

  for (let i = 0; i < missingInvoices.length; i++) {
    const invoice = missingInvoices[i]
    console.log(`\n[${i + 1}/${missingInvoices.length}] Processing invoice #${invoice.invoiceNumber}...`)

    try {
      // Read PDF file
      const pdfBuffer = fs.readFileSync(invoice.path)
      console.log(`  📄 Read ${(pdfBuffer.length / 1024).toFixed(1)} KB`)

      // Extract text
      const text = await extractTextFromPDF(pdfBuffer)
      if (text.length < 50) {
        console.log(`  ⚠️  PDF text too short (${text.length} chars), may need OCR`)
        failed++
        continue
      }
      console.log(`  📝 Extracted ${text.length} characters of text`)

      // Parse with AI
      const parsedData = await parseInvoiceWithAI(text)
      console.log(`  🤖 AI parsed: ${parsedData.clientName || '(no client)'} - ${parsedData.total} kr`)

      // Match client
      const matchedClient = parsedData.clientName ? matchClient(parsedData.clientName, clients || []) : null

      if (matchedClient) {
        console.log(`  👤 Matched client: ${matchedClient.name}`)
      } else {
        console.log(`  ⚠️  No client match found for: "${parsedData.clientName}"`)
      }

      // Insert into database
      const { error: insertError } = await supabase.from('invoices').insert({
        invoice_number: invoice.invoiceNumber,
        client_id: matchedClient?.id || null,
        invoice_date: parsedData.invoiceDate,
        due_date: parsedData.dueDate,
        subtotal: parsedData.subtotal,
        vat_rate: parsedData.vatRate,
        vat_amount: parsedData.vatAmount,
        total: parsedData.total,
        status: 'paid',
        imported_from_pdf: true,
      })

      if (insertError) {
        throw insertError
      }

      console.log(`  ✅ Imported invoice #${invoice.invoiceNumber}`)
      imported++

      // Add a small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`  ❌ Failed: ${message}`)
      failed++
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log(`🎉 Import complete!`)
  console.log(`   ✅ Imported: ${imported}`)
  console.log(`   ❌ Failed: ${failed}`)
  console.log(`   📊 Total in database: ${existingNumbers.size + imported}`)
}

// Dry run - just scan and report
async function dryRun() {
  console.log('🔍 DRY RUN - Scanning local folder for invoice PDFs...\n')
  const allInvoices = findInvoicePDFs()

  console.log(`Found ${allInvoices.length} invoice PDFs:`)
  console.log(`  First: #${allInvoices[0]?.invoiceNumber || 'N/A'}`)
  console.log(`  Last:  #${allInvoices[allInvoices.length - 1]?.invoiceNumber || 'N/A'}`)

  const existingNumbers = await getExistingInvoiceNumbers()
  console.log(`\nExisting in database: ${existingNumbers.size}`)

  const missingInvoices = allInvoices.filter((inv) => !existingNumbers.has(inv.invoiceNumber))
  console.log(`Missing (to import): ${missingInvoices.length}`)

  if (missingInvoices.length > 0) {
    console.log(`\nMissing invoice numbers:`)
    console.log(missingInvoices.map((inv) => `#${inv.invoiceNumber}`).join(', '))
  }
}

// Main
const args = process.argv.slice(2)
if (args.includes('--dry-run') || args.includes('-d')) {
  dryRun()
} else {
  importInvoices()
}
