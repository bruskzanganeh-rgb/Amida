import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { authSetupSchema } from '@/lib/schemas/auth'

// Uses service_role key to bypass RLS — needed because after signUp()
// there's no session yet (email confirmation required), so auth.uid() is NULL.
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = authSetupSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
    }

    const { user_id, company_name, invitation_code, invitation_token } = parsed.data

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    // Verify the user exists in auth.users
    const { data: user } = await supabase.auth.admin.getUserById(user_id)
    if (!user?.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if setup already ran (idempotent)
    const { count } = await supabase
      .from('company_settings')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user_id)

    if (count && count > 0) {
      return NextResponse.json({ ok: true, message: 'Already set up' })
    }

    // Create company_settings (all NOT NULL text columns need empty-string defaults)
    const { error: settingsError } = await supabase.from('company_settings').insert({
      user_id,
      company_name: company_name || '',
      org_number: '',
      address: '',
      email: '',
      phone: '',
      bank_account: '',
      base_currency: 'SEK',
      onboarding_completed: false,
    })

    if (settingsError) {
      console.error('Error creating company_settings:', settingsError)
      return NextResponse.json({ error: 'Failed to create settings' }, { status: 500 })
    }

    // If this is a company invite signup, process the invitation
    if (invitation_token) {
      const { data: invitation } = await supabase
        .from('company_invitations')
        .select('id, company_id, used_by, expires_at')
        .eq('token', invitation_token)
        .single()

      if (
        invitation &&
        !invitation.used_by &&
        (!invitation.expires_at || new Date(invitation.expires_at) >= new Date())
      ) {
        // Add user as company member
        await supabase.from('company_members').insert({
          company_id: invitation.company_id,
          user_id,
          role: 'member',
        })

        // Mark invitation as used
        await supabase
          .from('company_invitations')
          .update({ used_by: user_id, used_at: new Date().toISOString() })
          .eq('id', invitation.id)

        // Create subscription linked to the company
        await supabase.from('subscriptions').insert({
          user_id,
          company_id: invitation.company_id,
          plan: 'team',
          status: 'active',
        })

        // Mark onboarding as completed (invited members skip onboarding)
        await supabase.from('company_settings').update({ onboarding_completed: true }).eq('user_id', user_id)

        return NextResponse.json({ ok: true })
      }
    }

    // Normal signup flow — create free subscription
    const { error: subError } = await supabase.from('subscriptions').insert({
      user_id,
      plan: 'free',
      status: 'active',
    })

    if (subError) {
      console.error('Error creating subscription:', subError)
      return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
    }

    // Gig types + positions are created during onboarding (quick-add presets)

    // Claim any orphaned data (user_id IS NULL rows from before auth was added)
    const { error: claimError } = await supabase.rpc('claim_orphaned_data', { uid: user_id })
    if (claimError) console.error('claim_orphaned_data failed (non-critical):', claimError)

    // Track invitation code usage
    if (invitation_code) {
      const { error: codeError } = await supabase.rpc('use_invitation_code', {
        code_value: invitation_code.trim().toUpperCase(),
        uid: user_id,
      })
      if (codeError) console.error('use_invitation_code failed (non-critical):', codeError)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Auth setup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
