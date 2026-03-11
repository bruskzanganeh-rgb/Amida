import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import nodemailer from 'nodemailer'
import { Resend } from 'resend'
import { logActivity } from '@/lib/activity'
import { generateInvoicePdf } from '@/lib/pdf/generator'
import { createAdminClient } from '@/lib/supabase/admin'
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown'
  const { success } = rateLimit(`send-reminder:${ip}`, 10, 60_000)
  if (!success) return rateLimitResponse()

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { invoiceId, to, subject, message } = body

    if (!invoiceId || !to || !subject) {
      return NextResponse.json({ error: 'invoiceId, to and subject required' }, { status: 400 })
    }

    const serviceSupabase = createAdminClient()

    // Fetch invoice (RLS handles company scoping)
    const { data: invoice, error: fetchError } = await supabase
      .from('invoices')
      .select('*, client:clients(name, email, org_number, address, payment_terms, reference_person, invoice_language)')
      .eq('id', invoiceId)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Get subscription for branding check
    const { data: subscription } = await supabase
      .from('subscriptions')
      .select('plan, status')
      .eq('user_id', user.id)
      .single()

    const isPaidPlan =
      (subscription?.plan === 'pro' || subscription?.plan === 'team') && subscription?.status === 'active'

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
        'smtp_host, smtp_port, smtp_user, smtp_password, smtp_from_email, smtp_from_name, company_name, email_provider, org_number, address, email, phone, bank_account, bankgiro, iban, bic, vat_registration_number, late_payment_interest_text, our_reference',
      )
      .eq('id', membership.company_id)
      .single()

    if (companyError || !company) {
      return NextResponse.json({ error: 'Could not fetch company settings' }, { status: 500 })
    }

    // Generate PDF directly (avoid server-to-server fetch which lacks auth cookies)
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('description, amount, vat_rate')
      .eq('invoice_id', invoiceId)
      .order('sort_order')

    const clientData = invoice.client as unknown as {
      name: string
      org_number: string | null
      address: string | null
      payment_terms: number
      reference_person: string | null
      invoice_language: string | null
    }

    const isPro = isPaidPlan

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
      showBranding: !isPro,
      locale: clientData.invoice_language || 'sv',
      brandingName: brandingConfig?.value || 'Amida',
    })

    const fileAttachments = [
      {
        filename: `Faktura-${invoice.invoice_number}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      },
    ]

    const provider = company.email_provider || 'platform'
    const htmlBody = message ? `<p>${message.replace(/\n/g, '<br>')}</p>` : undefined

    if (provider === 'platform') {
      const { data: configRows } = await serviceSupabase
        .from('platform_config')
        .select('key, value')
        .in('key', ['resend_api_key', 'resend_from_email'])

      const config = Object.fromEntries((configRows || []).map((r) => [r.key, r.value]))

      if (!config.resend_api_key) {
        return NextResponse.json({ error: 'Platform email is not configured. Contact admin.' }, { status: 400 })
      }

      const resend = new Resend(config.resend_api_key)
      const fromEmail = config.resend_from_email || 'noreply@babalisk.com'
      const fromName = company.company_name || 'Amida'
      const fromAddress = `${fromName} <${fromEmail}>`

      await resend.emails.send({
        from: fromAddress,
        to: [to],
        subject,
        text: message || '',
        html: htmlBody,
        attachments: fileAttachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      })
    } else {
      if (!company.smtp_host || !company.smtp_from_email) {
        return NextResponse.json(
          { error: 'SMTP is not configured. Go to Settings and fill in email details.' },
          { status: 400 },
        )
      }

      const transporter = nodemailer.createTransport({
        host: company.smtp_host,
        port: company.smtp_port || 587,
        secure: company.smtp_port === 465,
        auth: company.smtp_user
          ? {
              user: company.smtp_user,
              pass: company.smtp_password || '',
            }
          : undefined,
      })

      const fromAddress = company.smtp_from_name
        ? `"${company.smtp_from_name}" <${company.smtp_from_email}>`
        : company.smtp_from_email

      await transporter.sendMail({
        from: fromAddress,
        to,
        subject,
        text: message || '',
        html: htmlBody,
        attachments: fileAttachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      })
    }

    // Store sent PDF if not already stored
    try {
      const { data: existingInvoice } = await serviceSupabase
        .from('invoices')
        .select('pdf_url')
        .eq('id', invoiceId)
        .single()

      if (!existingInvoice?.pdf_url) {
        const storagePath = `invoices/${invoiceId}/sent.pdf`
        const { error: uploadError } = await serviceSupabase.storage.from('expenses').upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        })

        if (!uploadError) {
          await serviceSupabase.from('invoices').update({ pdf_url: storagePath }).eq('id', invoiceId)
        } else {
          console.error('Reminder PDF storage upload error:', uploadError)
        }
      }
    } catch (storageErr) {
      console.error('Reminder PDF storage exception:', storageErr)
    }

    // Compute next reminder number
    const { data: maxReminder } = await supabase
      .from('invoice_reminders')
      .select('reminder_number')
      .eq('invoice_id', invoiceId)
      .order('reminder_number', { ascending: false })
      .limit(1)
      .single()

    const reminderNumber = (maxReminder?.reminder_number || 0) + 1

    // Record reminder
    await supabase.from('invoice_reminders').insert({
      invoice_id: invoiceId,
      user_id: user.id,
      sent_to: to,
      subject,
      message: message || null,
      reminder_number: reminderNumber,
    })

    // Log activity
    await logActivity({
      userId: user.id,
      eventType: 'invoice_reminder_sent',
      entityType: 'invoice',
      entityId: invoiceId,
      metadata: { to, invoice_number: invoice.invoice_number, reminder_number: reminderNumber, provider },
    })

    return NextResponse.json({ success: true, reminderNumber })
  } catch (error) {
    console.error('Send reminder error:', error)
    return NextResponse.json({ error: 'Could not send reminder' }, { status: 500 })
  }
}
