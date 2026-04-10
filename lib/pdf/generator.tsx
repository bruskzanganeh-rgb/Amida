import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from '@react-pdf/renderer'

// Using built-in fonts: Helvetica (sans-serif), Times-Roman (serif)

// Types
type CompanySettings = {
  company_name: string
  org_number: string
  address: string
  email: string
  phone: string
  bank_account: string
  bankgiro?: string | null
  iban?: string | null
  bic?: string | null
  bank_address?: string | null
  vat_registration_number?: string | null
  late_payment_interest_text?: string | null
  our_reference?: string | null
}

type Client = {
  name: string
  org_number: string | null
  address: string | null
  payment_terms?: number
  reference_person?: string | null
}

type InvoiceData = {
  invoice_number: number
  invoice_date: string
  due_date: string
  subtotal: number
  vat_rate: number
  vat_amount: number
  total: number
  reference_person_override?: string | null
  notes?: string | null
  reverse_charge?: boolean | null
  customer_vat_number?: string | null
}

type InvoiceLine = {
  description: string
  amount: number
  vat_rate: number | null
}

type SponsorData = {
  name: string
  logo_url: string | null
  tagline: string | null
}

type GeneratePdfParams = {
  invoice: InvoiceData
  client: Client
  company: CompanySettings
  lines?: InvoiceLine[]
  currency?: string
  showBranding?: boolean
  sponsor?: SponsorData | null
  locale?: string
  brandingName?: string
}

// Localized labels for PDF generation
const PDF_LABELS: Record<string, Record<string, string>> = {
  sv: {
    invoice: 'Faktura',
    orgNr: 'Org.nr',
    billedTo: 'Faktureras till',
    invoiceDate: 'Fakturadatum',
    dueDate: 'Förfallodatum',
    ourReference: 'Vår referens',
    yourReference: 'Er referens',
    paymentTerms: 'Betalningsvillkor',
    daysNet: 'dagar netto',
    bankAccount: 'Bankgiro',
    bankgiro: 'Bankgiro',
    iban: 'IBAN',
    bic: 'BIC',
    bankAddress: 'Bankens adress',
    description: 'Beskrivning',
    amount: 'Belopp',
    subtotal: 'Summa',
    vat: 'Moms',
    basis: 'underlag',
    totalDue: 'Att betala',
    paymentRef: 'Vänligen ange fakturanummer #{n} som referens vid betalning!',
    phone: 'Telefon',
    email: 'E-post',
    vatRegNumber: 'Momsreg.nr',
    message: 'Meddelande',
    createdWith: 'Skapad med',
    poweredBy: 'Sponsrad av',
    invoicedAmount: 'Fakturerat belopp',
    reverseCharge: 'Omvänd skattskyldighet — Reverse charge pursuant to Article 196, Council Directive 2006/112/EC',
    customerVatNumber: 'Kundens momsnr',
  },
  en: {
    invoice: 'Invoice',
    orgNr: 'Org. no.',
    billedTo: 'Billed to',
    invoiceDate: 'Invoice date',
    dueDate: 'Due date',
    ourReference: 'Our reference',
    yourReference: 'Your reference',
    paymentTerms: 'Payment terms',
    daysNet: 'days net',
    bankAccount: 'Bank account',
    bankgiro: 'Bankgiro',
    iban: 'IBAN',
    bic: 'BIC',
    bankAddress: 'Bank address',
    description: 'Description',
    amount: 'Amount',
    subtotal: 'Subtotal',
    vat: 'VAT',
    basis: 'basis',
    totalDue: 'Total due',
    paymentRef: 'Please quote invoice #{n} as reference when paying!',
    phone: 'Phone',
    email: 'Email',
    vatRegNumber: 'VAT reg. no.',
    message: 'Message',
    createdWith: 'Created with',
    poweredBy: 'Powered by',
    invoicedAmount: 'Invoiced amount',
    reverseCharge:
      'Reverse charge — VAT to be accounted for by the recipient pursuant to Article 196, Council Directive 2006/112/EC',
    customerVatNumber: 'Customer VAT no.',
  },
}

