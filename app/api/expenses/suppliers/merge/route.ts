import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity'

/**
 * Merge duplicate supplier names into one canonical name across all company
 * expenses. Renames every expense whose supplier is in `from` to `to`.
 * Company-wide scope is enforced by RLS ("Company expenses access").
 */
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
    const to = typeof body?.to === 'string' ? body.to.trim() : ''
    const fromRaw = body?.from

    if (!to) {
      return NextResponse.json({ error: 'to must be a non-empty string' }, { status: 400 })
    }
    if (!Array.isArray(fromRaw) || fromRaw.length === 0 || !fromRaw.every((s) => typeof s === 'string')) {
      return NextResponse.json({ error: 'from must be a non-empty array of strings' }, { status: 400 })
    }

    // Don't rewrite rows that already have the target name.
    const from = [...new Set(fromRaw.map((s: string) => s))].filter((s) => s && s !== to)
    if (from.length === 0) {
      return NextResponse.json({ success: true, updated: 0 })
    }

    const { data, error } = await supabase.from('expenses').update({ supplier: to }).in('supplier', from).select('id')

    if (error) {
      console.error('Supplier merge error:', error)
      return NextResponse.json({ error: 'Could not merge suppliers' }, { status: 500 })
    }

    const updated = data?.length || 0

    await logActivity({
      userId: user.id,
      eventType: 'expense_updated',
      entityType: 'expenses',
      metadata: { action: 'supplier_merge', to, from, count: updated },
    })

    return NextResponse.json({ success: true, updated })
  } catch (error) {
    console.error('Supplier merge error:', error)
    return NextResponse.json({ error: 'Could not merge suppliers' }, { status: 500 })
  }
}
