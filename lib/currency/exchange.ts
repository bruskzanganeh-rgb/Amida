import { createClient } from '@/lib/supabase/client'

export type SupportedCurrency = 'SEK' | 'EUR' | 'USD' | 'DKK' | 'NOK' | 'GBP' | 'CHF' | 'CZK' | 'PLN'

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ['SEK', 'EUR', 'USD', 'DKK', 'NOK', 'GBP', 'CHF', 'CZK', 'PLN']

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  SEK: 'SEK', // Use code for consistency with NOK/DKK (all "kr" locally)
  EUR: '€',
  USD: '$',
  DKK: 'DKK',
  NOK: 'NOK',
  GBP: '£',
  CHF: 'CHF',
  CZK: 'Kč',
  PLN: 'zł',
}

export function formatCurrency(amount: number, currency: SupportedCurrency, locale = 'sv-SE'): string {
  const symbol = CURRENCY_SYMBOLS[currency]
  const formatted = amount.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })

  // For EUR, USD, GBP, put symbol before amount
  if (currency === 'EUR' || currency === 'USD' || currency === 'GBP') {
    return `${symbol}${formatted}`
  }
  // For other currencies, put symbol after
  return `${formatted} ${symbol}`
}

/**
 * Fetch exchange rate via our server-side proxy route.
 * Uses /api/exchange-rate which proxies Frankfurter (avoids client-side CSP issues).
 * Returns the rate: 1 unit of `from` = X units of `to`.
 */
async function fetchRateFromAPI(from: SupportedCurrency, to: SupportedCurrency, date: string): Promise<number> {
  if (from === to) return 1.0

  const url = `/api/exchange-rate?from=${from}&to=${to}&date=${date}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch exchange rate: ${response.statusText}`)
  }

  const data = await response.json()
  if (typeof data.rate !== 'number') {
    throw new Error('Invalid exchange rate response')
  }
  return data.rate
}

/**
 * Direct Frankfurter fetch for server-side usage (API routes, server components).
 * Bypasses the /api proxy since we're already on the server.
 */
async function fetchRateFromFrankfurter(from: SupportedCurrency, to: SupportedCurrency, date: string): Promise<number> {
  if (from === to) return 1.0

  const url = `https://api.frankfurter.app/${date}?from=${from}&to=${to}`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch exchange rate: ${response.statusText}`)
  }

  const data = await response.json()
  return data.rates[to]
}

/**
 * Get exchange rate with DB caching.
 * 1. Check exchange_rates table
 * 2. If not found, fetch from API and cache
 * 3. Return rate
 */
export async function getRate(from: SupportedCurrency, to: SupportedCurrency, date: string): Promise<number> {
  if (from === to) return 1.0

  const supabase = createClient()

  // Check cache
  const { data: cached } = await supabase
    .from('exchange_rates')
    .select('rate')
    .eq('base_currency', from)
    .eq('target_currency', to)
    .eq('date', date)
    .single()

  if (cached) return Number(cached.rate)

  // Fetch from API
  try {
    const rate = await fetchRateFromAPI(from, to, date)

    // Cache it
    await supabase.from('exchange_rates').upsert(
      {
        base_currency: from,
        target_currency: to,
        rate,
        date,
        source: 'ecb',
      },
      { onConflict: 'base_currency,target_currency,date' },
    )

    return rate
  } catch (error) {
    console.error('Failed to fetch exchange rate:', error)
    // Fallback: try to find the closest available rate
    const { data: fallback } = await supabase
      .from('exchange_rates')
      .select('rate')
      .eq('base_currency', from)
      .eq('target_currency', to)
      .lte('date', date)
      .order('date', { ascending: false })
      .limit(1)
      .single()

    if (fallback) return Number(fallback.rate)

    throw new Error(`No exchange rate available for ${from}→${to} on ${date}`)
  }
}

/**
 * Convert an amount from one currency to another using the rate for a specific date.
 */
export async function convert(
  amount: number,
  from: SupportedCurrency,
  to: SupportedCurrency,
  date: string,
): Promise<{ converted: number; rate: number }> {
  const rate = await getRate(from, to, date)
  return {
    converted: Math.round(amount * rate * 100) / 100,
    rate,
  }
}

/**
 * Server-side rate fetching (for API routes).
 * Uses service-level Supabase client.
 */
export async function getRateServer(from: SupportedCurrency, to: SupportedCurrency, date: string): Promise<number> {
  if (from === to) return 1.0

  // For server routes, hit Frankfurter directly (no proxy needed, no client CSP)
  return fetchRateFromFrankfurter(from, to, date)
}