function getLabels(locale: string) {
  return PDF_LABELS[locale] || PDF_LABELS.sv
}

// Premium color palette
const colors = {
  primary: '#111827',
  secondary: '#6b7280',
  accent: '#2563eb',
  border: '#e5e7eb',
  muted: '#9ca3af',
}

// Styles - Compact professional design (using built-in fonts)
const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: colors.primary,
    backgroundColor: '#ffffff',
  },

  // Header section - 2 column layout
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 30,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    textAlign: 'right',
  },
  // Company name
  companyName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    marginBottom: 6,
    color: colors.primary,
  },
  companyDetail: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.secondary,
    marginBottom: 2,
  },

  // Invoice title section
  invoiceLabel: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  invoiceNumber: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 20,
    color: colors.accent,
    marginTop: 2,
  },

  // Meta section (client + dates)
  metaSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottom: `1px solid ${colors.border}`,
  },
  // Invoice details section (VAT reg, reference, payment terms)
  invoiceDetailsSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 15,
    paddingBottom: 10,
    borderBottom: `1px solid ${colors.border}`,
  },
  invoiceDetailItem: {
    minWidth: 160,
    marginRight: 15,
    marginBottom: 4,
  },
  invoiceDetailLabel: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.secondary,
  },
  invoiceDetailValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: colors.primary,
  },
  clientSection: {
    flex: 1,
  },
  datesSection: {
    textAlign: 'right',
  },
  label: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  clientName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    marginBottom: 3,
    color: colors.primary,
  },
  clientDetail: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.secondary,
    marginBottom: 2,
  },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 4,
  },
  dateLabel: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.secondary,
    width: 75,
    textAlign: 'right',
    marginRight: 10,
  },
  dateValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    width: 70,
    textAlign: 'right',
    color: colors.primary,
  },

  // Table - minimal
  table: {
    marginBottom: 20,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    marginBottom: 6,
    borderBottom: `1px solid ${colors.border}`,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  descCol: {
    flex: 4,
  },
  amountCol: {
    flex: 1,
    textAlign: 'right',
  },
  headerText: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.secondary,
    textTransform: 'uppercase',
  },
  rowText: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.primary,
  },
  rowAmount: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: colors.primary,
  },
  vatUnderlag: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.secondary,
  },

  // Notes section
  notesSection: {
    marginTop: 15,
    paddingTop: 10,
    borderTop: `1px solid ${colors.border}`,
  },
  notesLabel: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.secondary,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  notesText: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.primary,
    lineHeight: 1.4,
  },

  // Bottom section - anchored to bottom of page
  bottomSection: {
    position: 'absolute',
    bottom: 185,
    left: 50,
    right: 50,
  },

  // Totals section
  totalsSection: {
    marginLeft: 'auto',
    width: 250,
    marginBottom: 15,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  totalLabel: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.secondary,
  },
  totalValue: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.primary,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    marginTop: 6,
    borderTop: `1.5px solid ${colors.primary}`,
  },
  grandTotalLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textTransform: 'uppercase',
    color: colors.primary,
  },
  grandTotalValue: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: colors.primary,
  },

  // Payment reference text
  paymentReferenceText: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: colors.primary,
    textAlign: 'center',
    marginBottom: 6,
  },
  latePaymentText: {
    fontFamily: 'Helvetica-Oblique',
    fontSize: 7,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 10,
  },

  // Footer - multi-column layout
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    borderTop: `1px solid ${colors.border}`,
    paddingTop: 10,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 15,
  },
  footerColumn: {
    flex: 1,
  },
  footerColumnRight: {
    flex: 1,
    textAlign: 'right',
  },
  footerLabel: {
    fontFamily: 'Helvetica',
    fontSize: 7,
    color: colors.secondary,
    marginBottom: 1,
  },
  footerValue: {
    fontFamily: 'Helvetica',
    fontSize: 7,
    color: colors.primary,
    marginBottom: 3,
  },
  footerValueBold: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    color: colors.primary,
    marginBottom: 3,
  },
})

