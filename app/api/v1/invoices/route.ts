import { NextRequest } from 'next/server'
import { validateApiKey, requireScope } from '@/lib/api-auth'
import { apiSuccess, apiError, apiValidationError } from '@/lib/api-response'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createInvoiceSchema } from '@/lib/schemas/invoice'
import { getUserTimeZone } from '@/lib/company-timezone'
import { todayInTimeZone, parseLocalDate, formatYMD } from '@/lib/dates'
import type { Database } from '@/lib/types/supabase'

type InvoiceStatus = Database['public']['Enums']['invoice_status']

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'read:invoices')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const { searchParams } = request.nextUrl
    const status = searchParams.get('status')
    const clientId = searchParams.get('client_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
    const offset = parseInt(searchParams.get('offset') || '0')

    const supabase = createAdminClient()
    let query = supabase
      .from('invoices')
      .select(
        `
        *,
        client:clients(id, name, email)
      `,
        { count: 'exact' },
      )
      .eq('user_id', auth.userId)

    if (status) query = query.eq('status', status as InvoiceStatus)
    if (clientId) query = query.eq('client_id', clientId)

    query = query.order('invoice_number', { ascending: false }).range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw error

    return apiSuccess({
      invoices: data || [],
      pagination: { total: count || 0, limit, offset, has_more: (count || 0) > offset + limit },
    })
  } catch (error) {
    console.error('[API v1] GET invoices error:', error)
    return apiError('Failed to fetch invoices', 500)
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'write:invoices')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const body = await request.json()
    const parsed = createInvoiceSchema.safeParse(body)
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>)
    }

    const supabase = createAdminClient()

    // Atomic, never-reused invoice number via the company counter (avoids the
    // race + number-reuse of max+1). Fall back to max+1 only if there's no
    // company or the RPC fails.
    let nextNumber: number
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', auth.userId)
      .limit(1)
      .maybeSingle()
    const companyId = membership?.company_id
    if (companyId) {
      const { data: rpcNum, error: rpcErr } = await supabase.rpc('get_next_invoice_number', { cid: companyId })
      if (rpcErr || rpcNum == null) {
        return apiError('Could not allocate invoice number', 500)
      }
      nextNumber = rpcNum as number
    } else {
      const { data: lastInvoice } = await supabase
        .from('invoices')
        .select('invoice_number')
        .eq('user_id', auth.userId)
        .order('invoice_number', { ascending: false })
        .limit(1)
        .maybeSingle()
      nextNumber = (lastInvoice?.invoice_number || 0) + 1
    }

    // Calculate totals from lines
    const lines = parsed.data.lines
    const subtotal = Math.round(lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0) * 100) / 100
    const vatAmount = Math.round(subtotal * (parsed.data.vat_rate / 100) * 100) / 100
    const total = Math.round((subtotal + vatAmount) * 100) / 100

    const tz = await getUserTimeZone(auth.userId)
    const invoiceDate = todayInTimeZone(tz)
    const dueDateObj = parseLocalDate(invoiceDate)
    dueDateObj.setDate(dueDateObj.getDate() + parsed.data.payment_terms)
    const dueDate = formatYMD(dueDateObj)

    // v1 invoices are created in the company base currency; set the base-currency
    // columns explicitly so they're never null (else totals mis-sum as raw).
    let baseCurrency = 'SEK'
    if (companyId) {
      const { data: company } = await supabase.from('companies').select('base_currency').eq('id', companyId).single()
      if (company?.base_currency) baseCurrency = company.base_currency
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        user_id: auth.userId,
        client_id: parsed.data.client_id,
        invoice_number: nextNumber,
        invoice_date: invoiceDate,
        due_date: dueDate,
        subtotal,
        vat_rate: parsed.data.vat_rate,
        vat_amount: vatAmount,
        total,
        total_base: total,
        currency: baseCurrency,
        exchange_rate: 1,
        status: 'draft',
      })
      .select()
      .single()

    if (invoiceError) throw invoiceError

    // Insert lines — DB schema uses `amount` (not quantity/unit_price)
    const invoiceLines = lines.map((line, i) => ({
      invoice_id: invoice.id,
      description: line.description,
      amount: line.quantity * line.unit_price,
      vat_rate: line.vat_rate,
      sort_order: i + 1,
    }))

    await supabase.from('invoice_lines').insert(invoiceLines)

    // Fetch complete invoice
    const { data: fullInvoice } = await supabase
      .from('invoices')
      .select(
        `
        *,
        client:clients(id, name, email),
        invoice_lines(*)
      `,
      )
      .eq('id', invoice.id)
      .single()

    return apiSuccess(fullInvoice, 201)
  } catch (error) {
    console.error('[API v1] POST invoice error:', error)
    return apiError('Failed to create invoice', 500)
  }
}
