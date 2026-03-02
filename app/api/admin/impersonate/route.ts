import { NextRequest, NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import { logActivity } from '@/lib/activity'

export async function POST(request: NextRequest) {
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const { userId } = await request.json()
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 })
    }

    // Get target user's email
    const { data: targetUser, error: userError } = await auth.supabase.auth.admin.getUserById(userId)
    if (userError || !targetUser?.user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const email = targetUser.user.email
    if (!email) {
      return NextResponse.json({ error: 'User has no email' }, { status: 400 })
    }

    // Generate magic link
    const { data: linkData, error: linkError } = await auth.supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Failed to generate impersonation link:', linkError)
      return NextResponse.json({ error: 'Failed to generate link' }, { status: 500 })
    }

    // Log the impersonation
    await logActivity({
      userId: auth.userId,
      eventType: 'impersonation_started',
      entityType: 'user',
      entityId: userId,
      metadata: { target_email: email },
    })

    return NextResponse.json({ url: linkData.properties.action_link })
  } catch (error) {
    console.error('Impersonation error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
