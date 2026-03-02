'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SponsorData {
  id: string
  name: string
  logo_url?: string | null
  display_prefix: string | null
  website_url: string | null
}

// ── Singleton state (one fetch shared across all hook instances) ──
let _sponsor: SponsorData | null = null
let _plan: string = 'free'
let _loaded = false
let _loading = false
const _listeners = new Set<() => void>()

function notify() {
  _listeners.forEach((fn) => fn())
}

function subscribe(listener: () => void) {
  _listeners.add(listener)
  return () => {
    _listeners.delete(listener)
  }
}

let _cachedSnapshot = { sponsor: _sponsor, plan: _plan, loaded: _loaded }
function getSnapshot() {
  const next = { sponsor: _sponsor, plan: _plan, loaded: _loaded }
  if (
    next.sponsor !== _cachedSnapshot.sponsor ||
    next.plan !== _cachedSnapshot.plan ||
    next.loaded !== _cachedSnapshot.loaded
  ) {
    _cachedSnapshot = next
  }
  return _cachedSnapshot
}

function ensureLoaded() {
  if (_loading || _loaded) return
  _loading = true

  const supabase = createClient()

  ;(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.user) {
      _loaded = true
      _loading = false
      notify()
      return
    }

    // Fetch plan + membership in parallel
    const [{ data: sub }, { data: membership }] = await Promise.all([
      supabase.from('subscriptions').select('plan').limit(1).single(),
      supabase.from('company_members').select('company_id').limit(1).single(),
    ])

    _plan = sub?.plan || 'free'

    // Pro/Business users don't need sponsor data
    if (_plan === 'pro' || _plan === 'team') {
      _loaded = true
      _loading = false
      notify()
      return
    }

    // Get company geo data
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

    if (categoryIds.length === 0) {
      _loaded = true
      _loading = false
      notify()
      return
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: sponsors } = await (supabase.from('sponsors') as any)
      .select('id, name, logo_url, display_prefix, website_url, target_city, target_country, target_cities')
      .in('instrument_category_id', categoryIds)
      .eq('active', true)
      .order('priority', { ascending: false })

    if (sponsors && sponsors.length > 0) {
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
      _sponsor = cityMatch || countryMatch || globalMatch || null
    }

    _loaded = true
    _loading = false
    notify()
  })()
}

export function useSponsor() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    ensureLoaded()
  }, [])

  const isFree = state.plan === 'free'

  return {
    sponsor: isFree ? state.sponsor : null,
    plan: state.plan,
    isFree,
    loaded: state.loaded,
  }
}
