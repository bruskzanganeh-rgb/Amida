import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'
import { z } from 'zod'

const applySchema = z.object({
  matches: z.array(
    z.object({
      user_id: z.string().uuid(),
      instrument_id: z.string().uuid(),
    }),
  ),
})

export async function POST(request: Request) {
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  const body = await request.json()
  const parsed = applySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data' }, { status: 400 })
  }

  const { matches } = parsed.data

  if (matches.length === 0) {
    return NextResponse.json({ applied: 0 })
  }

  // Insert user_instruments, ignoring duplicates
  const { error } = await supabase.from('user_instruments').upsert(
    matches.map((m) => ({
      user_id: m.user_id,
      instrument_id: m.instrument_id,
    })),
    { onConflict: 'user_id,instrument_id', ignoreDuplicates: true },
  )

  if (error) {
    console.error('Error applying instrument matches:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ applied: matches.length })
}
