'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ExternalLink } from 'lucide-react'

interface SponsorData {
  id: string
  name: string
  logo_url: string | null
  display_prefix: string | null
  website_url: string | null
}

export function SponsorBanner() {
  const [sponsor, setSponsor] = useState<SponsorData | null>(null)
  const [impressionLogged, setImpressionLogged] = useState(false)
  const [hidden, setHidden] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    let cancelled = false

    async function load() {
      // Ensure auth session is loaded before RLS-gated queries
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user || cancelled) return

      // Check plan directly (no useSubscription dependency)
      const { data: sub } = await supabase.from('subscriptions').select('plan').limit(1).single()
      if (cancelled) return
      if (sub?.plan === 'pro' || sub?.plan === 'team') return
      setHidden(false)

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
      const best = cityMatch || countryMatch || globalMatch || null
      if (!cancelled) setSponsor(best)
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  if (hidden || !sponsor) return null

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
      className="flex items-center justify-center gap-2.5 px-4 py-3 transition-opacity hover:opacity-70"
    >
      {sponsor.logo_url && <img src={sponsor.logo_url} alt={sponsor.name} className="h-5 w-auto object-contain" />}
      <span className="text-xs text-muted-foreground/60">
        {sponsor.display_prefix || 'Sponsored by'}{' '}
        <span className="font-semibold" style={{ color: '#d4a843' }}>
          {sponsor.name}
        </span>
      </span>
      <ExternalLink className="h-3 w-3 text-muted-foreground/40" />
    </a>
  )
}
