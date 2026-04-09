'use client'

import { useTranslations } from 'next-intl'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'

// Premium color palette (same as PDF)
const colors = {
  primary: '#111827',
  secondary: '#6b7280',
  accent: '#2563eb',
  border: '#e5e7eb',
  muted: '#9ca3af',
}

// Inline labels matching lib/pdf/generator.tsx
const LABELS: Record<string, Record<string, string>> = {
  sv: {
    invoice: 'Faktura',
    orgNr: 'Org.nr',
    billedTo: 'Faktureras till',
    invoiceDate: 'Fakturadatum',
    dueDate: 'Förfallodatum',
    ourReference: 'Vår referens',
    yourReference: 'Er referens',
    daysNet: 'dagar netto',
    bankAccount: 'Bankgiro',
    bankgiro: 'Bankgiro',
    iban: 'IBAN',
    bic: 'BIC',
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
    invoicedAmount: 'Fakturerat belopp',
    reverseCharge: 'Omvänd skattskyldighet — Reverse charge pursuant to Article 196, Council Directive 2006/112/EC',
  },
  en: {
    invoice: 'Invoice',
    orgNr: 'Org. no.',
    billedTo: 'Billed to',
    invoiceDate: 'Invoice date',
    dueDate: 'Due date',
    ourReference: 'Our reference',
    yourReference: 'Your reference',
    daysNet: 'days net',
    bankAccount: 'Bank account',
    bankgiro: 'Bankgiro',
    iban: 'IBAN',
    bic: 'BIC',
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
    invoicedAmount: 'Invoiced amount',
    reverseCharge: 'Reverse charge pursuant to Article 196, Council Directive 2006/112/EC',
  },
}

function getLabels(locale: string) {
  return LABELS[locale] || LABELS.sv
}

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
  org_number?: string | null
  address?: string | null
  payment_terms?: number
}

type InvoiceLine = {
  description: string
  amount: number
  vat_rate: number
}

type InvoicePreviewProps = {
  company: CompanySettings | null
  client: Client | null
  invoiceNumber: number
  invoiceDate: string
  dueDate: string
  lines: InvoiceLine[]
  subtotal: number
  vatAmount: number
  total: number
  primaryVatRate: number
  referencePerson?: string
  notes?: string
  reverseCharge?: boolean
  locale?: string
  currency?: string
}

const CURRENCY_SUFFIX: Record<string, string> = {
  SEK: 'kr',
  NOK: 'NOK',
  DKK: 'DKK',
  EUR: 'EUR',
  USD: 'USD',
  GBP: 'GBP',
  CHF: 'CHF',
  CZK: 'CZK',
  PLN: 'PLN',
}

