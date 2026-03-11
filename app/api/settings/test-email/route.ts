import { NextRequest, NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    // Authenticate user
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

    const { provider, to_email, smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name } =
      parsed.data

    const serviceSupabase = createAdminClient()

    if (provider === 'platform') {
      // Test via Resend - use service role for platform config
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
    }

    // Test via SMTP
    if (!smtp_host || !smtp_from_email) {
      return NextResponse.json({ error: 'SMTP host and sender email required' }, { status: 400 })
    }

    const transporter = nodemailer.createTransport({
      host: smtp_host.trim(),
      port: smtp_port || 587,
      secure: smtp_port === 465,
      auth: smtp_user
        ? {
            user: smtp_user.trim(),
            pass: smtp_password || '',
          }
        : undefined,
    })

    await transporter.verify()

    const fromAddress = smtp_from_name ? `"${smtp_from_name}" <${smtp_from_email}>` : smtp_from_email

    await transporter.sendMail({
      from: fromAddress,
      to: to_email,
      subject: 'Test av SMTP-inställningar',
      text: 'Detta är ett testmail från Amida för att verifiera att SMTP-inställningarna fungerar korrekt.',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #111827;">SMTP-test lyckades!</h2>
          <p style="color: #6b7280;">
            Detta mail bekräftar att dina SMTP-inställningar i Amida är korrekt konfigurerade.
          </p>
          <p style="color: #6b7280;">
            Du kan nu skicka fakturor via e-post direkt från systemet.
          </p>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
          <p style="color: #9ca3af; font-size: 12px;">Skickat från Amida</p>
        </div>
      `,
    })

    return NextResponse.json({ success: true, message: 'Test email sent!' })
  } catch (error) {
    console.error('Test email error:', error)

    let errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (errorMessage.includes('EBADNAME') || errorMessage.includes('ENOTFOUND')) {
      errorMessage = 'Could not find SMTP server. Check the hostname for typos or extra spaces.'
    } else if (errorMessage.includes('ECONNREFUSED')) {
      errorMessage = 'SMTP server refused the connection. Verify the port is correct (usually 465 or 587).'
    } else if (errorMessage.includes('EAUTH') || errorMessage.includes('Invalid login')) {
      errorMessage = 'Wrong username or password. Use the full email address as username.'
    } else if (errorMessage.includes('ESOCKET') || errorMessage.includes('timeout')) {
      errorMessage = 'Connection timed out. Try switching between port 465 (SSL) and 587 (TLS).'
    } else if (errorMessage.includes('certificate')) {
      errorMessage = 'SSL/TLS certificate error. Try switching between port 465 (SSL) and 587 (TLS).'
    } else if (errorMessage.includes('EENVELOPE') || errorMessage.includes('Invalid address')) {
      errorMessage = 'Invalid sender or recipient email address. Check the "from" email field.'
    }

    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
