import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recomputeBaseAmounts } from '@/lib/currency/recompute'

/**
 * Recompute all stored base-currency amounts (gigs/expenses/invoices) for the
 * caller's company against the company's current base_currency. Called after
 * the base currency is changed in Settings so totals stay correct.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()

    const companyId = membership?.company_id
    if (!companyId) {
      return NextResponse.json({ error: 'No company found' }, { status: 400 })
    }

    const { data: company } = await supabase.from('companies').select('base_currency').eq('id', companyId).single()

    const base = company?.base_currency || 'SEK'

    const result = await recomputeBaseAmounts(supabase, companyId, base)

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Recompute base amounts error:', error)
    return NextResponse.json({ error: 'Could not recompute base amounts' }, { status: 500 })
  }
}
