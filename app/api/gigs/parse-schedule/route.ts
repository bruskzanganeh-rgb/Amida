import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseScheduleTexts } from '@/lib/schedule/parser'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`schedule-parse:${ip}`, 30, 60_000)
  if (!success) return rateLimitResponse()

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's locale for AI output language
    const { data: settings } = await supabase.from('company_settings').select('locale').eq('user_id', user.id).single()
    const locale = settings?.locale || 'en'

    const body = await request.json()
    const { entries } = body as { entries: { date: string; text: string }[] }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json({ error: 'No schedule entries provided' }, { status: 400 })
    }

    const sessions = await parseScheduleTexts(entries, user.id, locale)

    return NextResponse.json({ success: true, sessions })
  } catch (error) {
    console.error('Schedule parse error:', error)
    return NextResponse.json({ error: 'Could not parse schedule' }, { status: 500 })
  }
}
