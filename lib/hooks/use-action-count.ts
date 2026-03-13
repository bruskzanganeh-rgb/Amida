'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useGigFilter } from './use-gig-filter'

/**
 * Counts completed gigs that haven't been invoiced yet.
 * Badge is shown on the Fakturor tab.
 */
export function useActionCount() {
  const [count, setCount] = useState(0)
  const { shouldFilter, currentUserId } = useGigFilter()

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      function applyFilter<T extends { eq: (col: string, val: string) => T }>(query: T): T {
        return shouldFilter && currentUserId ? query.eq('user_id', currentUserId) : query
      }

      const [completedRes, invoicedRes] = await Promise.all([
        applyFilter(supabase.from('gigs').select('id').eq('status', 'completed')),
        supabase.from('invoice_gigs').select('gig_id'),
      ])

      const invoicedSet = new Set((invoicedRes.data || []).map((g: { gig_id: string }) => g.gig_id))
      const uninvoiced = (completedRes.data || []).filter((g) => !invoicedSet.has(g.id))
      setCount(uninvoiced.length)
    }

    load()
    function onVisibility() {
      if (!document.hidden) load()
    }
    document.addEventListener('visibilitychange', onVisibility)
    document.addEventListener('gig-status-changed', load)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      document.removeEventListener('gig-status-changed', load)
    }
  }, [shouldFilter, currentUserId])

  return count
}
