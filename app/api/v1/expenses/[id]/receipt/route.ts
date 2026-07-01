import { NextRequest } from 'next/server'
import { validateApiKey, requireScope } from '@/lib/api-auth'
import { apiSuccess, apiError } from '@/lib/api-response'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { ALLOWED_RECEIPT_TYPES, MAX_FILE_SIZE } from '@/lib/upload/file-validation'
import { createAdminClient } from '@/lib/supabase/admin'
import { yearFromDateString } from '@/lib/dates'
import { checkStorageQuota } from '@/lib/usage'

type Params = { params: Promise<{ id: string }> }

function extractFilePath(attachmentUrl: string): string | null {
  try {
    const url = new URL(attachmentUrl)
    const pathParts = url.pathname.split('/storage/v1/object/public/expenses/')
    if (pathParts.length > 1) return pathParts[1]
    return null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest, { params }: Params) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'read:expenses')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { data: expense, error } = await supabase
      .from('expenses')
      .select('attachment_url')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .single()

    if (error || !expense) return apiError('Expense not found', 404)
    if (!expense.attachment_url) return apiError('No receipt attached', 404)

    const filePath = extractFilePath(expense.attachment_url)
    if (!filePath) return apiError('Could not resolve file path', 400)

    const { data: signedData, error: signError } = await supabase.storage
      .from('expenses')
      .createSignedUrl(filePath, 3600)

    if (signError || !signedData) return apiError('Could not create signed URL', 500)

    return apiSuccess({
      url: signedData.signedUrl,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    })
  } catch (error) {
    console.error('[API v1] GET receipt error:', error)
    return apiError('Failed to fetch receipt', 500)
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'write:expenses')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const { id } = await params
    const supabase = createAdminClient()

    let fileBuffer: Buffer
    let fileType: string
    let fileExt: string

    const contentType = request.headers.get('content-type') || ''

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      const file = formData.get('file') as File | null

      if (!file) return apiError('No file uploaded. Send multipart/form-data with field "file".', 400)

      if (!ALLOWED_RECEIPT_TYPES.includes(file.type as (typeof ALLOWED_RECEIPT_TYPES)[number])) {
        return apiError('Invalid file type. Use PDF or image (JPEG, PNG, WebP, GIF).', 400)
      }

      if (file.size > MAX_FILE_SIZE) return apiError('File too large. Max 10 MB.', 400)

      fileBuffer = Buffer.from(await file.arrayBuffer())
      fileType = file.type
      fileExt = file.name.split('.').pop() || 'jpg'
    } else {
      const rawType = contentType.split(';')[0].trim()
      if (!ALLOWED_RECEIPT_TYPES.includes(rawType as (typeof ALLOWED_RECEIPT_TYPES)[number])) {
        return apiError('Invalid content type. Use multipart/form-data or raw binary with correct Content-Type.', 400)
      }

      const arrayBuffer = await request.arrayBuffer()
      if (arrayBuffer.byteLength === 0) return apiError('Empty request body.', 400)
      if (arrayBuffer.byteLength > MAX_FILE_SIZE) return apiError('File too large. Max 10 MB.', 400)

      fileBuffer = Buffer.from(arrayBuffer)
      fileType = rawType
      const extMap: Record<string, string> = {
        'application/pdf': 'pdf',
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
      }
      fileExt = extMap[rawType] || 'jpg'
    }

    // Check storage quota
    const quota = await checkStorageQuota(auth.userId)
    if (!quota.allowed) {
      return apiError('Storage quota exceeded. Upgrade your plan for more storage.', 403)
    }

    // Verify ownership
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('attachment_url, date')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .single()

    if (fetchError || !expense) return apiError('Expense not found', 404)

    // Remove old file if exists
    if (expense.attachment_url) {
      const oldPath = extractFilePath(expense.attachment_url)
      if (oldPath) await supabase.storage.from('expenses').remove([oldPath])
    }

    // Upload new file
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const year = yearFromDateString(expense.date)
    const filePath = `receipts/${year}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('expenses')
      .upload(filePath, fileBuffer, { contentType: fileType, upsert: false })

    if (uploadError) return apiError('Could not upload file', 500)

    const { data: urlData } = supabase.storage.from('expenses').getPublicUrl(filePath)

    const { error: updateError } = await supabase
      .from('expenses')
      .update({ attachment_url: urlData.publicUrl, file_size: fileBuffer.length })
      .eq('id', id)
      .eq('user_id', auth.userId)

    if (updateError) return apiError('Could not update expense', 500)

    const { data: signedData } = await supabase.storage.from('expenses').createSignedUrl(filePath, 3600)

    return apiSuccess({
      url: signedData?.signedUrl || urlData.publicUrl,
      expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    })
  } catch (error) {
    console.error('[API v1] POST receipt error:', error)
    return apiError('Failed to upload receipt', 500)
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const authHeader = request.headers.get('authorization')
  const keyId = authHeader?.substring(7, 23) || 'anon'
  if (!rateLimit(`apiv1:${keyId}`, 60, 60_000).success) return rateLimitResponse()

  const auth = await validateApiKey(authHeader)
  if (!auth.success) return apiError(auth.error, auth.status)

  const scopeCheck = requireScope(auth.scopes, 'write:expenses')
  if (!scopeCheck.success) return apiError(scopeCheck.error, scopeCheck.status)

  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('attachment_url')
      .eq('id', id)
      .eq('user_id', auth.userId)
      .single()

    if (fetchError || !expense) return apiError('Expense not found', 404)
    if (!expense.attachment_url) return apiError('No receipt to delete', 404)

    const filePath = extractFilePath(expense.attachment_url)
    if (filePath) await supabase.storage.from('expenses').remove([filePath])

    const { error: updateError } = await supabase
      .from('expenses')
      .update({ attachment_url: null })
      .eq('id', id)
      .eq('user_id', auth.userId)

    if (updateError) return apiError('Could not update expense', 500)

    return apiSuccess({ deleted: true })
  } catch (error) {
    console.error('[API v1] DELETE receipt error:', error)
    return apiError('Failed to delete receipt', 500)
  }
}
