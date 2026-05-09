import { createClient } from './client'

export type DocumentCategory =
  | 'annual_report'
  | 'bank_statement'
  | 'tax_authority'
  | 'registration'
  | 'contract'
  | 'other'

export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  'annual_report',
  'bank_statement',
  'tax_authority',
  'registration',
  'contract',
  'other',
]

export type CompanyDocument = {
  id: string
  company_id: string
  user_id: string | null
  file_name: string
  file_path: string
  file_size: number | null
  file_type: string | null
  category: DocumentCategory
  description: string | null
  document_date: string | null
  uploaded_at: string
}

export async function uploadCompanyDocument(
  file: File,
  category: DocumentCategory = 'other',
  description?: string,
  documentDate?: string,
): Promise<CompanyDocument> {
  const quotaRes = await fetch('/api/storage/quota')
  if (quotaRes.ok) {
    const quota = await quotaRes.json()
    if (quota.usedBytes >= quota.limitBytes) {
      throw new Error('STORAGE_QUOTA_EXCEEDED')
    }
  }

  const supabase = createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
  const filePath = `${user.id}/${Date.now()}-${sanitizedName}`

  const { error: uploadError } = await supabase.storage.from('company-documents').upload(filePath, file)

  if (uploadError) {
    throw new Error('Kunde inte ladda upp fil')
  }

  const { data, error } = await supabase
    .from('company_documents')
    .insert({
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      file_type: file.type,
      category,
      description: description || null,
      document_date: documentDate || null,
    })
    .select()
    .single()

  if (error) {
    await supabase.storage.from('company-documents').remove([filePath])
    throw new Error('Kunde inte spara filinfo')
  }

  return data as CompanyDocument
}

export async function deleteCompanyDocument(id: string, filePath: string): Promise<void> {
  const supabase = createClient()

  const { error: storageError } = await supabase.storage.from('company-documents').remove([filePath])

  if (storageError) {
    console.error('Storage delete error:', storageError)
  }

  const { error } = await supabase.from('company_documents').delete().eq('id', id)

  if (error) {
    throw new Error('Kunde inte ta bort dokument')
  }
}

export async function getCompanyDocuments(category?: DocumentCategory): Promise<CompanyDocument[]> {
  const supabase = createClient()

  let query = supabase.from('company_documents').select('*').order('uploaded_at', { ascending: false })

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query

  if (error) {
    throw new Error('Kunde inte hämta dokument')
  }

  return data as CompanyDocument[]
}

export async function getDocumentSignedUrl(filePath: string): Promise<string | null> {
  const supabase = createClient()

  const { data, error } = await supabase.storage.from('company-documents').createSignedUrl(filePath, 3600)

  if (error) {
    console.error('Signed URL error:', error)
    return null
  }

  return data?.signedUrl ?? null
}
