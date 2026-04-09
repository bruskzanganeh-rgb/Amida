import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseScheduleWithVision, parseScheduleWithPdf, sessionsToText } from '@/lib/schedule/parser'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`schedule-scan:${ip}`, 10, 60_000)
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

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const isPdf = file.type === 'application/pdf'

    if (!validImageTypes.includes(file.type) && !isPdf) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, GIF, WebP, and PDF are supported.' },
        { status: 400 },
      )
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File is too large. Max 10MB.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    let result

    if (isPdf) {
      const base64 = Buffer.from(arrayBuffer).toString('base64')
      result = await parseScheduleWithPdf(base64, user.id, locale)
    } else {
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = Buffer.from(binary, 'binary').toString('base64')
      const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      result = await parseScheduleWithVision(base64, mimeType, user.id, locale)
    }

    // Convert sessions to text for display in text fields
    const scheduleTexts: Record<string, string> = {}
    for (const [date, sessions] of Object.entries(result.dates)) {
      scheduleTexts[date] = sessionsToText(sessions)
    }

    return NextResponse.json({
      success: true,
      dates: result.dates,
      scheduleTexts,
      projectName: result.project_name,
      venue: result.venue,
      venues: result.venues || null, // per-date venue overrides
      confidence: result.confidence,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Schedule scan error:', message, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
