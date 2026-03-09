'use client'

import useSWR, { type SWRConfiguration } from 'swr'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

/**
 * Generic SWR hook for Supabase queries.
 *
 * Usage:
 * ```ts
 * const { data, isLoading, mutate } = useSupabaseQuery('clients', () =>
 *   supabase.from('clients').select('*').order('name')
 * )
 * ```
 */
export function useSupabaseQuery<T>(
  key: string | null,
  fetcher: () => PromiseLike<{ data: T | null; error: unknown }>,
  config?: SWRConfiguration<T>,
) {
  return useSWR<T>(
    key,
    async () => {
      const { data, error } = await fetcher()
      if (error) throw error
      return data as T
    },
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
      ...config,
    },
  )
}

/**
 * Helper to get the shared Supabase client for queries.
 */
export function useSupabase() {
  return supabase
}
