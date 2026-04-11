import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  let db = false
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('companies').select('id').limit(1)
    db = !error
  } catch {
    db = false
  }

  return NextResponse.json({
    status: db ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    db,
  })
}
