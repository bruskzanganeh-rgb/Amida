import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildTier } from '@/lib/subscription-utils'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('platform_config')
      .select('key, value')
      .or('key.like.free_%,key.like.pro_%,key.like.team_%')

    const config: Record<string, string> = {}
    data?.forEach((d) => {
      config[d.key] = d.value
    })

    return NextResponse.json({
      free: buildTier('free', config),
      pro: buildTier('pro', config),
      team: buildTier('team', config),
    })
  } catch {
    return NextResponse.json({ error: 'Failed to load tier config' }, { status: 500 })
  }
}
