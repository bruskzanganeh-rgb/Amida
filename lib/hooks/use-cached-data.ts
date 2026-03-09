'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

/**
 * Cached clients list. Shared across all components that need client data.
 * Deduplicates requests and caches for 30 seconds.
 */
export function useClients() {
  return useSWR(
    'clients',
    async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(
          'id, name, org_number, email, payment_terms, reference_person, invoice_language, country_code, vat_number, client_code, address, notes',
        )
        .order('name')
      if (error) throw error
      return data || []
    },
    {
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
    },
  )
}

/**
 * Cached gig types. Rarely change — cached for 60 seconds.
 */
export function useGigTypes() {
  return useSWR(
    'gig_types',
    async () => {
      const { data, error } = await supabase.from('gig_types').select('*').order('sort_order')
      if (error) throw error
      return data || []
    },
    {
      revalidateOnFocus: true,
      dedupingInterval: 60_000,
    },
  )
}

/**
 * Cached positions. Rarely change — cached for 60 seconds.
 */
export function usePositions() {
  return useSWR(
    'positions',
    async () => {
      const { data, error } = await supabase.from('positions').select('*').order('sort_order')
      if (error) throw error
      return data || []
    },
    {
      revalidateOnFocus: true,
      dedupingInterval: 60_000,
    },
  )
}

/**
 * Cached company settings. Used in many places.
 */
export function useCompanySettings() {
  return useSWR(
    'company_settings',
    async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await supabase.from('company_settings').select('*').eq('user_id', user.id).single()
      if (error) throw error
      return data
    },
    {
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
    },
  )
}
