import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRateServer, type SupportedCurrency } from '@/lib/currency/exchange'

/** Convert amount to SEK. For future dates, uses today's rate. */
async function toBaseSEK(amount: number, currency: string, date: string | null): Promise<number> {
  if (currency === 'SEK') return amount
  try {
    // Use expense date or today — Frankfurter only has historical rates,
    // so clamp to today if the date is in the future
    const today = new Date().toISOString().split('T')[0]
    const rateDate = !date || date > today ? today : date
    const rate = await getRateServer(currency as SupportedCurrency, 'SEK', rateDate)
    return Math.round(amount * rate * 100) / 100
  } catch {
    return amount
  }
}

type DocumentData = {
  category: string
  description: string
  documentDate: string | null
}

type FileMetadata = {
  id: string
  type: 'expense' | 'invoice' | 'document'
  data: ExpenseData | InvoiceData | DocumentData
  suggestedFilename: string
}

type ExpenseData = {
  date: string | null
  supplier: string
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  currency: string
  category: string
  notes?: string
}

type InvoiceData = {
  invoiceNumber: number
  clientName: string
  invoiceDate: string
  dueDate: string
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  selectedClientId?: string | null // null = skapa ny, undefined = använd matchning
}

type ImportResult = {
  fileId: string
  success: boolean
  type: 'expense' | 'invoice' | 'document'
  id?: string
  filename: string
  error?: string
  skippedAsDuplicate?: boolean
  existingExpense?: {
    id: string
    date: string
    supplier: string
    amount: number
    category: string | null
  }
  createdClient?: string // Namn på ny kund som skapades
}

// Enkel klientmatchning
function matchClientByName(
  clientName: string,
  clients: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  if (!clientName || clients.length === 0) return null

  const normalized = clientName.toLowerCase().trim()

  // Exakt match
  const exact = clients.find((c) => c.name.toLowerCase() === normalized)
  if (exact) return exact

  // Partiell match
  const partial = clients.find(
    (c) => c.name.toLowerCase().includes(normalized) || normalized.includes(c.name.toLowerCase()),
  )
  if (partial) return partial

  return null
}

