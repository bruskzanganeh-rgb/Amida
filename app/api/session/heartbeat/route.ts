import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const SESSION_TIMEOUT_MINUTES = 30

export async function POST(request: Request) {
  try {
    const supabaseAdmin = createAdminClient()
    const supabase = await createServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
    const userAgent = request.headers.get('user-agent') || null

    const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MINUTES * 60 * 1000).toISOString()

    // Find active session (not ended, active within timeout)
    const { data: activeSession } = await supabaseAdmin
      .from('user_sessions')
      .select('id, last_active_at')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .gte('last_active_at', cutoff)
      .order('last_active_at', { ascending: false })
      .limit(1)
      .single()

    if (activeSession) {
      // Update existing session
      await supabaseAdmin
        .from('user_sessions')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', activeSession.id)

      return NextResponse.json({ session_id: activeSession.id, status: 'updated' })
    }

    // End any stale sessions for this user
    await supabaseAdmin
      .from('user_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('ended_at', null)

    // Create new session
    const { data: newSession } = await supabaseAdmin
      .from('user_sessions')
      .insert({
        user_id: user.id,
        ip_address: ip,
        user_agent: userAgent,
      })
      .select('id')
      .single()

    return NextResponse.json({ session_id: newSession?.id, status: 'created' })
  } catch (err) {
    console.error('Heartbeat error:', err)
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}
