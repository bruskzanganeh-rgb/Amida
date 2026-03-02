import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

export async function DELETE() {
  try {
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id
    const admin = createAdminClient()

    // Find user's company membership
    const { data: membership } = await admin
      .from('company_members')
      .select('company_id, role')
      .eq('user_id', userId)
      .limit(1)
      .single()

    if (membership) {
      // Check if sole owner — if so, delete entire company
      const { count: memberCount } = await admin
        .from('company_members')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', membership.company_id)

      if (membership.role === 'owner' && memberCount === 1) {
        // Sole owner: delete company-level data first
        await admin.from('company_invitations').delete().eq('company_id', membership.company_id)
        // Delete user data, then company
        await deleteUserData(admin, userId)
        await admin.from('gig_types').delete().eq('company_id', membership.company_id)
        await admin.from('positions').delete().eq('company_id', membership.company_id)
        await admin.from('companies').delete().eq('id', membership.company_id)
      } else {
        // Member or multi-owner: just delete this user's data
        await deleteUserData(admin, userId)
      }
    } else {
      // No company membership — just delete user data
      await deleteUserData(admin, userId)
    }

    // Delete auth user last
    await admin.auth.admin.deleteUser(userId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Account deletion error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Reuses the same deletion logic as admin route
async function deleteUserData(supabase: ReturnType<typeof createAdminClient>, targetUserId: string) {
  // 1. gig_dates + attachments (reference gigs)
  const { data: userGigs } = await supabase.from('gigs').select('id').eq('user_id', targetUserId)
  const gigIds = (userGigs || []).map((g: { id: string }) => g.id)
  if (gigIds.length > 0) {
    await supabase.from('gig_dates').delete().in('gig_id', gigIds)
    await supabase.from('gig_attachments').delete().in('gig_id', gigIds)
  }

  // 2. invoice_lines (reference invoices)
  const { data: userInvoices } = await supabase.from('invoices').select('id').eq('user_id', targetUserId)
  const invoiceIds = (userInvoices || []).map((i: { id: string }) => i.id)
  if (invoiceIds.length > 0) {
    await supabase.from('invoice_lines').delete().in('invoice_id', invoiceIds)
  }

  // 3. Delete main tables
  await Promise.all([
    supabase.from('gigs').delete().eq('user_id', targetUserId),
    supabase.from('invoices').delete().eq('user_id', targetUserId),
    supabase.from('expenses').delete().eq('user_id', targetUserId),
    supabase.from('clients').delete().eq('user_id', targetUserId),
    supabase.from('gig_types').delete().eq('user_id', targetUserId),
    supabase.from('positions').delete().eq('user_id', targetUserId),
    supabase.from('user_instruments').delete().eq('user_id', targetUserId),
    supabase.from('user_sessions').delete().eq('user_id', targetUserId),
    supabase.from('activity_events').delete().eq('user_id', targetUserId),
    supabase.from('usage_tracking').delete().eq('user_id', targetUserId),
    supabase.from('organization_members').delete().eq('user_id', targetUserId),
    supabase.from('company_members').delete().eq('user_id', targetUserId),
    supabase.from('sponsor_impressions').delete().eq('user_id', targetUserId),
    supabase.from('ai_usage_logs').delete().eq('user_id', targetUserId),
    supabase.from('exchange_rates').delete().eq('user_id', targetUserId),
  ])

  // 4. Subscription + company settings
  await supabase.from('subscriptions').delete().eq('user_id', targetUserId)
  await supabase.from('company_settings').delete().eq('user_id', targetUserId)

  // 5. Clean up nullable FK references
  await Promise.all([
    supabase.from('invitation_codes').update({ created_by: null }).eq('created_by', targetUserId),
    supabase.from('invitation_codes').update({ used_by: null }).eq('used_by', targetUserId),
    supabase.from('admin_users').update({ granted_by: null }).eq('granted_by', targetUserId),
  ])
}
