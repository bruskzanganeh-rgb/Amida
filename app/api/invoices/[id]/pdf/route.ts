import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateInvoicePdf } from '@/lib/pdf/generator'
import { logActivity } from '@/lib/activity'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`pdf:${ip}`, 20, 60_000)
  if (!success) return rateLimitResponse()

  try {
    const { id } = await params
    const supabase = await createClient()

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch invoice with client - verify ownership
    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .select(
        `
        invoice_number,
        invoice_date,
        due_date,
        subtotal,
        vat_rate,
        vat_amount,
        total,
        currency,
        reference_person_override,
        notes,
        reverse_charge,
        customer_vat_number,
        client:clients(name, org_number, address, payment_terms, reference_person, invoice_language)
      `,
      )
      .eq('id', id)
      .single()

    if (invoiceError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Fetch company info from companies table
    const { data: membership } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', user.id)
      .single()

    if (!membership?.company_id) {
      return NextResponse.json({ error: 'Company membership not found' }, { status: 500 })
    }

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select(
        'company_name, org_number, address, email, phone, bank_account, bankgiro, iban, bic, logo_url, vat_registration_number, late_payment_interest_text, show_logo_on_invoice, our_reference',
      )
      .eq('id', membership.company_id)
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: 'Company settings not found' }, { status: 500 })
    }

    // Fetch invoice lines if they exist
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('description, amount, vat_rate')
      .eq('invoice_id', id)
      .order('sort_order')

    // Generate PDF
    const clientData = invoice.client as unknown as {
      name: string
      org_number: string | null
      address: string | null
      payment_terms: number
      reference_person: string | null
      invoice_language: string | null
    }

    // Check subscription for branding
    let showBranding = true
    let sponsor = null

    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .single()

    const isPro = (subscription?.plan === 'pro' || subscription?.plan === 'team') && subscription?.status === 'active'
    showBranding = !isPro

    // Find sponsor if free user
    if (!isPro) {
      const { data: userCats } = await supabase.from('user_categories').select('category_id').eq('user_id', user.id)

      const categoryIds = (userCats || []).map((uc) => uc.category_id).filter(Boolean)

      if (categoryIds.length > 0) {
        const { data: sponsors } = await supabase
          .from('sponsors')
          .select('id, name, logo_url, tagline')
          .in('instrument_category_id', categoryIds)
          .eq('active', true)
          .order('priority', { ascending: false })
          .limit(1)

        if (sponsors && sponsors.length > 0) {
          sponsor = sponsors[0]

          // Track impression
          await supabase.from('sponsor_impressions').insert({
            sponsor_id: sponsor.id,
            user_id: user.id,
            invoice_id: id,
          })
        }
      }
    }

    // Fetch branding name from platform config
    const { data: brandingConfig } = await supabase
      .from('platform_config')
      .select('value')
      .eq('key', 'branding_name')
      .single()

    const pdfBuffer = await generateInvoicePdf({
      invoice: {
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        due_date: invoice.due_date,
        subtotal: invoice.subtotal,
        vat_rate: invoice.vat_rate,
        vat_amount: invoice.vat_amount,
        total: invoice.total,
        reference_person_override: invoice.reference_person_override,
        notes: invoice.notes,
        reverse_charge: invoice.reverse_charge,
        customer_vat_number: invoice.customer_vat_number,
      },
      client: clientData,
      company,
      lines: lines || undefined,
      currency: invoice.currency || 'SEK',
      showBranding,
      sponsor,
      locale: clientData.invoice_language || 'sv',
      brandingName: brandingConfig?.value || 'Amida',
    })

    // Log activity
    await logActivity({
      userId: user.id,
      eventType: 'invoice_downloaded',
      entityType: 'invoice',
      entityId: id,
      metadata: { invoice_number: invoice.invoice_number },
    })

    // Return PDF
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Faktura-${invoice.invoice_number}.pdf"`,
      },
    })
  } catch (error: unknown) {
    console.error('Error generating PDF:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
