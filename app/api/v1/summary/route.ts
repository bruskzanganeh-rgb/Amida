import { NextRequest } from 'next/server'
import { validateApiKey } from '@/lib/api-auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  try {
    const supabase = createAdminClient()
    const { userId } = auth
    const now = new Date()
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const yearStart = `${now.getFullYear()}-01-01`

    const [gigsRes, invoicesRes, expensesRes, yearGigsRes, yearInvoicesRes] = await Promise.all([
      // Upcoming gigs
      supabase
        .from('gigs')
        .select('id, date, project_name, venue, fee, currency, status, client:clients(name), gig_type:gig_types(name)')
        .eq('user_id', userId)
        .neq('status', 'declined')
        .neq('status', 'draft')
        .gte('date', now.toISOString())
        .lte('date', in30Days.toISOString())
        .order('date', { ascending: true })
        .limit(10),

      // Unpaid invoices
      supabase
        .from('invoices')
        .select('id, invoice_number, total, currency, due_date, status, client:clients(name)')
        .eq('user_id', userId)
        .in('status', ['sent', 'overdue'])
        .order('due_date', { ascending: true })
        .limit(10),

      // Recent expenses
      supabase
        .from('expenses')
        .select('id, date, supplier, amount, currency, category')
        .eq('user_id', userId)
        .gte('date', thirtyDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: false })
        .limit(10),

      // Year stats: gigs
      supabase
        .from('gigs')
        .select('fee, fee_base, status')
        .eq('user_id', userId)
        .gte('date', yearStart)
        .neq('status', 'declined')
        .neq('status', 'draft'),

      // Year stats: invoices
      supabase
        .from('invoices')
        .select('total, total_base, status')
        .eq('user_id', userId)
        .gte('invoice_date', yearStart),
    ])

    if (gigsRes.error) throw gigsRes.error
    if (invoicesRes.error) throw invoicesRes.error
    if (expensesRes.error) throw expensesRes.error

    const yearGigs = yearGigsRes.data || []
    const yearInvoices = yearInvoicesRes.data || []

    const stats = {
      year: now.getFullYear(),
      total_gigs: yearGigs.length,
      total_invoiced: yearInvoices.reduce((sum, i) => sum + (i.total_base || i.total), 0),
      total_paid: yearInvoices
        .filter((i) => i.status === 'paid')
        .reduce((sum, i) => sum + (i.total_base || i.total), 0),
      total_fees: yearGigs.reduce((sum, g) => sum + (g.fee_base ?? g.fee ?? 0), 0),
    }

    return apiSuccess({
      upcoming_gigs: gigsRes.data || [],
      unpaid_invoices: invoicesRes.data || [],
      recent_expenses: expensesRes.data || [],
      stats,
      generated_at: now.toISOString(),
    })
  } catch (error) {
    console.error('[API v1] Summary error:', error)
    return apiError('Failed to fetch summary', 500)
  }
}
