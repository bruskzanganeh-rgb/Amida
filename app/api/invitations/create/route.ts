import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Resend } from 'resend'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user is a company owner
  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id, role')
    .eq('user_id', user.id)
    .single()

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json({ error: 'Only company owners can create invitations' }, { status: 403 })
  }

  // Check team subscription
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('plan, status')
    .eq('company_id', membership.company_id)
    .limit(1)
    .single()

  if (!subscription || subscription.plan !== 'team' || subscription.status !== 'active') {
    return NextResponse.json({ error: 'Business plan required to invite members' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const { email } = body

  // Create invitation
  const { data: invitation, error } = await supabase
    .from('company_invitations')
    .insert({
      company_id: membership.company_id,
      invited_by: user.id,
      invited_email: email || null,
    })
    .select('id, token, expires_at')
    .single()

  if (error) {
    console.error('Error creating invitation:', error)
    return NextResponse.json({ error: 'Could not create invitation' }, { status: 500 })
  }

  const baseUrl = request.headers.get('origin') || ''
  const inviteUrl = `${baseUrl}/signup?invite=${invitation.token}`

  // Send invitation email via Resend if email provided
  let emailSent = false
  if (email) {
    try {
      const serviceSupabase = createAdminClient()
      const [{ data: configRows }, { data: company }] = await Promise.all([
        serviceSupabase.from('platform_config').select('key, value').in('key', ['resend_api_key', 'resend_from_email']),
        supabase.from('companies').select('company_name').eq('id', membership.company_id).single(),
      ])

      const config = Object.fromEntries((configRows || []).map((r) => [r.key, r.value]))

      if (config.resend_api_key) {
        const resend = new Resend(config.resend_api_key)
        const companyName = company?.company_name || 'Amida'
        const fromEmail = config.resend_from_email || 'noreply@babalisk.com'
        const expiresDate = invitation.expires_at
          ? new Date(invitation.expires_at).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })
          : ''

        await resend.emails.send({
          from: `${companyName} <${fromEmail}>`,
          to: [email],
          subject: `You've been invited to ${companyName} on Amida`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 0;">
              <h2 style="margin: 0 0 16px;">You've been invited!</h2>
              <p style="color: #374151; line-height: 1.6; margin: 0 0 8px;">
                <strong>${companyName}</strong> has invited you to join their team on Amida.
              </p>
              <p style="color: #374151; line-height: 1.6; margin: 0 0 24px;">
                Click the button below to create your account and get started.
              </p>
              <a href="${inviteUrl}" style="display: inline-block; background: #111827; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
                Accept invitation
              </a>
              ${expiresDate ? `<p style="color: #9ca3af; font-size: 13px; margin-top: 24px;">This invitation expires on ${expiresDate}.</p>` : ''}
            </div>
          `,
        })
        emailSent = true
      }
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError)
    }
  }

  return NextResponse.json({
    token: invitation.token,
    url: inviteUrl,
    expires_at: invitation.expires_at,
    emailSent,
  })
}
