import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserTimeZone } from '@/lib/company-timezone'
import { todayInTimeZone } from '@/lib/dates'

/**
 * POST /api/gigs/draft
 * Creates a minimal draft gig so attachments can be uploaded immediately.
 * The draft is updated with real data when the user saves, or deleted on cancel.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Best-effort cleanup of orphan drafts older than 1 hour for this user.
    // Catches cases where the browser closed before beforeunload fired
    // (mobile Safari, network failure). 1h is short enough to not affect a
    // live multi-tab session but long enough to clean stale ones.
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    await supabase.from('gigs').delete().eq('user_id', user.id).eq('status', 'draft').lt('created_at', oneHourAgo)

    // Get first available gig type for the placeholder
    const { data: gigTypes } = await supabase.from('gig_types').select('id').limit(1).single()

    if (!gigTypes) {
      return NextResponse.json({ error: 'No gig types configured' }, { status: 400 })
    }

    const today = todayInTimeZone(await getUserTimeZone(user.id))

    const { data: draft, error } = await supabase
      .from('gigs')
      .insert({
        gig_type_id: gigTypes.id,
        date: `${today}T00:00:00`,
        start_date: today,
        end_date: today,
        total_days: 1,
        fee: 0,
        status: 'draft',
      })
      .select('id')
      .single()

    if (error) {
      console.error('Draft creation error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ id: draft.id })
  } catch (error) {
    console.error('Draft error:', error)
    return NextResponse.json({ error: 'Failed to create draft' }, { status: 500 })
  }
}

/**
 * DELETE /api/gigs/draft
 * Deletes a draft gig and its cascaded attachments.
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const gigId = searchParams.get('id')

    if (!gigId) {
      return NextResponse.json({ error: 'Missing gig id' }, { status: 400 })
    }

    // Only allow deleting drafts (safety check)
    const { data: gig } = await supabase.from('gigs').select('id, status').eq('id', gigId).single()

    if (!gig || gig.status !== 'draft') {
      return NextResponse.json({ error: 'Not a draft gig' }, { status: 400 })
    }

    // Delete attached files from storage first
    const { data: attachments } = await supabase.from('gig_attachments').select('file_path').eq('gig_id', gigId)

    if (attachments && attachments.length > 0) {
      const paths = attachments.map((a) => a.file_path)
      await supabase.storage.from('gig-attachments').remove(paths)
    }

    // Delete the draft (cascades to gig_attachments, gig_dates)
    const { error } = await supabase.from('gigs').delete().eq('id', gigId)

    if (error) {
      console.error('Draft deletion error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Draft delete error:', error)
    return NextResponse.json({ error: 'Failed to delete draft' }, { status: 500 })
  }
}
