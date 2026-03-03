import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findDuplicateExpense, type DuplicateExpense } from '@/lib/expenses/duplicate-checker'
import { checkStorageQuota } from '@/lib/usage'

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceSupabase = createAdminClient()
    const formData = await request.formData()

    // Hämta fält
    const file = formData.get('file') as File | null
    const date = formData.get('date') as string
    const supplier = formData.get('supplier') as string
    const amount = parseFloat(formData.get('amount') as string)
    const currency = (formData.get('currency') as string) || 'SEK'
    const amountSek = parseFloat(formData.get('amount_base') as string) || amount
    const category = (formData.get('category') as string) || 'Övrigt'
    const notes = (formData.get('notes') as string) || null
    const gigId = (formData.get('gig_id') as string) || null
    const forceSave = formData.get('forceSave') === 'true'

    // Validera obligatoriska fält
    if (!date || !supplier || isNaN(amount)) {
      return NextResponse.json({ error: 'Date, supplier, and amount are required' }, { status: 400 })
    }

    // Dublettkontroll med fuzzy matching (om inte forceSave)
    if (!forceSave) {
      // Hämta alla utgifter för samma datum (scoped to user)
      const { data: existingExpenses } = await supabase
        .from('expenses')
        .select('id, date, supplier, amount, category')
        .eq('date', date)
        .eq('user_id', user.id)

      if (existingExpenses && existingExpenses.length > 0) {
        const duplicateResult = findDuplicateExpense({ date, supplier, amount }, existingExpenses as DuplicateExpense[])

        if (duplicateResult.isDuplicate && duplicateResult.existingExpense) {
          const existing = duplicateResult.existingExpense
          return NextResponse.json({
            isDuplicate: true,
            existingExpense: existing,
            matchType: duplicateResult.matchType,
            message: `A similar expense already exists: ${existing.supplier} - ${existing.amount} kr (${existing.date})`,
          })
        }
      }
    }

    let attachmentUrl: string | null = null
    let fileSize: number | null = null

    // Ladda upp fil till Supabase Storage om den finns
    if (file) {
      // Check storage quota
      const quota = await checkStorageQuota(user.id)
      if (!quota.allowed) {
        return NextResponse.json(
          { error: 'Storage quota exceeded. Upgrade your plan for more storage.' },
          { status: 403 },
        )
      }

      const fileExt = file.name.split('.').pop() || 'jpg'
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
      const filePath = `receipts/${new Date(date).getFullYear()}/${fileName}`

      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const { error: uploadError } = await serviceSupabase.storage.from('expenses').upload(filePath, buffer, {
        contentType: file.type,
        upsert: false,
      })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        // Fortsätt ändå - spara utgiften utan bilaga
      } else {
        // Hämta public URL
        const { data: urlData } = serviceSupabase.storage.from('expenses').getPublicUrl(filePath)

        attachmentUrl = urlData.publicUrl
        fileSize = buffer.length
      }
    }

    // Skapa utgift i databasen
    const { data: expense, error: insertError } = await supabase
      .from('expenses')
      .insert({
        date,
        supplier,
        amount,
        currency,
        amount_base: amountSek,
        category,
        notes,
        attachment_url: attachmentUrl,
        file_size: fileSize,
        gig_id: gigId,
        user_id: user.id,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Insert error:', insertError)
      return NextResponse.json({ error: 'Could not save expense' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      expense,
    })
  } catch (error) {
    console.error('Create expense error:', error)
    return NextResponse.json({ error: 'Could not create expense' }, { status: 500 })
  }
}
