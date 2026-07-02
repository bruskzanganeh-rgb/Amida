import { formatCurrency, type SupportedCurrency } from './exchange'

/**
 * Format a fee/amount in its own currency (defaults to SEK when unknown).
 * Shared helper — was previously copy-pasted identically in several components.
 */
export function fmtFee(amount: number, currency?: string | null): string {
  return formatCurrency(amount, (currency || 'SEK') as SupportedCurrency)
}
