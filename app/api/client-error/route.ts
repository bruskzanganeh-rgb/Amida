import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`client-error:${ip}`, 10, 60_000)
  if (!success) return rateLimitResponse()

  try {
    const body = await req.json()
    const { message, stack, componentStack, url } = body

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Missing message' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const admin = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin.from as any)('client_errors').insert({
      user_id: user?.id || null,
      error_message: message.slice(0, 1000),
      error_stack: typeof stack === 'string' ? stack.slice(0, 5000) : null,
      component_stack: typeof componentStack === 'string' ? componentStack.slice(0, 5000) : null,
      url: typeof url === 'string' ? url.slice(0, 500) : null,
      user_agent: req.headers.get('user-agent')?.slice(0, 500) || null,
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
