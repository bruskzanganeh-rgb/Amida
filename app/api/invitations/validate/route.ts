import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Public route — no auth required. Validates an invite token and returns company name.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { token } = body

    if (!token || typeof token !== 'string') {
      return NextResponse.json({ valid: false, reason: 'missing' })
    }

    const supabase = createAdminClient()

    const { data: invitation, error } = await supabase
      .from('company_invitations')
      .select('id, company_id, used_by, expires_at')
      .eq('token', token)
      .single()

    if (error || !invitation) {
      return NextResponse.json({ valid: false, reason: 'not_found' })
    }

    if (invitation.used_by) {
      return NextResponse.json({ valid: false, reason: 'used' })
    }

    if (invitation.expires_at && new Date(invitation.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, reason: 'expired' })
    }

    // Get company name
    const { data: company } = await supabase
      .from('companies')
      .select('company_name')
      .eq('id', invitation.company_id)
      .single()

    return NextResponse.json({
      valid: true,
      company_name: company?.company_name || '',
    })
  } catch (err) {
    console.error('Invitation validate error:', err)
    return NextResponse.json({ valid: false, reason: 'error' })
  }
}
