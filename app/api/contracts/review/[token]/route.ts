import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { logContractEvent } from '@/lib/contracts/audit'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { Resend } from 'resend'

function getClientInfo(request: NextRequest) {
  return {
    ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
    userAgent: request.headers.get('user-agent') || 'unknown',
  }
}

// GET /api/contracts/review/[token] — Public: get contract data for review page
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { ip } = getClientInfo(request)
  const { success } = rateLimit(`contract-review-view:${ip}`, 10, 60_000)
  if (!success) return rateLimitResponse()

  const { token } = await params
  const adminClient = createAdminClient()

  const { data: contract, error } = await adminClient
    .from('contracts')
    .select(
      'id, contract_number, tier, annual_price, currency, billing_interval, vat_rate_pct, contract_start_date, contract_duration_months, custom_terms, signer_name, signer_email, reviewer_name, reviewer_email, reviewer_title, status, reviewer_token_expires_at, document_hash_sha256, unsigned_pdf_path, company:companies(company_name, org_number, address)',
    )
    .eq('reviewer_token', token)
    .single()

  if (error || !contract) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  if (contract.reviewer_token_expires_at && new Date(contract.reviewer_token_expires_at) < new Date()) {
    await adminClient.from('contracts').update({ status: 'expired' }).eq('id', contract.id)
    return NextResponse.json({ error: 'This review link has expired' }, { status: 410 })
  }

  if (contract.status === 'signed') {
    return NextResponse.json({ error: 'This agreement has already been signed' }, { status: 410 })
  }

  if (contract.status === 'cancelled') {
    return NextResponse.json({ error: 'This agreement has been cancelled' }, { status: 410 })
  }

  // Mark as reviewed on first view
  if (contract.status === 'sent_to_reviewer') {
    await adminClient
      .from('contracts')
      .update({ status: 'reviewed', reviewed_at: new Date().toISOString() })
      .eq('id', contract.id)

    await logContractEvent(adminClient, {
      contract_id: contract.id,
      event_type: 'reviewed',
      actor_email: contract.reviewer_email,
      ip_address: ip,
      document_hash_sha256: contract.document_hash_sha256,
    })
  }

  // PDF signed URL
  let pdfUrl: string | null = null
  if (contract.unsigned_pdf_path) {
    const { data } = await adminClient.storage.from('contracts').createSignedUrl(contract.unsigned_pdf_path, 3600)
    pdfUrl = data?.signedUrl || null
  }

  return NextResponse.json({
    contract_number: contract.contract_number,
    tier: contract.tier,
    annual_price: contract.annual_price,
    currency: contract.currency,
    billing_interval: contract.billing_interval,
    vat_rate_pct: contract.vat_rate_pct,
    contract_start_date: contract.contract_start_date,
    contract_duration_months: contract.contract_duration_months,
    signer_name: contract.signer_name,
    signer_email: contract.signer_email,
    reviewer_name: contract.reviewer_name,
    reviewer_email: contract.reviewer_email,
    company_name: (contract.company as unknown as { company_name: string } | null)?.company_name || null,
    document_hash: contract.document_hash_sha256,
    pdf_url: pdfUrl,
    status: contract.status,
  })
}

// POST /api/contracts/review/[token] — Reviewer approves and forwards to signer
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { ip, userAgent } = getClientInfo(request)
  const { success } = rateLimit(`contract-review-approve:${ip}`, 3, 60_000)
  if (!success) return rateLimitResponse()

  const { token } = await params
  const adminClient = createAdminClient()

  const { data: contract, error } = await adminClient
    .from('contracts')
    .select('*, company:companies(company_name)')
    .eq('reviewer_token', token)
    .single()

  if (error || !contract) {
    return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })
  }

  if (contract.reviewer_token_expires_at && new Date(contract.reviewer_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This review link has expired' }, { status: 410 })
  }

  if (!['sent_to_reviewer', 'reviewed'].includes(contract.status)) {
    return NextResponse.json({ error: 'Contract has already been forwarded or signed' }, { status: 400 })
  }

  // Generate signing token for the signer
  const signingToken = randomBytes(32).toString('hex')
  const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  await adminClient
    .from('contracts')
    .update({
      signing_token: signingToken,
      token_expires_at: tokenExpiresAt.toISOString(),
      status: 'sent',
      reviewer_token: null, // Invalidate reviewer token
      updated_at: new Date().toISOString(),
    })
    .eq('id', contract.id)

  // Audit log
  await logContractEvent(adminClient, {
    contract_id: contract.id,
    event_type: 'approved',
    actor_email: contract.reviewer_email,
    ip_address: ip,
    user_agent: userAgent,
    document_hash_sha256: contract.document_hash_sha256,
    metadata: { forwarded_to: contract.signer_email },
  })

  // Send signing email to signer
  const { data: configRows } = await adminClient
    .from('platform_config')
    .select('key, value')
    .in('key', ['resend_api_key', 'resend_from_email'])

  const config = Object.fromEntries((configRows || []).map((r: { key: string; value: string }) => [r.key, r.value]))

  if (config.resend_api_key) {
    const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || ''
    const signUrl = `${baseUrl}/sign/${signingToken}`
    const companyName = (contract.company as unknown as { company_name: string } | null)?.company_name || 'N/A'

    const resend = new Resend(config.resend_api_key)
    await resend.emails.send({
      from: config.resend_from_email || 'noreply@amida.se',
      to: contract.signer_email,
      subject: `Agreement Ready for Signing — ${contract.contract_number}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #111827; margin-bottom: 8px;">Subscription Agreement</h2>
          <p style="color: #6b7280; font-size: 14px;">Agreement ${contract.contract_number} has been reviewed and approved. It is now ready for your signature.</p>
          <div style="background: #f9fafb; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <table style="width: 100%; font-size: 14px; color: #111827;">
              <tr><td style="padding: 4px 0; color: #6b7280;">Organization</td><td style="padding: 4px 0; font-weight: 600;">${companyName}</td></tr>
              <tr><td style="padding: 4px 0; color: #6b7280;">Tier</td><td style="padding: 4px 0; font-weight: 600;">${contract.tier}</td></tr>
              <tr><td style="padding: 4px 0; color: #6b7280;">Annual Price</td><td style="padding: 4px 0; font-weight: 600;">${contract.annual_price} ${contract.currency}</td></tr>
              <tr><td style="padding: 4px 0; color: #6b7280;">Reviewed by</td><td style="padding: 4px 0; font-weight: 600;">${contract.reviewer_name || contract.reviewer_email}</td></tr>
            </table>
          </div>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${signUrl}" style="display: inline-block; background: #111827; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
              Review and Sign Agreement
            </a>
          </div>
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            This link expires on ${tokenExpiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
          </p>
        </div>
      `,
    })

    await logContractEvent(adminClient, {
      contract_id: contract.id,
      event_type: 'sent',
      actor_email: 'system',
      ip_address: ip,
      document_hash_sha256: contract.document_hash_sha256,
      metadata: { signer_email: contract.signer_email, triggered_by: 'reviewer_approval' },
    })
  }

  return NextResponse.json({ success: true, forwarded_to: contract.signer_email })
}
