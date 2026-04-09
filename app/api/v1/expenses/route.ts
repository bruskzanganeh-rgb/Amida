import { NextRequest } from 'next/server'
import { validateApiKey, requireScope } from '@/lib/api-auth'
import { apiSuccess, apiError, apiValidationError } from '@/lib/api-response'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { z } from 'zod'
import { EXPENSE_CATEGORIES } from '@/lib/expenses/categories'

const createExpenseSchema = z.object({
  date: z.string().min(1),
  supplier: z.string().min(1),
  amount: z.number().min(0),
  currency: z.string().optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
  notes: z.string().nullable().optional(),
  gig_id: z.string().nullable().optional(),
})

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'read:expenses')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const { searchParams } = request.nextUrl
    const category = searchParams.get('category')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
    const offset = parseInt(searchParams.get('offset') || '0')

    const supabase = createAdminClient()
    let query = supabase
      .from('expenses')
      .select('*, gig:gigs(id, project_name, date)', { count: 'exact' })
      .eq('user_id', auth.userId)

    if (category) query = query.eq('category', category)
    if (dateFrom) query = query.gte('date', dateFrom)
    if (dateTo) query = query.lte('date', dateTo)

    query = query.order('date', { ascending: false }).range(offset, offset + limit - 1)

    const { data, error, count } = await query
    if (error) throw error

    return apiSuccess({
      expenses: data || [],
      pagination: { total: count || 0, limit, offset, has_more: (count || 0) > offset + limit },
    })
  } catch (error) {
    console.error('[API v1] GET expenses error:', error)
    return apiError('Failed to fetch expenses', 500)
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'write:expenses')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const body = await request.json()
    const parsed = createExpenseSchema.safeParse(body)
    if (!parsed.success) {
      return apiValidationError(parsed.error.flatten().fieldErrors as Record<string, string[]>)
    }

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('expenses')
      .insert({ ...parsed.data, user_id: auth.userId })
      .select()
      .single()

    if (error) throw error

    return apiSuccess(data, 201)
  } catch (error) {
    console.error('[API v1] POST expense error:', error)
    return apiError('Failed to create expense', 500)
  }
}
