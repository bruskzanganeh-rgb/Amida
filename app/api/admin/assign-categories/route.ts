import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import { z } from 'zod'

const assignSchema = z.object({
  user_id: z.string().uuid(),
  category_ids: z.array(z.string().uuid()).min(1),
})

export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const body = await request.json()
  const parsed = assignSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  const { user_id, category_ids } = parsed.data

  const { error } = await supabase.from('user_categories').upsert(
    category_ids.map((category_id) => ({
      user_id,
      category_id,
    })),
    { onConflict: 'user_id,category_id', ignoreDuplicates: true },
  )

  if (error) {
    console.error('Error assigning categories:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ assigned: category_ids.length })
}

const removeSchema = z.object({
  user_id: z.string().uuid(),
  category_id: z.string().uuid(),
})

export async function DELETE(request: Request) {
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const body = await request.json()
  const parsed = removeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  const { user_id, category_id } = parsed.data

  const { error } = await supabase
    .from('user_categories')
    .delete()
    .eq('user_id', user_id)
    .eq('category_id', category_id)

  if (error) {
    console.error('Error removing category:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ removed: true })
}
