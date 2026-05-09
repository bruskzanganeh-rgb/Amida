import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type InvoiceToCheck = {
  id: string
  invoiceNumber: number
  clientName: string
  invoiceDate: string | null
  total: number
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const invoices: InvoiceToCheck[] = body.invoices || []

    if (invoices.length === 0) {
      return NextResponse.json({ results: [] })
    }

    // Fetch existing invoices for comparison
    const { data: existing } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, total, client:clients(name)')

    const results = invoices.map((inv) => {
      const duplicate = existing?.find((ex) => {
        const client = ex.client as unknown as { name: string } | null
        const numberMatch = ex.invoice_number === inv.invoiceNumber && inv.invoiceNumber > 0
        const dateAmountMatch = ex.invoice_date === inv.invoiceDate && Math.abs(Number(ex.total) - inv.total) < 0.01
        const nameAmountMatch =
          client?.name?.toLowerCase() === inv.clientName?.toLowerCase() && Math.abs(Number(ex.total) - inv.total) < 0.01
        return numberMatch || dateAmountMatch || nameAmountMatch
      })

      return {
        id: inv.id,
        isDuplicate: !!duplicate,
        existingInvoiceId: duplicate?.id || null,
      }
    })

    return NextResponse.json({
      results,
      duplicateCount: results.filter((r) => r.isDuplicate).length,
    })
  } catch (error) {
    console.error('Invoice duplicate check error:', error)
    return NextResponse.json({ error: 'Check failed' }, { status: 500 })
  }
}
