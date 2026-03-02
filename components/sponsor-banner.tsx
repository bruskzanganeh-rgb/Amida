'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useSubscription } from '@/lib/hooks/use-subscription'
import { ExternalLink } from 'lucide-react'

interface SponsorData {
  id: string
  name: string
  logo_url: string | null
  display_prefix: string | null
  website_url: string | null
}

export function SponsorBanner() {
  const { isPro, loading: subLoading } = useSubscription()
  const [sponsor, setSponsor] = useState<SponsorData | null>(null)
  const [impressionLogged, setImpressionLogged] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (subLoading || isPro) return
    let cancelled = false

    async function load() {
      // Get user's company city + country
      const { data: membership } = await supabase.from('company_members').select('company_id').limit(1).single()
      let userCity = ''
      let userCountry = ''
      if (membership) {
        const { data: comp } = await supabase
          .from('companies')
          .select('city, country_code')
          .eq('id', membership.company_id)
          .single()
        userCity = comp?.city || ''
        userCountry = comp?.country_code || ''
      }

      // Get user's instrument categories
      const { data: userCats } = await supabase.from('user_categories').select('category_id')
      const categoryIds = (userCats || []).map((uc) => uc.category_id).filter(Boolean)
      if (categoryIds.length === 0) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: sponsors } = await (supabase.from('sponsors') as any)
        .select('id, name, logo_url, display_prefix, website_url, target_city, target_country, target_cities')
        .in('instrument_category_id', categoryIds)
        .eq('active', true)
        .order('priority', { ascending: false })

      if (cancelled || !sponsors || sponsors.length === 0) return

      const lowerCity = userCity.toLowerCase()
      const cityMatch = userCity
        ? sponsors.find((s: { target_cities?: string[] | null }) =>
            s.target_cities?.some((c: string) => c.toLowerCase() === lowerCity),
          )
        : null
      const countryMatch = userCountry
        ? sponsors.find(
            (s: { target_country?: string | null; target_cities?: string[] | null }) =>
              s.target_country === userCountry && !s.target_cities?.length,
          )
        : null
      const globalMatch = sponsors.find(
        (s: { target_country?: string | null; target_cities?: string[] | null }) =>
          !s.target_country && !s.target_cities?.length,
      )
      const best = cityMatch || countryMatch || globalMatch || sponsors[0]
      if (!cancelled) setSponsor(best)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [subLoading, isPro, supabase])

  // Log impression once
  useEffect(() => {
    if (sponsor && !impressionLogged) {
      setImpressionLogged(true)
      fetch('/api/sponsor-impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsor_id: sponsor.id }),
      }).catch(() => {})
    }
  }, [sponsor, impressionLogged])

  if (subLoading || isPro || !sponsor) return null

  const url = sponsor.website_url
    ? sponsor.website_url.match(/^https?:\/\//)
      ? sponsor.website_url
      : `https://${sponsor.website_url}`
    : '#'

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        fetch('/api/sponsor-impression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sponsor_id: sponsor.id, type: 'click' }),
        }).catch(() => {})
      }}
      className="flex items-center justify-center gap-2.5 rounded-lg border border-border/50 bg-muted/30 px-4 py-2.5 transition-colors hover:bg-muted/50"
    >
      {sponsor.logo_url && <img src={sponsor.logo_url} alt={sponsor.name} className="h-5 w-auto object-contain" />}
      <span className="text-xs text-muted-foreground">
        {sponsor.display_prefix || 'Sponsored by'} <span className="font-medium">{sponsor.name}</span>
      </span>
      <ExternalLink className="h-3 w-3 text-muted-foreground/50" />
    </a>
  )
}
