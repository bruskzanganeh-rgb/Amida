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

type FileMetadata = {
  id: string
  type: 'expense' | 'invoice'
  data: ExpenseData | InvoiceData
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
  type: 'expense' | 'invoice'
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
      .select('id, date, supplier, amount, category')
      .eq('user_id', user.id)
      .in('date', expenseDates.length > 0 ? expenseDates : ['1900-01-01'])

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
        // Ladda upp fil till Supabase Storage
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

        // Hämta public URL
        const { data: urlData } = serviceSupabase.storage.from('expenses').getPublicUrl(storagePath)

        const attachmentUrl = urlData?.publicUrl || null

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
          if (expense) {
            existingExpenses?.push({
              id: expense.id,
              date: expenseData.date || new Date().toISOString().split('T')[0],
              supplier: expenseData.supplier,
              amount: expenseData.total,
              category: expenseData.category || 'other',
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

          const { data: invoice, error: insertError } = await supabase
            .from('invoices')
            .insert({
              invoice_number: invoiceData.invoiceNumber,
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

          // Invoice imported

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
