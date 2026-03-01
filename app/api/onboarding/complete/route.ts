import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/activity'
import { completeOnboardingSchema } from '@/lib/schemas/onboarding'

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = completeOnboardingSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors }, { status: 400 })
  }

  const { full_name, company_info, instruments_text, instrument_ids, gig_types, positions } = parsed.data

  // Use admin client for company/members/data creation (bypasses RLS)
  const admin = createAdminClient()

  let companyId: string | null = null
  let isOwner = true

  // Check if user already has a company (joining via invite)
  const { data: existingMembership } = await admin
    .from('company_members')
    .select('company_id')
    .eq('user_id', user.id)
    .single()

  if (existingMembership) {
    companyId = existingMembership.company_id
    // User already belongs to a company (joined via invite) — just update company info if owner
    const { data: member } = await admin
      .from('company_members')
      .select('role')
      .eq('company_id', existingMembership.company_id)
      .eq('user_id', user.id)
      .single()

    isOwner = member?.role === 'owner'

    if (isOwner) {
      await admin.from('companies').update(company_info).eq('id', existingMembership.company_id)
    }
  } else {
    // Create new company
    const { data: newCompany, error: compError } = await admin
      .from('companies')
      .insert({
        ...company_info,
      })
      .select('id')
      .single()

    if (compError || !newCompany) {
      console.error('Error creating company:', compError)
      return NextResponse.json({ error: 'Could not create company' }, { status: 500 })
    }

    companyId = newCompany.id

    // Make user the company owner
    const { error: memberError } = await admin.from('company_members').insert({
      company_id: newCompany.id,
      user_id: user.id,
      role: 'owner',
    })

    if (memberError) {
      console.error('Error creating company membership:', memberError)
    }
  }

  // Save personal name on company_members
  if (full_name) {
    await admin.from('company_members').update({ full_name }).eq('user_id', user.id)
  }

  // Upsert company_settings — ensures row is created if missing (update() silently matches 0 rows)
  const { error: settingsError } = await admin.from('company_settings').upsert(
    {
      user_id: user.id,
      company_name: company_info.company_name || '',
      org_number: company_info.org_number || '',
      address: company_info.address || '',
      email: company_info.email || '',
      phone: company_info.phone || '',
      bank_account: '',
      base_currency: company_info.base_currency || 'SEK',
      onboarding_completed: true,
      country_code: company_info.country_code || 'SE',
      instruments_text: instruments_text || '',
    },
    { onConflict: 'user_id' },
  )

  if (settingsError) {
    console.error('Onboarding settings error:', settingsError)
    return NextResponse.json({ error: 'Could not save settings' }, { status: 500 })
  }

  // Save structured instrument selections
  if (instrument_ids && instrument_ids.length > 0) {
    // Clear any existing selections first
    await admin.from('user_instruments').delete().eq('user_id', user.id)
    const { error: instrError } = await admin.from('user_instruments').insert(
      instrument_ids.map((instrumentId) => ({
        user_id: user.id,
        instrument_id: instrumentId,
      })),
    )
    if (instrError) {
      console.error('Error saving user instruments:', instrError)
    }
  }

  // Insert gig types (only for owners — members share the company's existing data)
  if (isOwner && gig_types && gig_types.length > 0 && companyId) {
    const { error: gtError } = await admin.from('gig_types').insert(
      gig_types.map((gt) => ({
        name: gt.name,
        name_en: gt.name_en || '',
        vat_rate: gt.vat_rate ?? 0,
        color: gt.color || '#6b7280',
        company_id: companyId,
      })),
    )

    if (gtError) {
      console.error('Error saving gig types:', gtError)
    }
  }

  // Insert positions (only for owners — members share the company's existing data)
  if (isOwner && positions && positions.length > 0 && companyId) {
    const { error: posError } = await admin.from('positions').insert(
      positions.map((p) => ({
        name: p.name,
        sort_order: p.sort_order,
        company_id: companyId,
      })),
    )

    if (posError) {
      console.error('Error saving positions:', posError)
    }
  }

  // Ensure subscription exists (free plan) — linked to user's company
  const { data: existingSub } = await admin.from('subscriptions').select('id').eq('user_id', user.id).single()

  if (!existingSub) {
    await admin.from('subscriptions').insert({
      user_id: user.id,
      plan: 'free',
      status: 'active',
      company_id: companyId,
    })
  }

  await logActivity({
    userId: user.id,
    eventType: 'onboarding_completed',
    entityType: 'user',
    entityId: user.id,
  })

  return NextResponse.json({ ok: true })
}
