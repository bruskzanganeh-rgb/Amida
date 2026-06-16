import { NextRequest } from 'next/server'
import { validateApiKey, requireScope } from '@/lib/api-auth'
import { apiSuccess, apiError, apiValidationError } from '@/lib/api-response'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { createGigSchema } from '@/lib/schemas/gig'
import type { Database } from '@/lib/types/supabase'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'read:gigs')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('gigs')
      .select(
        `
        *,
        client:clients(id, name, email, org_number),
        gig_type:gig_types(id, name, vat_rate),
        position:positions(id, name),
        gig_dates(date),
        gig_attachments(id, file_name, category)
      `,
      )
      .eq('id', id)
      .eq('user_id', auth.userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return apiError('Gig not found', 404)
      throw error
    }

    return apiSuccess(data)
  } catch (error) {
    console.error('[API v1] GET gig error:', error)
    return apiError('Failed to fetch gig', 500)
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'write:gigs')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const { id } = await params
    const body = await request.json()
    const parsed = createGigSchema.partial().safeParse(body)
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>)
    }

    const supabase = createAdminClient()
    const { dates, ...updateData } = parsed.data

    // Verify the gig exists and belongs to this user
    const { error: existError } = await supabase
      .from('gigs')
      .select('id')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .single()

    if (existError) {
      if (existError.code === 'PGRST116') return apiError('Gig not found', 404)
      throw existError
    }

    // Update gig fields if any were provided (excluding dates)
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from('gigs')
        .update(updateData as Database['public']['Tables']['gigs']['Update'])
        .eq('id', id)
        .eq('user_id', auth.userId)

      if (updateError) throw updateError
    }

    // Update dates if provided
    if (dates && dates.length > 0) {
      const { error: deleteError } = await supabase.from('gig_dates').delete().eq('gig_id', id)

      if (deleteError) throw deleteError

      const { error: insertError } = await supabase
        .from('gig_dates')
        .insert(dates.map((date) => ({ gig_id: id, date, user_id: auth.userId })))

      if (insertError) throw insertError

      // Update date fields on gig
      const { error: dateUpdateError } = await supabase
        .from('gigs')
        .update({
          date: dates[0],
          start_date: dates[0],
          end_date: dates[dates.length - 1],
          total_days: dates.length,
        })
        .eq('id', id)

      if (dateUpdateError) throw dateUpdateError
    }

    // Re-fetch the gig with all relations to return fresh data
    const { data, error } = await supabase
      .from('gigs')
      .select(
        `
        *,
        client:clients(id, name),
        gig_type:gig_types(id, name),
        position:positions(id, name),
        gig_dates(date)
      `,
      )
      .eq('id', id)
      .single()

    if (error) throw error

    return apiSuccess(data)
  } catch (error) {
    console.error('[API v1] PATCH gig error:', error)
    return apiError('Failed to update gig', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'write:gigs')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const { id } = await params
    const supabase = createAdminClient()

    // Verify ownership BEFORE deleting child rows — the admin client bypasses
    // RLS, so without this a key could delete another tenant's gig_dates.
    const { data: owned, error: ownErr } = await supabase
      .from('gigs')
      .select('id')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .maybeSingle()
    if (ownErr) throw ownErr
    if (!owned) return apiError('Gig not found', 404)

    // Delete gig_dates first
    await supabase.from('gig_dates').delete().eq('gig_id', id)

    const { error } = await supabase.from('gigs').delete().eq('id', id).eq('user_id', auth.userId)

    if (error) throw error

    return apiSuccess({ deleted: true })
  } catch (error) {
    console.error('[API v1] DELETE gig error:', error)
    return apiError('Failed to delete gig', 500)
  }
}