export function InvoicePreview({
  company,
  client,
  invoiceNumber,
  invoiceDate,
  dueDate,
  lines,
  subtotal,
  total,
  primaryVatRate,
  referencePerson,
  notes,
  reverseCharge,
  locale: localeProp,
  currency: currencyProp = 'SEK',
}: InvoicePreviewProps) {
  const t = useTranslations('invoice')
  const formatLocale = useFormatLocale()

  // Use client's invoice_language if provided, otherwise fall back to app locale
  const l = getLabels(localeProp || 'sv')

  function formatCurrency(amount: number): string {
    const formatted = amount.toLocaleString(formatLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    if (currencyProp === 'EUR' || currencyProp === 'USD' || currencyProp === 'GBP') {
      const prefix = currencyProp === 'EUR' ? '€' : currencyProp === 'GBP' ? '£' : '$'
      return `${prefix}${formatted}`
    }
    const symbol = CURRENCY_SUFFIX[currencyProp] || currencyProp
    return `${formatted} ${symbol}`
  }

  function formatCurrencyRaw(amount: number): string {
    return amount.toLocaleString(formatLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function formatDate(dateStr: string): string {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) return dateStr
    // ISO yyyy-MM-dd — unambiguous across locales (avoids US MM/DD/YYYY)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const displayLines =
    lines.length > 0 ? lines : [{ description: l.invoicedAmount, amount: subtotal, vat_rate: primaryVatRate }]

  // Group lines by VAT rate and calculate underlag (base amount) for each
  const vatGroups = displayLines.reduce(
    (acc, line) => {
      const rate = line.vat_rate
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

  // A4 proportions: 595 x 842 points
  // Scale to fit in ~390px width: scale = 390/595 = 0.655
  // Outer container: 390 x 551px
  return (
    <div style={{ width: '390px', height: '551px', overflow: 'hidden' }}>
      <div
        className="bg-white rounded-lg shadow-lg"
        style={{
          width: '595px',
          height: '842px',
          transform: 'scale(0.655)',
          transformOrigin: 'top left',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: colors.primary,
        }}
      >
        {/* Page content with PDF-matching padding */}
        <div style={{ padding: '50px', height: '100%', display: 'flex', flexDirection: 'column' }}>
          {/* Header - 2 column layout */}
          <div
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '30px' }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '6px' }}>
                {company?.company_name || t('companyName')}
              </div>
              <div style={{ fontSize: '8px', color: colors.secondary }}>
                {l.orgNr} {company?.org_number || '-'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div
                style={{ fontSize: '9px', color: colors.secondary, textTransform: 'uppercase', letterSpacing: '1px' }}
              >
                {l.invoice}
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '20px', color: colors.accent, marginTop: '2px' }}>
                #{invoiceNumber}
              </div>
            </div>
          </div>

          {/* Client & Dates Section - matches PDF metaSection */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '15px',
              paddingBottom: '15px',
              borderBottom: `1px solid ${colors.border}`,
            }}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: '8px',
                  color: colors.secondary,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: '4px',
                }}
              >
                {l.billedTo}
              </div>
              <div style={{ fontWeight: 'bold', fontSize: '11px', marginBottom: '3px' }}>
                {client?.name || t('selectClientPlaceholder')}
              </div>
              {client?.org_number && (
                <div style={{ fontSize: '9px', color: colors.secondary, marginBottom: '2px' }}>
                  {l.orgNr} {client.org_number}
                </div>
              )}
              {client?.address && <div style={{ fontSize: '9px', color: colors.secondary }}>{client.address}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '4px' }}>
                <span
                  style={{
                    fontSize: '8px',
                    color: colors.secondary,
                    width: '75px',
                    textAlign: 'right',
                    marginRight: '10px',
                  }}
                >
                  {l.invoiceDate}
                </span>
                <span style={{ fontWeight: 'bold', fontSize: '9px', width: '70px', textAlign: 'right' }}>
                  {formatDate(invoiceDate)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
                <span
                  style={{
                    fontSize: '8px',
                    color: colors.secondary,
                    width: '75px',
                    textAlign: 'right',
                    marginRight: '10px',
                  }}
                >
                  {l.dueDate}
                </span>
                <span style={{ fontWeight: 'bold', fontSize: '9px', width: '70px', textAlign: 'right' }}>
                  {formatDate(dueDate)}
                </span>
              </div>
            </div>
          </div>

          {/* Invoice Details Section - Our Reference, Client Reference, Payment Terms, Bankgiro */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              marginBottom: '15px',
              paddingBottom: '10px',
              borderBottom: `1px solid ${colors.border}`,
              fontSize: '8px',
            }}
          >
            {company?.our_reference && (
              <div style={{ minWidth: '140px' }}>
                <span style={{ color: colors.secondary }}>{l.ourReference} </span>
                <span style={{ fontWeight: 'bold' }}>{company.our_reference}</span>
              </div>
            )}
            {referencePerson && (
              <div style={{ minWidth: '140px' }}>
                <span style={{ color: colors.secondary }}>{l.yourReference} </span>
                <span style={{ fontWeight: 'bold' }}>{referencePerson}</span>
              </div>
            )}
            {client?.payment_terms && (
              <div style={{ minWidth: '140px' }}>
                <span style={{ color: colors.secondary }}>
                  {client.payment_terms} {l.daysNet}
                </span>
              </div>
            )}
            {company?.bankgiro ? (
              <div style={{ minWidth: '140px' }}>
                <span style={{ color: colors.secondary }}>{l.bankgiro} </span>
                <span style={{ fontWeight: 'bold' }}>{company.bankgiro}</span>
              </div>
            ) : company?.bank_account ? (
              <div style={{ minWidth: '140px' }}>
                <span style={{ color: colors.secondary }}>{l.bankAccount} </span>
                <span style={{ fontWeight: 'bold' }}>{company.bank_account}</span>
              </div>
            ) : (
              <div style={{ minWidth: '140px' }}>
                <span style={{ color: colors.secondary }}>{l.bankAccount} </span>
                <span style={{ fontWeight: 'bold' }}>-</span>
              </div>
            )}
            {company?.iban && (
              <div style={{ minWidth: '140px' }}>
                <span style={{ color: colors.secondary }}>{l.iban} </span>
                <span style={{ fontWeight: 'bold' }}>{company.iban}</span>
              </div>
            )}
            {company?.bic && (
              <div style={{ minWidth: '140px' }}>
                <span style={{ color: colors.secondary }}>{l.bic} </span>
                <span style={{ fontWeight: 'bold' }}>{company.bic}</span>
              </div>
            )}
          </div>

          {/* Line Items Table - matches PDF table */}
          <div style={{ marginBottom: '20px', flex: 1 }}>
            <div
              style={{
                display: 'flex',
                paddingBottom: '8px',
                marginBottom: '6px',
                borderBottom: `1px solid ${colors.border}`,
              }}
            >
              <div style={{ flex: 4, fontSize: '8px', color: colors.secondary, textTransform: 'uppercase' }}>
                {l.description}
              </div>
              <div
                style={{
                  flex: 1,
                  textAlign: 'right',
                  fontSize: '8px',
                  color: colors.secondary,
                  textTransform: 'uppercase',
                }}
              >
                {l.amount}
              </div>
            </div>
            {displayLines.map((line, index) => (
              <div key={index} style={{ display: 'flex', paddingTop: '6px', paddingBottom: '6px' }}>
                <div style={{ flex: 4, fontSize: '8px' }}>{line.description || `${l.description}...`}</div>
                <div style={{ flex: 1, textAlign: 'right', fontWeight: 'bold', fontSize: '8px' }}>
                  {formatCurrency(line.amount)}
                </div>
              </div>
            ))}
          </div>

          {/* Notes Section */}
          {notes && (
            <div
              style={{
                marginTop: '10px',
                paddingTop: '8px',
                borderTop: `1px solid ${colors.border}`,
              }}
            >
              <div
                style={{ fontSize: '7px', color: colors.secondary, textTransform: 'uppercase', marginBottom: '3px' }}
              >
                {l.message}
              </div>
              <div style={{ fontSize: '8px', color: colors.primary, lineHeight: 1.4 }}>{notes}</div>
            </div>
          )}

          {/* Bottom Section - positioned at bottom */}
          <div style={{ marginTop: 'auto' }}>
            {/* Totals - matches PDF totalsSection */}
            <div style={{ marginLeft: 'auto', width: '250px', marginBottom: '15px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '4px',
                  paddingBottom: '4px',
                }}
              >
                <span style={{ fontSize: '9px', color: colors.secondary }}>{l.subtotal}</span>
                <span style={{ fontSize: '9px' }}>{formatCurrency(subtotal)}</span>
              </div>
              {sortedVatRates.map((rate) => (
                <div
                  key={rate}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '4px',
                    paddingBottom: '4px',
                  }}
                >
                  <span style={{ fontSize: '8px', color: colors.secondary }}>
                    {l.vat} {rate}% ({l.basis} {formatCurrencyRaw(vatGroups[rate].underlag)})
                  </span>
                  <span style={{ fontSize: '9px' }}>{formatCurrency(vatGroups[rate].vat)}</span>
                </div>
              ))}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '8px',
                  marginTop: '6px',
                  borderTop: `1.5px solid ${colors.primary}`,
                }}
              >
                <span style={{ fontWeight: 'bold', fontSize: '10px', textTransform: 'uppercase' }}>{l.totalDue}</span>
                <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{formatCurrency(total)}</span>
              </div>
            </div>

            {/* Reverse charge notice */}
            {reverseCharge && (
              <div
                style={{
                  marginTop: '6px',
                  padding: '6px 8px',
                  backgroundColor: '#fef3c7',
                  borderRadius: '3px',
                  fontSize: '7px',
                  color: '#92400e',
                  fontWeight: 600,
                }}
              >
                {l.reverseCharge}
              </div>
            )}

            {/* Footer - 4 column layout */}
            <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: '10px', marginTop: '5px' }}>
              {/* Payment reference text */}
              <div
                style={{
                  fontWeight: 'bold',
                  fontSize: '8px',
                  color: colors.primary,
                  textAlign: 'center',
                  marginBottom: '6px',
                }}
              >
                {l.paymentRef.replace('#{n}', `#${invoiceNumber}`)}
              </div>

              {/* Late payment interest text */}
              {company?.late_payment_interest_text && (
                <div
                  style={{
                    fontSize: '7px',
                    color: colors.muted,
                    fontStyle: 'italic',
                    textAlign: 'center',
                    marginBottom: '10px',
                  }}
                >
                  {company.late_payment_interest_text}
                </div>
              )}

              <div style={{ display: 'flex', gap: '15px' }}>
                {/* Column 1: Company name and address */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '7px', color: colors.primary, marginBottom: '3px' }}>
                    {company?.company_name || '-'}
                  </div>
                  {company?.address?.split('\n').map((line, i) => (
                    <div key={i} style={{ fontSize: '7px', color: colors.primary, marginBottom: '2px' }}>
                      {line}
                    </div>
                  ))}
                </div>

                {/* Column 2: Contact info */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '7px', color: colors.secondary, marginBottom: '1px' }}>{l.phone}</div>
                  <div style={{ fontSize: '7px', color: colors.primary, marginBottom: '3px' }}>
                    {company?.phone || '-'}
                  </div>
                  <div style={{ fontSize: '7px', color: colors.secondary, marginBottom: '1px' }}>{l.email}</div>
                  <div style={{ fontSize: '7px', color: colors.primary, marginBottom: '3px' }}>
                    {company?.email || '-'}
                  </div>
                </div>

                {/* Column 3: Payment info */}
                <div style={{ flex: 1, textAlign: 'right' }}>
                  {company?.bankgiro ? (
                    <>
                      <div style={{ fontSize: '7px', color: colors.secondary, marginBottom: '1px' }}>{l.bankgiro}</div>
                      <div style={{ fontWeight: 'bold', fontSize: '7px', color: colors.primary, marginBottom: '3px' }}>
                        {company.bankgiro}
                      </div>
                    </>
                  ) : company?.bank_account ? (
                    <>
                      <div style={{ fontSize: '7px', color: colors.secondary, marginBottom: '1px' }}>
                        {l.bankAccount}
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '7px', color: colors.primary, marginBottom: '3px' }}>
                        {company.bank_account}
                      </div>
                    </>
                  ) : null}
                  {company?.iban && (
                    <>
                      <div style={{ fontSize: '7px', color: colors.secondary, marginBottom: '1px' }}>{l.iban}</div>
                      <div style={{ fontSize: '7px', color: colors.primary, marginBottom: '3px' }}>{company.iban}</div>
                    </>
                  )}
                  {company?.bic && (
                    <>
                      <div style={{ fontSize: '7px', color: colors.secondary, marginBottom: '1px' }}>{l.bic}</div>
                      <div style={{ fontSize: '7px', color: colors.primary, marginBottom: '3px' }}>{company.bic}</div>
                    </>
                  )}
                  {company?.vat_registration_number && (
                    <>
                      <div style={{ fontSize: '7px', color: colors.secondary, marginBottom: '1px' }}>
                        {l.vatRegNumber}
                      </div>
                      <div style={{ fontSize: '7px', color: colors.primary, marginBottom: '3px' }}>
                        {company.vat_registration_number}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
