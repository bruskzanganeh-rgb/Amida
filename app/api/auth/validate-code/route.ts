import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { validateCodeSchema } from '@/lib/schemas/auth'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: Request) {
  // Unauthenticated endpoint — rate-limit per IP to stop code brute-forcing.
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  if (!rateLimit(`validate-code:${ip}`, 10, 60_000).success) return rateLimitResponse()

  const body = await request.json()
  const parsed = validateCodeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ valid: false }, { status: 400 })
  }

  const { code } = parsed.data

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data, error } = await supabase
    .from('invitation_codes')
    .select('id, code, max_uses, use_count, expires_at')
    .eq('code', code.trim().toUpperCase())
    .single()

  if (error || !data) {
    return NextResponse.json({ valid: false })
  }

  // Check expiry
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ valid: false, reason: 'expired' })
  }

  // Check usage limit
  if (data.use_count >= data.max_uses) {
    return NextResponse.json({ valid: false, reason: 'used' })
  }

  return NextResponse.json({ valid: true })
}
