import { NextRequest } from 'next/server'
import { validateApiKey, requireScope } from '@/lib/api-auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'read:invoices')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('invoices')
      .select(
        `
        *,
        client:clients(id, name, email, org_number, address),
        invoice_lines(*)
      `,
      )
      .eq('id', id)
      .eq('user_id', auth.userId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return apiError('Invoice not found', 404)
      throw error
    }

    return apiSuccess(data)
  } catch (error) {
    console.error('[API v1] GET invoice error:', error)
    return apiError('Failed to fetch invoice', 500)
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'write:invoices')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const { id } = await params
    const body = await request.json()

    // Allow updating status and paid_date
    const allowedFields: Record<string, string | undefined> = {}
    if (body.status) allowedFields.status = body.status
    if (body.paid_date) allowedFields.paid_date = body.paid_date
    if (body.notes !== undefined) allowedFields.notes = body.notes

    if (Object.keys(allowedFields).length === 0) {
      return apiError('No valid fields to update', 400)
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('invoices')
      .update(allowedFields)
      .eq('id', id)
      .eq('user_id', auth.userId)
      .select(
        `
        *,
        client:clients(id, name, email)
      `,
      )
      .single()

    if (error) {
      if (error.code === 'PGRST116') return apiError('Invoice not found', 404)
      throw error
    }

    return apiSuccess(data)
  } catch (error) {
    console.error('[API v1] PATCH invoice error:', error)
    return apiError('Failed to update invoice', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'write:invoices')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const { id } = await params
    const supabase = createAdminClient()

    // Verify ownership BEFORE touching child rows — the admin client bypasses
    // RLS, so without this a key could delete another tenant's invoice lines.
    const { data: owned, error: ownErr } = await supabase
      .from('invoices')
      .select('id, gig_id')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .maybeSingle()
    if (ownErr) throw ownErr
    if (!owned) return apiError('Invoice not found', 404)

    // Get linked gigs before deleting — junction rows AND the legacy gig_id.
    const { data: linkedGigs } = await supabase.from('invoice_gigs').select('gig_id').eq('invoice_id', id)
    const gigIds = [
      ...new Set([
        ...(linkedGigs || []).map((g: { gig_id: string }) => g.gig_id),
        ...(owned.gig_id ? [owned.gig_id as string] : []),
      ]),
    ]

    // Delete invoice lines first
    await supabase.from('invoice_lines').delete().eq('invoice_id', id)

    const { error } = await supabase.from('invoices').delete().eq('id', id).eq('user_id', auth.userId)

    if (error) throw error

    // Revert linked gigs to completed (scoped to the owner)
    if (gigIds.length > 0) {
      await supabase.from('gigs').update({ status: 'completed' }).in('id', gigIds).eq('user_id', auth.userId)
    }

    return apiSuccess({ deleted: true })
  } catch (error) {
    console.error('[API v1] DELETE invoice error:', error)
    return apiError('Failed to delete invoice', 500)
  }
}
