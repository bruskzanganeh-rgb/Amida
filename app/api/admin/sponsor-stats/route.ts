import { NextResponse } from 'next/server'
import { verifyAdmin } from '@/lib/admin'

export async function GET() {
  const auth = await verifyAdmin()
  if (auth instanceof NextResponse) return auth
  const { supabase } = auth

  // 1. Get all free users
  const { data: freeSubs } = await supabase.from('subscriptions').select('user_id').eq('plan', 'free')

  if (!freeSubs || freeSubs.length === 0) {
    return NextResponse.json({ totalFreeUsers: 0, withSponsor: 0, withoutSponsor: 0, byCity: [] })
  }

  const freeUserIds = freeSubs.map((s) => s.user_id)

  // 2. Get user categories for free users
  const { data: userCats } = await supabase
    .from('user_categories')
    .select('user_id, category_id')
    .in('user_id', freeUserIds)

  // 3. Get company memberships + company geo for free users
  const { data: members } = await supabase
    .from('company_members')
    .select('user_id, company_id')
    .in('user_id', freeUserIds)

  const companyIds = [...new Set((members || []).map((m) => m.company_id))]
  const { data: companies } = await supabase
    .from('companies')
    .select('id, city, country_code')
    .in('id', companyIds.length > 0 ? companyIds : ['_'])

  const companyMap = new Map<string, { city: string | null; country_code: string | null }>()
  for (const c of companies || []) companyMap.set(c.id, { city: c.city, country_code: c.country_code })

  const userGeoMap = new Map<string, { city: string; country: string }>()
  for (const m of members || []) {
    const comp = companyMap.get(m.company_id)
    userGeoMap.set(m.user_id, { city: comp?.city || '', country: comp?.country_code || '' })
  }

  // 4. Get all active sponsors
  const { data: sponsors } = await supabase
    .from('sponsors')
    .select('id, name, instrument_category_id, target_country, target_cities')
    .eq('active', true)

  // 5. For each free user, check if any sponsor matches
  const userCatMap = new Map<string, string[]>()
  for (const uc of userCats || []) {
    if (!userCatMap.has(uc.user_id)) userCatMap.set(uc.user_id, [])
    userCatMap.get(uc.user_id)!.push(uc.category_id)
  }

  type CityRow = { city: string; country: string; freeUsers: number; withSponsor: number }
  const cityMap = new Map<string, CityRow>()

  let withSponsor = 0

  for (const userId of freeUserIds) {
    const geo = userGeoMap.get(userId) || { city: '', country: '' }
    const catIds = userCatMap.get(userId) || []
    const key = `${geo.city || ''}|${geo.country || ''}`

    if (!cityMap.has(key)) {
      cityMap.set(key, { city: geo.city || '', country: geo.country || '', freeUsers: 0, withSponsor: 0 })
    }
    cityMap.get(key)!.freeUsers++

    // Run sponsor matching (same logic as client)
    const matchingSponsors = (sponsors || []).filter((s: { instrument_category_id: string }) =>
      catIds.includes(s.instrument_category_id),
    )

    if (matchingSponsors.length > 0) {
      const lowerCity = geo.city.toLowerCase()
      const cityMatch = geo.city
        ? matchingSponsors.find((s: { target_cities?: string[] | null }) =>
            s.target_cities?.some((c: string) => c.toLowerCase() === lowerCity),
          )
        : null
      const countryMatch = geo.country
        ? matchingSponsors.find(
            (s: { target_country?: string | null; target_cities?: string[] | null }) =>
              s.target_country === geo.country && !s.target_cities?.length,
          )
        : null
      const globalMatch = matchingSponsors.find(
        (s: { target_country?: string | null; target_cities?: string[] | null }) =>
          !s.target_country && !s.target_cities?.length,
      )

      if (cityMatch || countryMatch || globalMatch) {
        withSponsor++
        cityMap.get(key)!.withSponsor++
      }
    }
  }

  const byCity = [...cityMap.values()].sort((a, b) => b.freeUsers - a.freeUsers)

  return NextResponse.json({
    totalFreeUsers: freeUserIds.length,
    withSponsor,
    withoutSponsor: freeUserIds.length - withSponsor,
    byCity,
  })
}
