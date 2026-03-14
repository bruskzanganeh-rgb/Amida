import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`test-email:${ip}`, 5, 60_000)
  if (!success) return rateLimitResponse()

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { testEmailSchema } = await import('@/lib/schemas/settings')
    const parsed = testEmailSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { to_email } = parsed.data

    const serviceSupabase = createAdminClient()

    const { data: configRows } = await serviceSupabase
      .from('platform_config')
      .select('key, value')
      .in('key', ['resend_api_key', 'resend_from_email'])

    const config = Object.fromEntries((configRows || []).map((r) => [r.key, r.value]))

    if (!config.resend_api_key) {
      return NextResponse.json({ error: 'Platform email is not configured. Contact admin.' }, { status: 400 })
    }

    const resend = new Resend(config.resend_api_key)
    const fromEmail = config.resend_from_email || 'noreply@babalisk.com'

    await resend.emails.send({
      from: `Amida <${fromEmail}>`,
      to: [to_email],
      subject: 'Test av e-postinställningar',
      text: 'Detta är ett testmail från Amida.',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #111827;">E-posttest lyckades!</h2>
          <p style="color: #6b7280;">
            Detta mail bekräftar att plattformens e-post fungerar korrekt.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px;">Skickat från Amida</p>
        </div>
      `,
    })

    return NextResponse.json({ success: true, message: 'Test email sent!' })
  } catch (error) {
    console.error('Test email error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