// Sanitera filnamn för storage
function sanitizeStorageFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .substring(0, 100)
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceSupabase = createAdminClient()
    const formData = await request.formData()
    const metadataJson = formData.get('metadata') as string
    const skipDuplicates = formData.get('skipDuplicates') === 'true'

    if (!metadataJson) {
      return NextResponse.json({ error: 'Metadata required' }, { status: 400 })
    }

    const metadata: FileMetadata[] = JSON.parse(metadataJson)

    if (!metadata || metadata.length === 0) {
      return NextResponse.json({ error: 'No files to import' }, { status: 400 })
    }

    // Batch import started

    // Hämta klienter för matching (scoped to user)
    const { data: clients } = await supabase.from('clients').select('id, name').eq('user_id', user.id)

    // Hämta befintliga utgifter för dublettkontroll (scoped to user)
    const expenseMetadata = metadata.filter((m) => m.type === 'expense')
    const expenseDates = [
      ...new Set(expenseMetadata.map((m) => (m.data as ExpenseData).date).filter((d): d is string => Boolean(d))),
    ]

    const { data: existingExpenses } = await supabase
      .from('expenses')
      .select('id, date, supplier, amount, category, file_size')
      .eq('user_id', user.id)
      .in('date', expenseDates.length > 0 ? expenseDates : ['1900-01-01'])

    // Hämta alla expense file_sizes för filnamn+storlek kontroll
    const { data: allExpenseFiles } = await supabase
      .from('expenses')
      .select('id, file_size')
      .eq('user_id', user.id)
      .not('attachment_url', 'is', null)

    // Hämta befintliga fakturor för dublettkontroll
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, total, client:clients(name)')
      .eq('user_id', user.id)

    // Hämta befintliga dokument för dublettkontroll (filename + file_size)
    const { data: existingDocuments } = await supabase.from('company_documents').select('id, file_name, file_size')

    // Build a set of known file sizes for quick duplicate-by-file check
    const knownFileSizes = new Set<number>()
    for (const e of allExpenseFiles || []) if (e.file_size) knownFileSizes.add(e.file_size)

    // Hämta högsta fakturanumret för att generera nya nummer
    const { data: maxInvoice } = await supabase
      .from('invoices')
      .select('invoice_number')
      .order('invoice_number', { ascending: false })
      .limit(1)
      .single()

    let nextInvoiceNumber = (maxInvoice?.invoice_number || 0) + 1

    const results: ImportResult[] = []

    for (const fileMeta of metadata) {
      const file = formData.get(`file_${fileMeta.id}`) as File | null

      if (!file) {
        results.push({
          fileId: fileMeta.id,
          success: false,
          type: fileMeta.type,
          filename: fileMeta.suggestedFilename,
          error: 'File missing',
        })
        continue
      }

      try {
        if (fileMeta.type === 'document') {
          // Dublettkontroll för dokument (filnamn + storlek)
          const docDuplicate = existingDocuments?.find(
            (doc) => doc.file_name === file.name && doc.file_size === file.size,
          )

          if (docDuplicate && skipDuplicates) {
            results.push({
              fileId: fileMeta.id,
              success: false,
              type: 'document',
              filename: fileMeta.suggestedFilename,
              skippedAsDuplicate: true,
            })
            continue
          }

          // Importera som företagsdokument
          const docData = fileMeta.data as DocumentData
          const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
          const docStoragePath = `${user.id}/${Date.now()}-${sanitizedName}`

          const docBuffer = Buffer.from(await file.arrayBuffer())
          const { error: docUploadError } = await serviceSupabase.storage
            .from('company-documents')
            .upload(docStoragePath, docBuffer, { contentType: file.type, upsert: true })

          if (docUploadError) {
            throw new Error(`Upload failed: ${docUploadError.message}`)
          }

          const { data: doc, error: docInsertError } = await supabase
            .from('company_documents')
            .insert({
              file_name: file.name,
              file_path: docStoragePath,
              file_size: file.size,
              file_type: file.type,
              category: docData.category || 'other',
              description: docData.description || null,
              document_date: docData.documentDate || null,
            })
            .select()
            .single()

          if (docInsertError) {
            throw docInsertError
          }

          results.push({
            fileId: fileMeta.id,
            success: true,
            type: 'document',
            id: doc.id,
            filename: fileMeta.suggestedFilename,
          })
          continue
        }

        // Ladda upp fil till Supabase Storage (expenses bucket)
        const fileExt = file.name.split('.').pop() || 'pdf'
        const year =
          fileMeta.type === 'expense'
            ? (fileMeta.data as ExpenseData).date?.substring(0, 4) || new Date().getFullYear().toString()
            : (fileMeta.data as InvoiceData).invoiceDate.substring(0, 4)

        const storagePath =
          fileMeta.type === 'expense'
            ? `receipts/${year}/${sanitizeStorageFilename(fileMeta.suggestedFilename)}.${fileExt}`
            : `invoices/${year}/${sanitizeStorageFilename(fileMeta.suggestedFilename)}.${fileExt}`

        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        const { error: uploadError } = await serviceSupabase.storage.from('expenses').upload(storagePath, buffer, {
          contentType: file.type,
          upsert: true,
        })

        if (uploadError) {
          console.error('Upload error:', uploadError)
        }

        const { data: urlData } = serviceSupabase.storage.from('expenses').getPublicUrl(storagePath)
        const attachmentUrl = urlData?.publicUrl || null

        // File-level duplicate check (same file size = likely same file)
        if (knownFileSizes.has(file.size)) {
          // Possible file duplicate — check if we should skip
          if (skipDuplicates) {
            results.push({
              fileId: fileMeta.id,
              success: false,
              type: fileMeta.type as 'expense' | 'invoice',
              filename: fileMeta.suggestedFilename,
              skippedAsDuplicate: true,
            })
            continue
          }
        }

        if (fileMeta.type === 'expense') {
          // Importera som utgift
          const expenseData = fileMeta.data as ExpenseData

          // Dublettkontroll
          const duplicate = existingExpenses?.find(
            (exp) =>
              exp.date === expenseData.date &&
              exp.supplier.toLowerCase() === expenseData.supplier.toLowerCase() &&
              Math.abs(exp.amount - expenseData.total) < 0.01,
          )

          if (duplicate && skipDuplicates) {
            // Skipped duplicate
            results.push({
              fileId: fileMeta.id,
              success: false,
              type: 'expense',
              filename: fileMeta.suggestedFilename,
              skippedAsDuplicate: true,
              existingExpense: duplicate,
            })
            continue
          }

          const { data: expense, error: insertError } = await supabase
            .from('expenses')
            .insert({
              date: expenseData.date || new Date().toISOString().split('T')[0],
              supplier: expenseData.supplier,
              subtotal: expenseData.subtotal,
              vat_rate: expenseData.vatRate,
              vat_amount: expenseData.vatAmount,
              amount: expenseData.total,
              currency: expenseData.currency || 'SEK',
              amount_base: await toBaseSEK(expenseData.total, expenseData.currency || 'SEK', expenseData.date),
              category: expenseData.category || 'other',
              notes: expenseData.notes || null,
              attachment_url: attachmentUrl,
              user_id: user.id,
            })
            .select()
            .single()

          if (insertError) {
            throw insertError
          }

          // Track newly inserted expense for intra-batch duplicate detection
          knownFileSizes.add(file.size)
          if (expense) {
            existingExpenses?.push({
              id: expense.id,
              date: expenseData.date || new Date().toISOString().split('T')[0],
              supplier: expenseData.supplier,
              amount: expenseData.total,
              category: expenseData.category || 'other',
              file_size: file.size,
            })
          }

          results.push({
            fileId: fileMeta.id,
            success: true,
            type: 'expense',
            id: expense.id,
            filename: fileMeta.suggestedFilename,
            existingExpense: duplicate || undefined, // Varning om dublett importerades ändå
          })
        } else {
          // Importera som faktura
          const invoiceData = fileMeta.data as InvoiceData

          // Dublettkontroll för fakturor (datum + belopp + kundnamn)
          const invoiceDuplicate = existingInvoices?.find((inv) => {
            const client = inv.client as unknown as { name: string } | null
            const nameMatch = client?.name?.toLowerCase() === invoiceData.clientName?.toLowerCase()
            const dateMatch = inv.invoice_date === invoiceData.invoiceDate
            const amountMatch = Math.abs(Number(inv.total) - invoiceData.total) < 0.01
            return (
              (dateMatch && amountMatch) ||
              (nameMatch && amountMatch) ||
              (inv.invoice_number === invoiceData.invoiceNumber && invoiceData.invoiceNumber > 0)
            )
          })

          if (invoiceDuplicate && skipDuplicates) {
            results.push({
              fileId: fileMeta.id,
              success: false,
              type: 'invoice',
              filename: fileMeta.suggestedFilename,
              skippedAsDuplicate: true,
            })
            continue
          }

          // Hantera kund baserat på användarens val
          let clientId: string | null = null
          let createdNewClient = false

          if (invoiceData.selectedClientId !== undefined) {
            // Användaren har gjort ett val
            if (invoiceData.selectedClientId === null) {
              // Användaren vill skapa ny kund
              const { data: newClient, error: clientError } = await supabase
                .from('clients')
                .insert({ name: invoiceData.clientName })
                .select()
                .single()

              if (clientError) {
                throw new Error(`Kunde inte skapa kund "${invoiceData.clientName}": ${clientError.message}`)
              }
              clientId = newClient.id
              createdNewClient = true
              // Created new client (user choice)
            } else {
              // Användaren har valt en befintlig kund
              clientId = invoiceData.selectedClientId
            }
          } else if (invoiceData.clientName) {
            // Ingen val gjort - använd fallback-matchning
            const matchedClient = matchClientByName(invoiceData.clientName, clients || [])
            if (matchedClient) {
              clientId = matchedClient.id
            } else {
              // Skapa ny klient automatiskt
              const { data: newClient, error: clientError } = await supabase
                .from('clients')
                .insert({ name: invoiceData.clientName })
                .select()
                .single()

              if (clientError) {
                throw new Error(`Kunde inte skapa kund "${invoiceData.clientName}": ${clientError.message}`)
              }
              clientId = newClient.id
              createdNewClient = true
              // Created new client (auto)
            }
          }

          if (!clientId) {
            throw new Error('Fakturan saknar kundnamn')
          }

          // Använd dagens datum om fakturadatum saknas
          const invoiceDate = invoiceData.invoiceDate || new Date().toISOString().split('T')[0]

          // Beräkna förfallodatum om det saknas (fakturadatum + 30 dagar)
          let dueDate = invoiceData.dueDate
          if (!dueDate) {
            const dueDateObj = new Date(invoiceDate)
            dueDateObj.setDate(dueDateObj.getDate() + 30)
            dueDate = dueDateObj.toISOString().split('T')[0]
          }

          // Använd nästa lediga fakturanummer (inte AI:ns parsade nummer)
          const invoiceNumber = nextInvoiceNumber++

          const { data: invoice, error: insertError } = await supabase
            .from('invoices')
            .insert({
              invoice_number: invoiceNumber,
              client_id: clientId,
              invoice_date: invoiceDate,
              due_date: dueDate,
              subtotal: invoiceData.subtotal,
              vat_rate: invoiceData.vatRate,
              vat_amount: invoiceData.vatAmount,
              total: invoiceData.total,
              status: 'paid',
              imported_from_pdf: true,
              original_pdf_url: attachmentUrl,
            })
            .select()
            .single()

          if (insertError) {
            throw insertError
          }

          // Track for intra-batch duplicate detection
          knownFileSizes.add(file.size)

          results.push({
            fileId: fileMeta.id,
            success: true,
            type: 'invoice',
            id: invoice.id,
            filename: fileMeta.suggestedFilename,
            createdClient: createdNewClient ? invoiceData.clientName : undefined,
          })
        }
      } catch (error) {
        console.error(`Failed to import ${fileMeta.suggestedFilename}:`, error)
        results.push({
          fileId: fileMeta.id,
          success: false,
          type: fileMeta.type,
          filename: fileMeta.suggestedFilename,
          error: (error as { message?: string })?.message || 'Unknown error',
        })
      }
    }

    const succeeded = results.filter((r) => r.success).length
    const failed = results.filter((r) => !r.success && !r.skippedAsDuplicate).length
    const skipped = results.filter((r) => r.skippedAsDuplicate).length
    const createdClients = results.filter((r) => r.createdClient).map((r) => r.createdClient!)

    // Batch import complete
    // createdClients info returned in response summary

    return NextResponse.json({
      results,
      summary: {
        total: metadata.length,
        succeeded,
        failed,
        skipped,
        expenses: results.filter((r) => r.success && r.type === 'expense').length,
        invoices: results.filter((r) => r.success && r.type === 'invoice').length,
        createdClients,
      },
    })
  } catch (error) {
    console.error('Batch import error:', error)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
