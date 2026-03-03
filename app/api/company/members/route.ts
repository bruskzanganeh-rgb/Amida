import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get current user's company
  const { data: membership } = await supabase
    .from('company_members')
    .select('company_id')
    .eq('user_id', user.id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'No company found' }, { status: 404 })
  }

  // Get all members of this company (including soft-deleted for identity display)
  const { data: rawMembers } = await supabase
    .from('company_members')
    .select('id, user_id, role, joined_at, removed_at, full_name')
    .eq('company_id', membership.company_id)
    .order('joined_at')

  const members = rawMembers || []
  if (members.length === 0) {
    return NextResponse.json({ members: [] })
  }

  // Fetch auth emails using admin client
  const userIds = members.map((m) => m.user_id)
  const emailMap = new Map<string, string>()

  try {
    const admin = createAdminClient()
    for (const uid of userIds) {
      const { data } = await admin.auth.admin.getUserById(uid)
      if (data?.user?.email) {
        emailMap.set(uid, data.user.email)
      }
    }
  } catch {
    // Fallback: try company_settings emails
    const { data: settingsRows } = await supabase
      .from('company_settings')
      .select('user_id, email')
      .in('user_id', userIds)
    for (const s of settingsRows || []) {
      if (s.user_id) emailMap.set(s.user_id, s.email)
    }
  }

  // Enrich members with emails
  const enrichedMembers = members.map((m) => ({
    ...m,
    company_id: membership.company_id,
    email: emailMap.get(m.user_id) || null,
  }))

  return NextResponse.json({ members: enrichedMembers })
}
