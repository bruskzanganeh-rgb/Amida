'use client'

import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export type Company = {
  id: string
  company_name: string
  org_number: string
  address: string
  email: string
  phone: string
  bank_account: string
  logo_url: string | null
  country_code: string
  vat_registration_number: string | null
  late_payment_interest_text: string | null
  show_logo_on_invoice: boolean
  our_reference: string | null
  invoice_prefix: string
  next_invoice_number: number
  payment_terms_default: number
  base_currency: string
  email_inbound_address: string | null
  gig_visibility: 'personal' | 'shared'
}

export type CompanyMember = {
  id: string
  company_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
  email?: string | null
  removed_at?: string | null
  full_name?: string | null
}

export function useCompany() {
  const { data, error, isLoading, mutate } = useSWR(
    'company',
    async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Get membership
      const { data: membership, error: memError } = await supabase
        .from('company_members')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (memError || !membership) return null

      // Get company
      const { data: company, error: compError } = await supabase
        .from('companies')
        .select('*')
        .eq('id', membership.company_id)
        .single()

      if (compError || !company) return null

      // Get all members with emails via server endpoint
      let members: CompanyMember[] = []
      try {
        const res = await fetch('/api/company/members')
        if (res.ok) {
          const json = await res.json()
          members = json.members || []
        }
      } catch {
        // Fallback to basic query without emails
        const { data: basicMembers } = await supabase
          .from('company_members')
          .select('*')
          .eq('company_id', membership.company_id)
          .order('joined_at')
        members = (basicMembers || []) as CompanyMember[]
      }

      return {
        company: company as Company,
        membership: membership as CompanyMember,
        members,
      }
    },
    {
      revalidateOnFocus: true,
      dedupingInterval: 30_000,
    },
  )

  const allMembers = data?.members ?? []
  const activeMembers = allMembers.filter((m) => !m.removed_at)

  return {
    company: data?.company ?? null,
    companyId: data?.company?.id ?? null,
    role: data?.membership?.role ?? null,
    isOwner: data?.membership?.role === 'owner',
    fullName: data?.membership?.full_name ?? null,
    members: activeMembers,
    allMembers,
    loading: isLoading,
    error,
    mutate,
  }
}
