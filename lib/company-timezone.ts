import { createAdminClient } from '@/lib/supabase/admin'

/**
 * The user's configured IANA timezone from company_settings (a per-user
 * setting, see migration 064), defaulting to 'Europe/Stockholm'.
 *
 * Use on the SERVER to stamp "today"/"now" in the user's local day rather than
 * the runtime's UTC day (Vercel runs in UTC), which would otherwise put dates a
 * day off for users in negative offsets (e.g. Brazil, UTC-3). Pair with
 * `todayInTimeZone()` from lib/dates.
 */
export async function getUserTimeZone(userId: string): Promise<string> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase.from('company_settings').select('timezone').eq('user_id', userId).single()
    return data?.timezone || 'Europe/Stockholm'
  } catch {
    return 'Europe/Stockholm'
  }
}
