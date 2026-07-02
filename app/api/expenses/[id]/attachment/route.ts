import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkStorageQuota } from '@/lib/usage'
import { yearFromDateString } from '@/lib/dates'
import { isValidReceiptFile } from '@/lib/upload/file-validation'

// Extrahera filsökväg från public URL
function extractFilePath(attachmentUrl: string): string | null {
  try {
    const url = new URL(attachmentUrl)
    const pathParts = url.pathname.split('/storage/v1/object/public/expenses/')
    if (pathParts.length > 1) {
      return pathParts[1]
    }
    return null
  } catch {
    return null
  }
}

// GET - Hämta signerad URL för kvittobild
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    // RLS-skyddad query — säkerställer att användaren tillhör samma company
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('attachment_url')
      .eq('id', id)
      .single()

    if (fetchError || !expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    if (!expense.attachment_url) {
      return NextResponse.json({ error: 'No receipt image exists' }, { status: 404 })
    }

    const filePath = extractFilePath(expense.attachment_url)
    if (!filePath) {
      return NextResponse.json({ error: 'Could not read file path' }, { status: 400 })
    }

    // Skapa signerad URL - needs service role for storage
    const serviceSupabase = createAdminClient()
    const { data: signedData, error: signError } = await serviceSupabase.storage
      .from('expenses')
      .createSignedUrl(filePath, 3600)

    if (signError || !signedData) {
      console.error('Signed URL error:', signError)
      return NextResponse.json({ error: 'Could not create signed URL' }, { status: 500 })
    }

    return NextResponse.json({
      url: signedData.signedUrl,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    })
  } catch (error) {
    console.error('Attachment GET error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}

// POST - Ladda upp ny kvittobild
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const serviceSupabase = createAdminClient()
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file attached' }, { status: 400 })
    }

    // Validate type & size (this route previously skipped it, unlike its siblings)
    const validation = isValidReceiptFile(file)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error || 'Invalid file' }, { status: 400 })
    }

    // Check storage quota
    const quota = await checkStorageQuota(user.id)
    if (!quota.allowed) {
      return NextResponse.json(
        { error: 'Storage quota exceeded. Upgrade your plan for more storage.' },
        { status: 403 },
      )
    }

    // Hämta befintlig expense via RLS-klienten — den scopar till användarens
    // company (utgifter är delade), så kollegors kvitton kan också hanteras.
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('attachment_url, date')
      .eq('id', id)
      .single()

    if (fetchError || !expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    // Ta bort gammal fil om den finns
    if (expense.attachment_url) {
      const oldPath = extractFilePath(expense.attachment_url)
      if (oldPath) {
        await serviceSupabase.storage.from('expenses').remove([oldPath])
      }
    }

    // Ladda upp ny fil
    const fileExt = file.name.split('.').pop() || 'jpg'
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
    const year = yearFromDateString(expense.date)
    const filePath = `receipts/${year}/${fileName}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await serviceSupabase.storage.from('expenses').upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return NextResponse.json({ error: 'Could not upload file' }, { status: 500 })
    }

    // Hämta public URL
    const { data: urlData } = serviceSupabase.storage.from('expenses').getPublicUrl(filePath)

    // Uppdatera expense med ny attachment_url och file_size
    const { error: updateError } = await supabase
      .from('expenses')
      .update({ attachment_url: urlData.publicUrl, file_size: buffer.length })
      .eq('id', id)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Could not update expense' }, { status: 500 })
    }

    // Returnera signerad URL för visning
    const { data: signedData } = await serviceSupabase.storage.from('expenses').createSignedUrl(filePath, 3600)

    return NextResponse.json({
      success: true,
      url: signedData?.signedUrl || urlData.publicUrl,
    })
  } catch (error) {
    console.error('Attachment POST error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}

// DELETE - Ta bort kvittobild
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const serviceSupabase = createAdminClient()

    // Hämta expense via RLS-klienten — scopar till användarens company så
    // kollegors kvitton kan också hanteras (utgifter är delade).
    const { data: expense, error: fetchError } = await supabase
      .from('expenses')
      .select('attachment_url')
      .eq('id', id)
      .single()

    if (fetchError || !expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
    }

    if (!expense.attachment_url) {
      return NextResponse.json({ error: 'No receipt image to delete' }, { status: 404 })
    }

    // Ta bort fil från storage
    const filePath = extractFilePath(expense.attachment_url)
    if (filePath) {
      const { error: removeError } = await serviceSupabase.storage.from('expenses').remove([filePath])

      if (removeError) {
        console.error('Remove error:', removeError)
      }
    }

    // Uppdatera expense - ta bort attachment_url
    const { error: updateError } = await supabase.from('expenses').update({ attachment_url: null }).eq('id', id)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: 'Could not update expense' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Attachment DELETE error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}
