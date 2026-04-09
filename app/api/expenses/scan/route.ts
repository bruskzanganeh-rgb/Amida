import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseReceiptWithVision, parseReceiptWithText } from '@/lib/receipt/parser'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'
import { extractText, renderPageAsImage } from 'unpdf'

// Konvertera PDF-sida till base64-bild
async function pdfToBase64Image(buffer: ArrayBuffer): Promise<string> {
  const bufferCopy = buffer.slice(0) // Prevent detached ArrayBuffer
  const uint8Array = new Uint8Array(bufferCopy)

  const imageArrayBuffer = await renderPageAsImage(uint8Array, 1, {
    scale: 2.0,
    canvasImport: () => import('@napi-rs/canvas'),
  })

  const bytes = new Uint8Array(imageArrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return Buffer.from(binary, 'binary').toString('base64')
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`scan:${ip}`, 10, 60_000)
  if (!success) return rateLimitResponse()

  try {
    // Autentisera användare
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user locale for AI output language
    const { data: settings } = await supabase.from('company_settings').select('locale').eq('user_id', user.id).single()
    const locale: 'sv' | 'en' = settings?.locale === 'en' ? 'en' : 'sv'

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // Validera filtyp - nu med PDF-stöd
    const validImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const isPdf = file.type === 'application/pdf'

    if (!validImageTypes.includes(file.type) && !isPdf) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, GIF, WebP, and PDF are supported.' },
        { status: 400 },
      )
    }

    // Validera filstorlek (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File is too large. Max 10MB.' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    let result

    if (isPdf) {
      // Hantera PDF - försök med text först (billigare)
      // Processing PDF receipt

      try {
        // Steg 1: Försök extrahera text från PDF
        const bufferCopy = arrayBuffer.slice(0)
        const { text: textArray } = await extractText(new Uint8Array(bufferCopy))
        const text = textArray.join('\n')

        // Om vi fick tillräckligt med text, använd textbaserad parsing (billigare)
        const MIN_TEXT_LENGTH = 50 // Minsta antal tecken för att anse texten användbar

        if (text && text.trim().length >= MIN_TEXT_LENGTH) {
          // PDF text extracted, using text parsing
          result = await parseReceiptWithText(text, user.id, locale)
        } else {
          // Steg 2: För lite text, fallback till bildkonvertering
          // PDF text insufficient, falling back to image conversion
          const base64Image = await pdfToBase64Image(arrayBuffer)
          result = await parseReceiptWithVision(base64Image, 'image/png', user.id, locale)
        }
      } catch (pdfError) {
        console.error('PDF text extraction failed, trying image conversion:', pdfError)

        // Steg 3: Textextraktion misslyckades, försök med bild
        try {
          const base64Image = await pdfToBase64Image(arrayBuffer)
          result = await parseReceiptWithVision(base64Image, 'image/png', user.id, locale)
        } catch (imageError) {
          console.error('PDF image conversion also failed:', imageError)
          return NextResponse.json({ error: 'Could not read the PDF file. Try an image instead.' }, { status: 400 })
        }
      }
    } else {
      // Hantera bild som tidigare
      const bytes = new Uint8Array(arrayBuffer)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = Buffer.from(binary, 'binary').toString('base64')
      const mimeType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

      // Parsa med Claude Vision
      result = await parseReceiptWithVision(base64, mimeType, user.id, locale)
    }

    return NextResponse.json({
      success: true,
      data: result,
    })
  } catch (error) {
    console.error('Receipt scan error:', error)
    return NextResponse.json({ error: 'Could not read receipt' }, { status: 500 })
  }
}
