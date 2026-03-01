import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { sponsor_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { sponsor_id } = body
  if (!sponsor_id || typeof sponsor_id !== 'string') {
    return NextResponse.json({ error: 'sponsor_id is required' }, { status: 400 })
  }

  const { error } = await supabase.from('sponsor_impressions').insert({
    sponsor_id,
    user_id: user.id,
    impression_type: 'app',
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to log impression' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