// Currency symbols for PDF — use ISO codes for Nordic currencies to avoid "kr" ambiguity
const PDF_CURRENCY_SUFFIX: Record<string, string> = {
  SEK: 'SEK',
  NOK: 'NOK',
  DKK: 'DKK',
  EUR: 'EUR',
  USD: 'USD',
  GBP: 'GBP',
  CHF: 'CHF',
  CZK: 'CZK',
  PLN: 'PLN',
}

// Format currency for PDF — uses the invoice currency
function formatCurrencyPdf(amount: number, currency = 'SEK'): string {
  const formatted = amount
    .toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\u2212/g, '-') // Node.js sv-SE uses Unicode minus which Helvetica can't render
  const symbol = PDF_CURRENCY_SUFFIX[currency] || currency
  if (currency === 'EUR' || currency === 'USD' || currency === 'GBP') {
    const prefix = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : '$'
    return `${prefix}\u00A0${formatted}`
  }
  return `${formatted} ${symbol}`
}

// Format date — always ISO yyyy-MM-dd (unambiguous across locales)
function formatDate(dateStr: string): string {
  // Input is typically already yyyy-MM-dd, but normalize to be safe
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// PDF Document Component
function InvoicePDF({
  invoice,
  client,
  company,
  lines,
  currency = 'SEK',
  showBranding = false,
  sponsor,
  locale = 'sv',
  brandingName = 'Amida',
}: GeneratePdfParams) {
  const fmt = (amount: number) => formatCurrencyPdf(amount, currency)
  const l = getLabels(locale)
  const invoiceLines =
    lines && lines.length > 0
      ? lines
      : [{ description: l.invoicedAmount, amount: invoice.subtotal, vat_rate: invoice.vat_rate }]

  // Group lines by VAT rate and calculate underlag (base amount) for each
  const vatGroups = invoiceLines.reduce(
    (acc, line) => {
      const rate = line.vat_rate ?? 0
      if (!acc[rate]) {
        acc[rate] = { underlag: 0, vat: 0 }
      }
      acc[rate].underlag += line.amount
      acc[rate].vat += (line.amount * rate) / 100
      return acc
    },
    {} as Record<number, { underlag: number; vat: number }>,
  )

  // Sort VAT rates (0% first, then ascending)
  const sortedVatRates = Object.keys(vatGroups)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header - 2 column layout */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.companyName}>{company.company_name}</Text>
            <Text style={styles.companyDetail}>
              {l.orgNr} {company.org_number}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.invoiceLabel}>{l.invoice}</Text>
            <Text style={styles.invoiceNumber}>#{invoice.invoice_number}</Text>
          </View>
        </View>

        {/* Client & Dates Section */}
        <View style={styles.metaSection}>
          <View style={styles.clientSection}>
            <Text style={styles.label}>{l.billedTo}</Text>
            <Text style={styles.clientName}>{client.name}</Text>
            {client.org_number && (
              <Text style={styles.clientDetail}>
                {l.orgNr} {client.org_number}
              </Text>
            )}
            {client.address && <Text style={styles.clientDetail}>{client.address}</Text>}
          </View>
          <View style={styles.datesSection}>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{l.invoiceDate}</Text>
              <Text style={styles.dateValue}>{formatDate(invoice.invoice_date)}</Text>
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{l.dueDate}</Text>
              <Text style={styles.dateValue}>{formatDate(invoice.due_date)}</Text>
            </View>
          </View>
        </View>

        {/* Invoice Details Section - our reference, client reference, payment terms, bankgiro */}
        {(company.our_reference ||
          invoice.reference_person_override ||
          client.reference_person ||
          client.payment_terms) && (
          <View style={styles.invoiceDetailsSection}>
            {company.our_reference && (
              <View style={styles.invoiceDetailItem}>
                <Text>
                  <Text style={styles.invoiceDetailLabel}>{l.ourReference} </Text>
                  <Text style={styles.invoiceDetailValue}>{company.our_reference}</Text>
                </Text>
              </View>
            )}
            {(invoice.reference_person_override || client.reference_person) && (
              <View style={styles.invoiceDetailItem}>
                <Text>
                  <Text style={styles.invoiceDetailLabel}>{l.yourReference} </Text>
                  <Text style={styles.invoiceDetailValue}>
                    {invoice.reference_person_override || client.reference_person}
                  </Text>
                </Text>
              </View>
            )}
            {client.payment_terms && (
              <View style={styles.invoiceDetailItem}>
                <Text>
                  <Text style={styles.invoiceDetailLabel}>{l.paymentTerms} </Text>
                  <Text style={styles.invoiceDetailValue}>
                    {client.payment_terms} {l.daysNet}
                  </Text>
                </Text>
              </View>
            )}
            {company.bankgiro ? (
              <View style={styles.invoiceDetailItem}>
                <Text>
                  <Text style={styles.invoiceDetailLabel}>{l.bankgiro} </Text>
                  <Text style={styles.invoiceDetailValue}>{company.bankgiro}</Text>
                </Text>
              </View>
            ) : company.bank_account ? (
              <View style={styles.invoiceDetailItem}>
                <Text>
                  <Text style={styles.invoiceDetailLabel}>{l.bankAccount} </Text>
                  <Text style={styles.invoiceDetailValue}>{company.bank_account}</Text>
                </Text>
              </View>
            ) : null}
            {company.iban && (
              <View style={styles.invoiceDetailItem}>
                <Text>
                  <Text style={styles.invoiceDetailLabel}>{l.iban} </Text>
                  <Text style={styles.invoiceDetailValue}>{company.iban}</Text>
                </Text>
              </View>
            )}
            {company.bic && (
              <View style={styles.invoiceDetailItem}>
                <Text>
                  <Text style={styles.invoiceDetailLabel}>{l.bic} </Text>
                  <Text style={styles.invoiceDetailValue}>{company.bic}</Text>
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Line Items Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.headerText, styles.descCol]}>{l.description}</Text>
            <Text style={[styles.headerText, styles.amountCol]}>{l.amount}</Text>
          </View>
          {invoiceLines.map((line, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={[styles.rowText, styles.descCol]}>{line.description}</Text>
              <Text style={[styles.rowAmount, styles.amountCol]}>{fmt(line.amount)}</Text>
            </View>
          ))}
        </View>

        {/* Notes Section */}
        {invoice.notes && (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>{l.message}</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        )}

        {/* Bottom Section - anchored to bottom */}
        <View style={styles.bottomSection}>
          {/* Totals */}
          <View style={styles.totalsSection}>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{l.subtotal}</Text>
              <Text style={styles.totalValue}>{fmt(invoice.subtotal)}</Text>
            </View>
            {sortedVatRates.map((rate) => (
              <View key={rate} style={styles.totalRow}>
                <Text style={styles.vatUnderlag}>
                  {l.vat} {rate}% ({l.basis}{' '}
                  {vatGroups[rate].underlag.toLocaleString('sv-SE', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                  )
                </Text>
                <Text style={styles.totalValue}>{fmt(vatGroups[rate].vat)}</Text>
              </View>
            ))}
            <View style={styles.grandTotalRow}>
              <Text style={styles.grandTotalLabel}>{l.totalDue}</Text>
              <Text style={styles.grandTotalValue}>{fmt(invoice.total)}</Text>
            </View>
          </View>
        </View>

        {/* Reverse charge notice */}
        {invoice.reverse_charge && (
          <View style={{ marginTop: 8, padding: 8, backgroundColor: '#fef3c7', borderRadius: 4 }}>
            <Text style={{ fontSize: 7.5, color: '#92400e', fontWeight: 700 }}>{l.reverseCharge}</Text>
            {invoice.customer_vat_number && (
              <Text style={{ fontSize: 7, color: '#92400e', marginTop: 2 }}>
                {l.customerVatNumber}: {invoice.customer_vat_number}
              </Text>
            )}
          </View>
        )}

        {/* Footer - 3 column layout */}
        <View style={styles.footer}>
          {/* Payment reference text */}
          <Text style={styles.paymentReferenceText}>{l.paymentRef.replace('#{n}', `#${invoice.invoice_number}`)}</Text>

          {/* Late payment interest text */}
          {company.late_payment_interest_text && (
            <Text style={styles.latePaymentText}>{company.late_payment_interest_text}</Text>
          )}

          <View style={styles.footerRow}>
            {/* Column 1: Company name and address */}
            <View style={styles.footerColumn}>
              <Text style={styles.footerValueBold}>{company.company_name}</Text>
              {company.address?.split('\n').map((line, i) => (
                <Text key={i} style={styles.footerValue}>
                  {line}
                </Text>
              ))}
              {company.vat_registration_number && (
                <>
                  <Text style={styles.footerLabel}>{l.vatRegNumber}</Text>
                  <Text style={styles.footerValue}>{company.vat_registration_number}</Text>
                </>
              )}
            </View>

            {/* Column 2: Contact info */}
            <View style={styles.footerColumn}>
              <Text style={styles.footerLabel}>{l.phone}</Text>
              <Text style={styles.footerValue}>{company.phone}</Text>
              <Text style={styles.footerLabel}>{l.email}</Text>
              <Text style={styles.footerValue}>{company.email}</Text>
            </View>

            {/* Column 3: Payment info */}
            <View style={styles.footerColumnRight}>
              {company.bankgiro ? (
                <>
                  <Text style={styles.footerLabel}>{l.bankgiro}</Text>
                  <Text style={styles.footerValueBold}>{company.bankgiro}</Text>
                </>
              ) : company.bank_account ? (
                <>
                  <Text style={styles.footerLabel}>{l.bankAccount}</Text>
                  <Text style={styles.footerValueBold}>{company.bank_account}</Text>
                </>
              ) : null}
              {company.iban && (
                <>
                  <Text style={styles.footerLabel}>{l.iban}</Text>
                  <Text style={styles.footerValue}>{company.iban}</Text>
                </>
              )}
              {company.bic && (
                <>
                  <Text style={styles.footerLabel}>{l.bic}</Text>
                  <Text style={styles.footerValue}>{company.bic}</Text>
                </>
              )}
              {company.bank_address && (
                <>
                  <Text style={styles.footerLabel}>{l.bankAddress}</Text>
                  <Text style={styles.footerValue}>{company.bank_address}</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* Branding footer for free users */}
        {showBranding && (
          <View
            style={{
              position: 'absolute',
              bottom: 15,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Text style={{ fontSize: 7, color: colors.muted }}>
              {l.createdWith} {brandingName}
            </Text>
            {sponsor && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: 7, color: colors.muted }}>
                  {' | '}
                  {l.poweredBy}
                </Text>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image does not support alt */}
                {sponsor.logo_url && <Image src={sponsor.logo_url} style={{ height: 10 }} />}
                <Text style={{ fontSize: 7, color: colors.muted }}>{sponsor.name}</Text>
              </View>
            )}
          </View>
        )}
      </Page>
    </Document>
  )
}

// Export function to generate PDF buffer
export async function generateInvoicePdf(params: GeneratePdfParams): Promise<Buffer> {
  const buffer = await renderToBuffer(<InvoicePDF {...params} />)
  return Buffer.from(buffer)
}
