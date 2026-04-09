'use client'

import { useCompany } from '@/lib/hooks/use-company'
import { CURRENCY_SYMBOLS, type SupportedCurrency } from '@/lib/currency/exchange'
import { useLocale } from 'next-intl'

/**
 * Returns the active company's base currency code, symbol and a "per day" suffix.
 * Use this instead of hardcoded "kr" so NOK/DKK/EUR/etc users see the right unit.
 */
export function useBaseCurrency() {
  const { company } = useCompany()
  const locale = useLocale()
  const code = ((company?.base_currency as SupportedCurrency) || 'SEK') as SupportedCurrency
  const symbol = CURRENCY_SYMBOLS[code]
  const perDayLabel = `${symbol}/${locale === 'sv' ? 'dag' : 'day'}`
  return { code, symbol, perDayLabel }
}
