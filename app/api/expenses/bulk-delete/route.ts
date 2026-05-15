import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const ids = body?.ids

    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
      return NextResponse.json({ error: 'ids must be a non-empty array of strings' }, { status: 400 })
    }

    const { data, error } = await supabase.from('expenses').delete().in('id', ids).eq('user_id', user.id).select('id')

    if (error) {
      console.error('Bulk delete error:', error)
      return NextResponse.json({ error: 'Could not delete expenses' }, { status: 500 })
    }

    const deletedCount = data?.length || 0

    await logActivity({
      userId: user.id,
      eventType: 'expense_deleted',
      entityType: 'expenses',
      metadata: { count: deletedCount, requested: ids.length },
    })

    return NextResponse.json({ success: true, deleted: deletedCount })
  } catch (error) {
    console.error('Expense bulk-delete error:', error)
    return NextResponse.json({ error: 'Could not delete expenses' }, { status: 500 })
  }
}
