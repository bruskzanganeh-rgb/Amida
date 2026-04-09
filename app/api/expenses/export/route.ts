import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logActivity } from '@/lib/activity'
import { categoryLabelStatic } from '@/lib/expenses/categories'
import JSZip from 'jszip'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

type Expense = {
  id: string
  date: string
  supplier: string
  amount: number
  currency: string
  amount_base: number
  category: string | null
  notes: string | null
  attachment_url: string | null
  gig: { project_name: string | null; venue: string | null } | null
}

// Sanitera filnamn
function sanitizeFilename(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50)
}

// Extrahera filsökväg från public URL
function extractFilePath(attachmentUrl: string): string | null {
  try {
    // URL format: https://{project}.supabase.co/storage/v1/object/public/expenses/receipts/2025/file.jpg
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

// Hämta signerad URL för kvitto
async function getSignedUrl(
  attachmentUrl: string,
  supabase: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  const filePath = extractFilePath(attachmentUrl)
  if (!filePath) return null

  const { data, error } = await supabase.storage.from('expenses').createSignedUrl(filePath, 3600) // 1 timme

  if (error || !data) {
    console.error('Failed to create signed URL:', error)
    return null
  }

  return data.signedUrl
}

// Skapa filnamn för kvitto
function createReceiptFilename(expense: Expense, ext: string): string {
  const date = expense.date.replace(/-/g, '-')
  const supplier = sanitizeFilename(expense.supplier)
  const amount = Math.round(expense.amount_base || expense.amount)
  return `${date}_${supplier}_${amount}kr.${ext}`
}

// Skapa CSV-innehåll
function createCsvContent(expenses: Expense[], locale: 'sv' | 'en' = 'sv'): string {
  const headers =
    locale === 'en'
      ? ['Date', 'Supplier', 'Amount', 'Currency', 'Amount SEK', 'Category', 'Notes', 'Event']
      : ['Datum', 'Leverantör', 'Belopp', 'Valuta', 'Belopp SEK', 'Kategori', 'Anteckningar', 'Uppdrag']
  const rows = expenses.map((e) => [
    e.date,
    `"${e.supplier.replace(/"/g, '""')}"`,
    e.amount.toString(),
    e.currency,
    (e.amount_base || e.amount).toString(),
    categoryLabelStatic(e.category, locale),
    `"${(e.notes || '').replace(/"/g, '""')}"`,
    e.gig?.project_name || e.gig?.venue || '',
  ])

  return [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\n')
}

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const serverSupabase = await createServerClient()
    const {
      data: { user },
    } = await serverSupabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)
    const year = parseInt(searchParams.get('year') || new Date().getFullYear().toString())
    const month = parseInt(searchParams.get('month') || (new Date().getMonth() + 1).toString())
    const format = searchParams.get('format') || 'zip'

    // Load user locale to localize category labels in export
    const { data: userSettings } = await serverSupabase
      .from('company_settings')
      .select('locale')
      .eq('user_id', user.id)
      .single()
    const exportLocale: 'sv' | 'en' = userSettings?.locale === 'en' ? 'en' : 'sv'

    // Beräkna start- och slutdatum för månaden
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    // Hämta utgifter för månaden
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select(
        `
        id,
        date,
        supplier,
        amount,
        currency,
        amount_base,
        category,
        notes,
        attachment_url,
        gig:gigs(project_name, venue)
      `,
      )
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (error) {
      console.error('Error fetching expenses:', error)
      return NextResponse.json({ error: 'Could not fetch expenses' }, { status: 500 })
    }

    const typedExpenses = (expenses || []) as unknown as Expense[]

    if (typedExpenses.length === 0) {
      return NextResponse.json({ error: 'No expenses found for the selected month' }, { status: 404 })
    }

    // Filtrera ut utgifter med bilagor
    const expensesWithAttachments = typedExpenses.filter((e) => e.attachment_url)

    const monthName = new Date(year, month - 1).toLocaleDateString('sv-SE', { month: 'long' })
    const fileBaseName = `${year}-${month.toString().padStart(2, '0')}-Kvitton`

    // Format: individual - returnera bara URLer
    if (format === 'individual') {
      await logActivity({
        userId: user.id,
        eventType: 'expenses_exported',
        entityType: 'expenses',
        metadata: { format, year, month, count: typedExpenses.length },
      })
      return NextResponse.json({
        success: true,
        month: `${monthName} ${year}`,
        totalExpenses: typedExpenses.length,
        totalWithReceipts: expensesWithAttachments.length,
        totalAmount: typedExpenses.reduce((sum, e) => sum + (e.amount_base || e.amount), 0),
        expenses: typedExpenses.map((e) => ({
          id: e.id,
          date: e.date,
          supplier: e.supplier,
          amount: e.amount,
          currency: e.currency,
          amount_base: e.amount_base,
          category: e.category,
          attachment_url: e.attachment_url,
          filename: e.attachment_url ? createReceiptFilename(e, e.attachment_url.split('.').pop() || 'jpg') : null,
        })),
      })
    }

    // Format: zip - skapa ZIP-fil med kvitton + CSV + PDF-summering
    if (format === 'zip') {
      const zip = new JSZip()

      // Lägg till CSV-summering
      const csvContent = createCsvContent(typedExpenses, exportLocale)
      zip.file(`${fileBaseName}.csv`, csvContent)

      // Skapa PDF-summering
      const summaryPdf = await PDFDocument.create()
      const font = await summaryPdf.embedFont(StandardFonts.Helvetica)
      const boldFont = await summaryPdf.embedFont(StandardFonts.HelveticaBold)

      let summaryPage = summaryPdf.addPage([595, 842])
      const pageHeight = 842

      summaryPage.drawText(`Kvitton - ${monthName} ${year}`, {
        x: 50,
        y: pageHeight - 60,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      })

      summaryPage.drawText(`Genererad: ${new Date().toLocaleDateString('sv-SE')}`, {
        x: 50,
        y: pageHeight - 90,
        size: 10,
        font,
        color: rgb(0.3, 0.3, 0.3),
      })

      const totalAmount = typedExpenses.reduce((sum, e) => sum + (e.amount_base || e.amount), 0)
      summaryPage.drawText(`Antal utgifter: ${typedExpenses.length}`, {
        x: 50,
        y: pageHeight - 130,
        size: 12,
        font,
      })
      summaryPage.drawText(`Antal med kvitto: ${expensesWithAttachments.length}`, {
        x: 50,
        y: pageHeight - 150,
        size: 12,
        font,
      })
      summaryPage.drawText(`Total summa: ${totalAmount.toLocaleString('sv-SE')} kr`, {
        x: 50,
        y: pageHeight - 170,
        size: 12,
        font,
      })

      // Tabell med utgifter
      let y = pageHeight - 220
      summaryPage.drawText('Datum', { x: 50, y, size: 9, font: boldFont })
      summaryPage.drawText('Leverantör', { x: 120, y, size: 9, font: boldFont })
      summaryPage.drawText('Kategori', { x: 300, y, size: 9, font: boldFont })
      summaryPage.drawText('Belopp', { x: 420, y, size: 9, font: boldFont })
      summaryPage.drawText('Kvitto', { x: 500, y, size: 9, font: boldFont })
      y -= 15

      for (const expense of typedExpenses) {
        if (y < 50) {
          summaryPage = summaryPdf.addPage([595, 842])
          y = pageHeight - 50
        }

        summaryPage.drawText(expense.date, { x: 50, y, size: 9, font })
        summaryPage.drawText(expense.supplier.substring(0, 25), { x: 120, y, size: 9, font })
        summaryPage.drawText(categoryLabelStatic(expense.category, 'sv').substring(0, 15), { x: 300, y, size: 9, font })
        summaryPage.drawText(`${Math.round(expense.amount_base || expense.amount)} kr`, { x: 420, y, size: 9, font })
        summaryPage.drawText(expense.attachment_url ? 'Ja' : 'Nej', { x: 500, y, size: 9, font })
        y -= 12
      }

      const summaryPdfBytes = await summaryPdf.save()
      zip.file(`${fileBaseName}-Summering.pdf`, summaryPdfBytes)

      // Ladda ner och lägg till kvittobilder
      for (const expense of expensesWithAttachments) {
        if (!expense.attachment_url) continue

        try {
          // Skapa signerad URL för att kunna hämta från privat bucket
          const signedUrl = await getSignedUrl(expense.attachment_url, supabase)
          if (!signedUrl) {
            console.error(`Failed to get signed URL for: ${expense.attachment_url}`)
            continue
          }

          const response = await fetch(signedUrl)
          if (response.ok) {
            const blob = await response.arrayBuffer()
            const ext = expense.attachment_url.split('.').pop() || 'jpg'
            const filename = createReceiptFilename(expense, ext)
            zip.file(filename, blob)
          } else {
            console.error(`Failed to fetch receipt (${response.status}): ${expense.attachment_url}`)
          }
        } catch (fetchError) {
          console.error(`Failed to fetch receipt: ${expense.attachment_url}`, fetchError)
        }
      }

      // Generera ZIP
      const zipBuffer = await zip.generateAsync({ type: 'blob' })

      await logActivity({
        userId: user.id,
        eventType: 'expenses_exported',
        entityType: 'expenses',
        metadata: { format: 'zip', year, month, count: typedExpenses.length },
      })

      return new NextResponse(zipBuffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${fileBaseName}.zip"`,
        },
      })
    }

    // Format: pdf - skapa PDF med summering + kvitton (bilder och PDF:er)
    if (format === 'pdf') {
      const pdfDoc = await PDFDocument.create()
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

      // Sida 1: Summering
      const summaryPage = pdfDoc.addPage([595, 842]) // A4
      const { height } = summaryPage.getSize()

      summaryPage.drawText(`Kvitton - ${monthName} ${year}`, {
        x: 50,
        y: height - 60,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      })

      summaryPage.drawText(`Genererad: ${new Date().toLocaleDateString('sv-SE')}`, {
        x: 50,
        y: height - 90,
        size: 10,
        font,
        color: rgb(0.3, 0.3, 0.3),
      })

      const totalAmount = typedExpenses.reduce((sum, e) => sum + (e.amount_base || e.amount), 0)
      summaryPage.drawText(`Antal utgifter: ${typedExpenses.length}`, {
        x: 50,
        y: height - 130,
        size: 12,
        font,
      })
      summaryPage.drawText(`Antal med kvitto: ${expensesWithAttachments.length}`, {
        x: 50,
        y: height - 150,
        size: 12,
        font,
      })
      summaryPage.drawText(`Total summa: ${totalAmount.toLocaleString('sv-SE')} kr`, {
        x: 50,
        y: height - 170,
        size: 12,
        font,
      })

      // Tabell med utgifter
      let y = height - 220
      summaryPage.drawText('Datum', { x: 50, y, size: 9, font: boldFont })
      summaryPage.drawText('Leverantör', { x: 120, y, size: 9, font: boldFont })
      summaryPage.drawText('Kategori', { x: 300, y, size: 9, font: boldFont })
      summaryPage.drawText('Belopp', { x: 420, y, size: 9, font: boldFont })
      summaryPage.drawText('Kvitto', { x: 500, y, size: 9, font: boldFont })
      y -= 15

      let currentPage = summaryPage
      for (const expense of typedExpenses) {
        if (y < 50) {
          currentPage = pdfDoc.addPage([595, 842])
          y = 842 - 50
        }

        currentPage.drawText(expense.date, { x: 50, y, size: 9, font })
        currentPage.drawText(expense.supplier.substring(0, 25), { x: 120, y, size: 9, font })
        currentPage.drawText(categoryLabelStatic(expense.category, 'sv').substring(0, 15), { x: 300, y, size: 9, font })
        currentPage.drawText(`${Math.round(expense.amount_base || expense.amount)} kr`, { x: 420, y, size: 9, font })
        currentPage.drawText(expense.attachment_url ? 'Ja' : 'Nej', { x: 500, y, size: 9, font })
        y -= 12
      }

      // Lägg till kvitton (bilder och PDF:er)
      for (const expense of expensesWithAttachments) {
        if (!expense.attachment_url) continue

        try {
          const signedUrl = await getSignedUrl(expense.attachment_url, supabase)
          if (!signedUrl) {
            console.error(`Failed to get signed URL for PDF: ${expense.attachment_url}`)
            continue
          }

          const response = await fetch(signedUrl)
          if (!response.ok) {
            console.error(`Failed to fetch receipt (${response.status}): ${expense.attachment_url}`)
            continue
          }

          const blob = await response.arrayBuffer()
          const ext = expense.attachment_url.split('.').pop()?.toLowerCase() || 'jpg'

          // Header text för kvittot
          const categoryText = categoryLabelStatic(expense.category, 'sv')
          const headerText = `${expense.date} - ${expense.supplier} - ${Math.round(expense.amount_base || expense.amount)} ${expense.currency}${categoryText ? ` - ${categoryText}` : ''}`

          if (ext === 'pdf') {
            // Merga PDF-kvitto
            try {
              const receiptPdf = await PDFDocument.load(blob)
              const copiedPages = await pdfDoc.copyPages(receiptPdf, receiptPdf.getPageIndices())

              for (let i = 0; i < copiedPages.length; i++) {
                const copiedPage = copiedPages[i]
                pdfDoc.addPage(copiedPage)

                // Lägg till header på första sidan av varje kvitto
                if (i === 0) {
                  const { height: pageHeight, width: pageWidth } = copiedPage.getSize()
                  // Rita en vit bakgrund för headern
                  copiedPage.drawRectangle({
                    x: 0,
                    y: pageHeight - 25,
                    width: pageWidth,
                    height: 25,
                    color: rgb(1, 1, 1),
                  })
                  copiedPage.drawText(headerText.substring(0, 80), {
                    x: 10,
                    y: pageHeight - 15,
                    size: 8,
                    font,
                    color: rgb(0.3, 0.3, 0.3),
                  })
                }
              }
            } catch (pdfError) {
              console.error(`Failed to merge PDF receipt: ${expense.attachment_url}`, pdfError)
              // Skapa en sida med felmeddelande
              const errorPage = pdfDoc.addPage([595, 842])
              errorPage.drawText(headerText, { x: 50, y: 800, size: 10, font })
              errorPage.drawText('Kunde inte ladda PDF-kvitto', {
                x: 50,
                y: 750,
                size: 12,
                font,
                color: rgb(0.8, 0, 0),
              })
            }
          } else {
            // Lägg till bild (JPEG/PNG)
            try {
              let image
              if (ext === 'png') {
                image = await pdfDoc.embedPng(blob)
              } else {
                image = await pdfDoc.embedJpg(blob)
              }

              const imagePage = pdfDoc.addPage([595, 842])
              const { width: imgWidth, height: imgHeight } = image.scale(1)

              // Beräkna skalning för att passa på sidan
              const maxWidth = 515 // 595 - 80 margin
              const maxHeight = 720 // 842 - 122 margin (top header + bottom)
              const scale = Math.min(maxWidth / imgWidth, maxHeight / imgHeight, 1)

              const scaledWidth = imgWidth * scale
              const scaledHeight = imgHeight * scale

              // Header
              imagePage.drawText(headerText.substring(0, 80), {
                x: 50,
                y: 820,
                size: 10,
                font,
                color: rgb(0.3, 0.3, 0.3),
              })

              // Bild centrerad horisontellt
              imagePage.drawImage(image, {
                x: 50 + (maxWidth - scaledWidth) / 2,
                y: 50 + (maxHeight - scaledHeight) / 2,
                width: scaledWidth,
                height: scaledHeight,
              })
            } catch (imgError) {
              console.error(`Failed to embed image: ${expense.attachment_url}`, imgError)
              const errorPage = pdfDoc.addPage([595, 842])
              errorPage.drawText(headerText, { x: 50, y: 800, size: 10, font })
              errorPage.drawText('Kunde inte ladda bild', { x: 50, y: 750, size: 12, font, color: rgb(0.8, 0, 0) })
            }
          }
        } catch (fetchError) {
          console.error(`Failed to fetch receipt for PDF: ${expense.attachment_url}`, fetchError)
        }
      }

      const pdfBytes = await pdfDoc.save()

      await logActivity({
        userId: user.id,
        eventType: 'expenses_exported',
        entityType: 'expenses',
        metadata: { format: 'pdf', year, month, count: typedExpenses.length },
      })

      return new NextResponse(Buffer.from(pdfBytes), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileBaseName}.pdf"`,
        },
      })
    }

    return NextResponse.json({ error: 'Invalid format. Use: zip, pdf, or individual' }, { status: 400 })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Export failed' }, { status: 500 })
  }
}
