'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useGigFilter } from './use-gig-filter'

/**
 * Lightweight hook that counts gigs needing user attention:
 * 1. Pending/tentative gigs (need accept/decline)
 * 2. Past accepted gigs (need to be marked completed)
 */
export function useActionCount() {
  const [count, setCount] = useState(0)
  const { shouldFilter, currentUserId } = useGigFilter()

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const today = new Date().toISOString().split('T')[0]

      function applyFilter<T extends { eq: (col: string, val: string) => T }>(query: T): T {
        return shouldFilter && currentUserId ? query.eq('user_id', currentUserId) : query
      }

      const [pendingRes, pastRes] = await Promise.all([
        applyFilter(
          supabase.from('gigs').select('id', { count: 'exact', head: true }).in('status', ['pending', 'tentative']),
        ),
        applyFilter(
          supabase.from('gigs').select('id', { count: 'exact', head: true }).eq('status', 'accepted').lt('date', today),
        ),
      ])

      setCount((pendingRes.count ?? 0) + (pastRes.count ?? 0))
    }

    load()
  }, [shouldFilter, currentUserId])

  return count
}
