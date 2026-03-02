import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import { logActivity } from '@/lib/activity'
import { SupabaseClient } from '@supabase/supabase-js'

async function deleteUserData(supabase: SupabaseClient, targetUserId: string) {
  // Delete user data in correct order (foreign key constraints)
  // 1. gig_dates (references gigs)
  const { data: userGigs } = await supabase.from('gigs').select('id').eq('user_id', targetUserId)
  const gigIds = (userGigs || []).map((g: { id: string }) => g.id)
  if (gigIds.length > 0) {
    await supabase.from('gig_dates').delete().in('gig_id', gigIds)
    await supabase.from('gig_attachments').delete().in('gig_id', gigIds)
  }

  // 2. invoice_lines (references invoices)
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

  // 4. Delete subscription and company settings
  await supabase.from('subscriptions').delete().eq('user_id', targetUserId)
  await supabase.from('company_settings').delete().eq('user_id', targetUserId)

  // 5. Clean up invitation_codes references (nullable FKs)
  await Promise.all([
    supabase.from('invitation_codes').update({ created_by: null }).eq('created_by', targetUserId),
    supabase.from('invitation_codes').update({ used_by: null }).eq('used_by', targetUserId),
    supabase.from('admin_users').update({ granted_by: null }).eq('granted_by', targetUserId),
  ])

  // 6. Delete auth user
  await supabase.auth.admin.deleteUser(targetUserId)
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: targetUserId } = await params
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, supabase } = auth

  const body = await request.json()
  const { email, password } = body

  if (!email && !password) {
    return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
  }

  const updateData: Record<string, string> = {}
  if (email) updateData.email = email
  if (password) updateData.password = password

  const { error } = await supabase.auth.admin.updateUserById(targetUserId, updateData)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  // Also update email in company_settings (displayed in admin UI)
  if (email) {
    await supabase.from('company_settings').update({ email }).eq('user_id', targetUserId)
  }

  await logActivity({
    userId,
    eventType: 'user_updated',
    entityType: 'user',
    entityId: targetUserId,
    metadata: {
      updated_by: userId,
      email_changed: !!email,
      password_changed: !!password,
    },
  })

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: targetUserId } = await params
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { userId, supabase } = auth

  // Prevent self-deletion
  if (targetUserId === userId) {
    return NextResponse.json({ error: 'Cannot delete yourself' }, { status: 400 })
  }

  const deleteCompany = request.nextUrl.searchParams.get('company') === 'true'

  if (deleteCompany) {
    // Delete entire company: find all members, delete each, then delete the company
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', targetUserId)
      .single()

    if (membership) {
      const { data: allMembers } = await supabase
        .from('company_members')
        .select('user_id')
        .eq('company_id', membership.company_id)

      // Delete all members' data
      for (const m of allMembers || []) {
        if (m.user_id === userId) continue // Don't delete admin
        await logActivity({
          userId,
          eventType: 'user_deleted',
          entityType: 'user',
          entityId: m.user_id,
          metadata: { deleted_by: userId, company_deleted: true },
        })
        await deleteUserData(supabase, m.user_id)
      }

      // Delete company-level data
      await supabase.from('gig_types').delete().eq('company_id', membership.company_id)
      await supabase.from('positions').delete().eq('company_id', membership.company_id)
      await supabase.from('company_invitations').delete().eq('company_id', membership.company_id)
      await supabase.from('companies').delete().eq('id', membership.company_id)
    } else {
      // No company — just delete the user
      await logActivity({
        userId,
        eventType: 'user_deleted',
        entityType: 'user',
        entityId: targetUserId,
        metadata: { deleted_by: userId },
      })
      await deleteUserData(supabase, targetUserId)
    }
  } else {
    // Delete single user only
    await logActivity({
      userId,
      eventType: 'user_deleted',
      entityType: 'user',
      entityId: targetUserId,
      metadata: { deleted_by: userId },
    })
    await deleteUserData(supabase, targetUserId)
  }

  return NextResponse.json({ success: true })
}
