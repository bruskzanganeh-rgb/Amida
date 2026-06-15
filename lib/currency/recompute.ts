import type { SupabaseClient } from '@supabase/supabase-js'
import { getRateServer, type SupportedCurrency } from './exchange'

const round2 = (n: number) => Math.round(n * 100) / 100

function clampDate(date: string | null | undefined): string {
  const today = new Date().toISOString().split('T')[0]
  if (!date) return today
  const d = date.length > 10 ? date.slice(0, 10) : date
  return d > today ? today : d
}

export type RecomputeResult = {
  base: string
  gigs: number
  expenses: number
  invoices: number
  failures: number
}

/**
 * Recompute every stored "base currency" amount for a company so they reflect
 * the given base currency. Runs when the base currency changes (or to repair
 * bad data). Uses Frankfurter rates (server-side), memoised per currency+date.
 *
 * - gigs:     fee_base, travel_expense_base, exchange_rate
 * - expenses: amount_base
 * - invoices: total_base, exchange_rate
 *
 * `currency === base` (or null currency) → rate 1, base amount = original.
 * If a rate lookup fails, that record is left untouched and counted as a failure.
 */
export async function recomputeBaseAmounts(
  supabase: SupabaseClient,
  companyId: string,
  base: string,
): Promise<RecomputeResult> {
  const rateCache = new Map<string, number>()
  let failures = 0

  async function rateFor(currency: string | null | undefined, date: string | null | undefined): Promise<number | null> {
    const from = currency || base
    if (from === base) return 1
    const day = clampDate(date)
    const key = `${from}:${day}`
    const cached = rateCache.get(key)
    if (cached !== undefined) return cached
    try {
      const r = await getRateServer(from as SupportedCurrency, base as SupportedCurrency, day)
      rateCache.set(key, r)
      return r
    } catch {
      failures++
      return null
    }
  }

  // --- Gigs ---------------------------------------------------------------
  const { data: gigs } = await supabase
    .from('gigs')
    .select('id, fee, travel_expense, currency, date, start_date')
    .eq('company_id', companyId)
  let gigCount = 0
  for (const g of gigs ?? []) {
    const r = await rateFor(g.currency, g.start_date || g.date)
    if (r === null) continue
    await supabase
      .from('gigs')
      .update({
        fee_base: g.fee != null ? round2(Number(g.fee) * r) : null,
        travel_expense_base: g.travel_expense != null ? round2(Number(g.travel_expense) * r) : null,
        exchange_rate: r,
      })
      .eq('id', g.id)
    gigCount++
  }

  // --- Expenses -----------------------------------------------------------
  const { data: expenses } = await supabase
    .from('expenses')
    .select('id, amount, currency, date')
    .eq('company_id', companyId)
  let expenseCount = 0
  for (const e of expenses ?? []) {
    const r = await rateFor(e.currency, e.date)
    if (r === null) continue
    await supabase
      .from('expenses')
      .update({ amount_base: e.amount != null ? round2(Number(e.amount) * r) : null })
      .eq('id', e.id)
    expenseCount++
  }

  // --- Invoices -----------------------------------------------------------
  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, total, currency, invoice_date')
    .eq('company_id', companyId)
  let invoiceCount = 0
  for (const inv of invoices ?? []) {
    const r = await rateFor(inv.currency, inv.invoice_date)
    if (r === null) continue
    await supabase
      .from('invoices')
      .update({
        total_base: inv.total != null ? round2(Number(inv.total) * r) : null,
        exchange_rate: r,
      })
      .eq('id', inv.id)
    invoiceCount++
  }

  return { base, gigs: gigCount, expenses: expenseCount, invoices: invoiceCount, failures }
}
