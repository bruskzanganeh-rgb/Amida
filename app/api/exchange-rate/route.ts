import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

const SUPPORTED = new Set(['SEK', 'EUR', 'USD', 'DKK', 'NOK', 'GBP', 'CHF', 'CZK', 'PLN'])

/**
 * Server-side proxy for Frankfurter exchange rate API.
 * Avoids client-side CSP restrictions and keeps external APIs off the browser.
 *
 * GET /api/exchange-rate?from=EUR&to=SEK&date=2026-04-09
 */
export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`exchange-rate:${ip}`, 60, 60_000)
  if (!success) return rateLimitResponse()

  // Require auth to prevent abuse
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const date = searchParams.get('date')

  if (!from || !to || !date) {
    return NextResponse.json({ error: 'Missing from, to, or date parameter' }, { status: 400 })
  }
  if (!SUPPORTED.has(from) || !SUPPORTED.has(to)) {
    return NextResponse.json({ error: 'Unsupported currency' }, { status: 400 })
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date format (expected yyyy-MM-dd)' }, { status: 400 })
  }

  if (from === to) {
    return NextResponse.json({ rate: 1.0 })
  }

  try {
    const url = `https://api.frankfurter.dev/v1/${date}?from=${from}&to=${to}`
    const response = await fetch(url, {
      // Cache at the edge — exchange rates for past dates never change
      next: { revalidate: 60 * 60 * 24 }, // 24h
    })

    if (!response.ok) {
      return NextResponse.json({ error: `Frankfurter API error: ${response.statusText}` }, { status: 502 })
    }

    const data = await response.json()
    const rate = data.rates?.[to]
    if (typeof rate !== 'number') {
      return NextResponse.json({ error: 'Rate not found in response' }, { status: 502 })
    }

    return NextResponse.json({ rate })
  } catch (error) {
    console.error('Exchange rate fetch error:', error)
    return NextResponse.json({ error: 'Could not fetch exchange rate' }, { status: 500 })
  }
}
