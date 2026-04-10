import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logContractEvent } from '@/lib/contracts/audit'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { Resend } from 'resend'

async function requireAdmin(supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: isAdmin } = await supabase.rpc('is_admin', { uid: user.id })
  if (!isAdmin) return null
  return user
}

function contractInfoHtml(
  contract: {
    contract_number: string
    tier: string
    annual_price: number
    currency: string
    contract_duration_months: number
  },
  companyName: string,
) {
  return `
    <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <table style="width: 100%; font-size: 14px; color: #111827;">
        <tr><td style="padding: 4px 0; color: #6b7280;">Organization</td><td style="padding: 4px 0; font-weight: 600;">${companyName}</td></tr>
        <tr><td style="padding: 4px 0; color: #6b7280;">Tier</td><td style="padding: 4px 0; font-weight: 600;">${contract.tier}</td></tr>
        <tr><td style="padding: 4px 0; color: #6b7280;">Annual Price</td><td style="padding: 4px 0; font-weight: 600;">${contract.annual_price} ${contract.currency}</td></tr>
        <tr><td style="padding: 4px 0; color: #6b7280;">Duration</td><td style="padding: 4px 0; font-weight: 600;">${contract.contract_duration_months} months</td></tr>
      </table>
    </div>
  `
}

// POST /api/contracts/[id]/send — Send for review or signing
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`contract-send:${ip}`, 5, 60_000)
  if (!success) return rateLimitResponse()

  const supabase = await createClient()
  const user = await requireAdmin(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const adminClient = createAdminClient()

  const { data: contract, error } = await adminClient
    .from('contracts')
    .select('*, company:companies(company_name)')
    .eq('id', id)
    .single()

  if (error || !contract) {
    return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
  }

  if (!['draft', 'sent', 'sent_to_reviewer'].includes(contract.status)) {
    return NextResponse.json({ error: 'Contract cannot be sent in current status' }, { status: 400 })
  }

  // Get email config
  const { data: configRows } = await adminClient
    .from('platform_config')
    .select('key, value')
    .in('key', ['resend_api_key', 'resend_from_email'])

  const config = Object.fromEntries((configRows || []).map((r: { key: string; value: string }) => [r.key, r.value]))
  if (!config.resend_api_key) {
    return NextResponse.json({ error: 'Email not configured' }, { status: 500 })
  }

  const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || ''
  const companyName = (contract.company as unknown as { company_name: string } | null)?.company_name || 'N/A'
  const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
  const resend = new Resend(config.resend_api_key)
  const fromEmail = config.resend_from_email || 'noreply@amida.se'

  const hasReviewer = contract.reviewer_email && contract.reviewer_email.trim()

  // Two-step flow: send to reviewer first
  if (hasReviewer && contract.status === 'draft') {
    const reviewerToken = randomBytes(32).toString('hex')

    await adminClient
      .from('contracts')
      .update({
        reviewer_token: reviewerToken,
        reviewer_token_expires_at: tokenExpiresAt.toISOString(),
        status: 'sent_to_reviewer',
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    const reviewUrl = `${baseUrl}/review/${reviewerToken}`

    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: contract.reviewer_email!,
      subject: `Agreement for Review — ${contract.contract_number}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #111827; margin-bottom: 8px;">Agreement Review Request</h2>
          <p style="color: #6b7280; font-size: 14px;">Agreement ${contract.contract_number} has been sent to you for review. After your approval, it will be forwarded to ${contract.signer_name} (${contract.signer_email}) for signing.</p>
          ${contractInfoHtml(contract, companyName)}
          <div style="text-align: center; margin: 32px 0;">
            <a href="${reviewUrl}" style="display: inline-block; background: #111827; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Review Agreement
            </a>
          </div>
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            This link expires on ${tokenExpiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.<br/>
            If you did not expect this email, please disregard it.
          </p>
        </div>
      `,
    })

    if (emailError) {
      console.error('Failed to send review email:', emailError)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    await logContractEvent(adminClient, {
      contract_id: id,
      event_type: 'sent_to_reviewer',
      actor_email: user.email,
      ip_address: ip,
      document_hash_sha256: contract.document_hash_sha256,
      metadata: { reviewer_email: contract.reviewer_email, signer_email: contract.signer_email },
    })

    return NextResponse.json({ success: true, sent_to: contract.reviewer_email, step: 'reviewer' })
  }

  // Direct flow (no reviewer) or resend to signer
  const signingToken = randomBytes(32).toString('hex')
  const isResend = ['sent', 'sent_to_reviewer'].includes(contract.status)

  await adminClient
    .from('contracts')
    .update({
      signing_token: signingToken,
      token_expires_at: tokenExpiresAt.toISOString(),
      status: 'sent',
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  const signUrl = `${baseUrl}/sign/${signingToken}`

  const { error: emailError } = await resend.emails.send({
    from: fromEmail,
    to: contract.signer_email,
    subject: `Agreement Ready for Signing — ${contract.contract_number}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #111827; margin-bottom: 8px;">Subscription Agreement</h2>
        <p style="color: #6b7280; font-size: 14px;">Agreement ${contract.contract_number} is ready for your review and signature.</p>
        ${contractInfoHtml(contract, companyName)}
        <div style="text-align: center; margin: 32px 0;">
          <a href="${signUrl}" style="display: inline-block; background: #111827; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
            Review and Sign Agreement
          </a>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">
          This link expires on ${tokenExpiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.<br/>
          If you did not expect this email, please disregard it.
        </p>
      </div>
    `,
  })

  if (emailError) {
    console.error('Failed to send contract email:', emailError)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }

  await logContractEvent(adminClient, {
    contract_id: id,
    event_type: isResend ? 'resent' : 'sent',
    actor_email: user.email,
    ip_address: ip,
    document_hash_sha256: contract.document_hash_sha256,
    metadata: { signer_email: contract.signer_email },
  })

  return NextResponse.json({ success: true, sent_to: contract.signer_email, step: 'signer' })
}
