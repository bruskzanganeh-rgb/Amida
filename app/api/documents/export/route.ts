import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString())
    const type = searchParams.get('type') || 'invoices'

    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    if (type === 'invoices') {
      const { data: invoices, error } = await supabase
        .from('invoices')
        .select(
          'invoice_number, invoice_date, due_date, paid_date, subtotal, vat_rate, vat_amount, total, status, currency, client:clients(name)',
        )
        .gte('invoice_date', startDate)
        .lte('invoice_date', endDate)
        .order('invoice_date', { ascending: true })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      const headers = [
        'Fakturanr',
        'Datum',
        'Förfallodatum',
        'Betald',
        'Kund',
        'Belopp ex moms',
        'Moms',
        'Totalt',
        'Valuta',
        'Status',
      ]
      const rows = (invoices || []).map((inv) => {
        const client = inv.client as unknown as { name: string } | null
        return [
          inv.invoice_number,
          inv.invoice_date,
          inv.due_date,
          inv.paid_date || '',
          `"${(client?.name || '').replace(/"/g, '""')}"`,
          inv.subtotal,
          inv.vat_amount,
          inv.total,
          inv.currency || 'SEK',
          inv.status,
        ].join(';')
      })

      const csv = [headers.join(';'), ...rows].join('\n')
      const bom = '\uFEFF'

      return new NextResponse(bom + csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="fakturor-${year}-${month.toString().padStart(2, '0')}.csv"`,
        },
      })
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (error) {
    console.error('Document export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
