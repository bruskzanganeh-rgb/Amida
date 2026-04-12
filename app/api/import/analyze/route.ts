import { NextRequest, NextResponse } from 'next/server'
import { classifyDocument, type ClassifiedDocument } from '@/lib/import/document-classifier'
import { matchClient } from '@/lib/import/client-matcher'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`analyze:${ip}`, 30, 60_000)
  if (!success) return rateLimitResponse()

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file attached' }, { status: 400 })
    }

    // Validera filstorlek (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File is too large. Max 10MB.' }, { status: 400 })
    }

    // Validera filtyp
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: `File type ${file.type} not supported. Use PDF or image.` }, { status: 400 })
    }

    // Klassificera dokumentet med AI
    const result: ClassifiedDocument = await classifyDocument(file)

    // Om det är en faktura, kör kundmatchning
    let clientMatch = null
    if (result.type === 'invoice') {
      const invoiceData = result.data as { clientName?: string }
      if (invoiceData.clientName) {
        try {
          clientMatch = await matchClient(invoiceData.clientName)
        } catch (matchError) {
          console.error('Client match error:', matchError)
          // Fortsätt utan kundmatchning om det misslyckas
        }
      }
    }

    return NextResponse.json({
      success: true,
      filename: file.name,
      ...result,
      clientMatch,
    })
  } catch (error) {
    console.error('Analyze error:', error)
    return NextResponse.json({ error: 'Could not analyze file' }, { status: 500 })
  }
}
