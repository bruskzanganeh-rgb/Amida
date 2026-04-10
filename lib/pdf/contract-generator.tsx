import React from 'react'
import { Document, Page, Text, View, StyleSheet, Image, renderToBuffer } from '@react-pdf/renderer'

const colors = {
  primary: '#111827',
  secondary: '#6b7280',
  accent: '#2563eb',
  border: '#e5e7eb',
  muted: '#9ca3af',
}

const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 9,
    fontFamily: 'Helvetica',
    color: colors.primary,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 30,
  },
  title: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    color: colors.primary,
    marginBottom: 4,
  },
  contractNumber: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: colors.accent,
  },
  dateText: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.secondary,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: colors.primary,
    marginTop: 20,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottom: `1px solid ${colors.border}`,
  },
  paragraph: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.primary,
    lineHeight: 1.5,
    marginBottom: 6,
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  partyBox: {
    flexDirection: 'row',
    gap: 30,
    marginBottom: 10,
  },
  partyColumn: {
    flex: 1,
    padding: 10,
    backgroundColor: '#f9fafb',
    borderRadius: 4,
  },
  partyLabel: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  partyName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    color: colors.primary,
    marginBottom: 3,
  },
  partyDetail: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.secondary,
    marginBottom: 2,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottom: `1px solid ${colors.border}`,
  },
  tableLabel: {
    flex: 2,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: colors.secondary,
  },
  tableValue: {
    flex: 3,
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: colors.primary,
  },
  signatureSection: {
    flexDirection: 'row',
    gap: 30,
    marginTop: 30,
  },
  signatureBox: {
    flex: 1,
    padding: 15,
    border: `1px solid ${colors.border}`,
    borderRadius: 4,
    minHeight: 120,
  },
  signatureLabel: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  signatureName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 9,
    color: colors.primary,
    marginBottom: 2,
  },
  signatureDetail: {
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: colors.secondary,
    marginBottom: 2,
  },
  signatureImage: {
    width: 150,
    height: 60,
    marginBottom: 6,
  },
  signatureLine: {
    borderBottom: `1px solid ${colors.primary}`,
    width: 150,
    marginTop: 30,
    marginBottom: 6,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    borderTop: `1px solid ${colors.border}`,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontFamily: 'Helvetica',
    fontSize: 7,
    color: colors.muted,
  },
})

type ContractPdfParams = {
  contractNumber: string
  tier: string
  annualPrice: number
  currency: string
  billingInterval: string
  vatRatePct: number
  contractStartDate: string
  contractDurationMonths: number
  customTerms?: Record<string, unknown>
  signerName: string
  signerEmail: string
  signerTitle?: string | null
  companyName?: string | null
  companyOrgNumber?: string | null
  companyAddress?: string | null
  // Signature data (for signed version)
  signed?: boolean
  signatureImageBase64?: string | null
  signedAt?: string | null
  signerIp?: string | null
  documentHash?: string | null
  locale?: string
}

function formatCurrency(amount: number, currency: string, locale = 'sv-SE'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount)
}

function formatDate(dateStr: string, locale = 'sv-SE'): string {
  return new Date(dateStr).toLocaleDateString(locale)
}

function ContractDocument(params: ContractPdfParams) {
  const locale = params.locale || 'sv-SE'
  const vatAmount = params.annualPrice * (params.vatRatePct / 100)
  const totalWithVat = params.annualPrice + vatAmount

  const intervalLabel: Record<string, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly',
    annual: 'Annually',
  }

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Subscription Agreement</Text>
            <Text style={styles.contractNumber}>{params.contractNumber}</Text>
          </View>
          <View>
            <Text style={styles.dateText}>Date: {formatDate(params.contractStartDate, locale)}</Text>
            {params.signed && params.signedAt && (
              <Text style={styles.dateText}>Signed: {formatDate(params.signedAt, locale)}</Text>
            )}
          </View>
        </View>

        {/* Parties */}
        <Text style={styles.sectionTitle}>1. Parties</Text>
        <View style={styles.partyBox}>
          <View style={styles.partyColumn}>
            <Text style={styles.partyLabel}>Service Provider</Text>
            <Text style={styles.partyName}>Amida</Text>
            <Text style={styles.partyDetail}>Subscription Management Platform</Text>
          </View>
          <View style={styles.partyColumn}>
            <Text style={styles.partyLabel}>Subscriber</Text>
            <Text style={styles.partyName}>{params.companyName || 'N/A'}</Text>
            {params.companyOrgNumber && <Text style={styles.partyDetail}>Org. no.: {params.companyOrgNumber}</Text>}
            {params.companyAddress && <Text style={styles.partyDetail}>{params.companyAddress}</Text>}
            <Text style={styles.partyDetail}>Contact: {params.signerName}</Text>
            <Text style={styles.partyDetail}>{params.signerEmail}</Text>
          </View>
        </View>

        {/* Service Description */}
        <Text style={styles.sectionTitle}>2. Service Description</Text>
        <Text style={styles.paragraph}>
          The Service Provider grants the Subscriber access to the Amida platform under the{' '}
          <Text style={styles.bold}>{params.tier}</Text> tier, including all features and services associated with this
          subscription level.
        </Text>

        {/* Pricing */}
        <Text style={styles.sectionTitle}>3. Pricing & Payment</Text>
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Subscription Tier</Text>
          <Text style={styles.tableValue}>{params.tier}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Annual Price (excl. VAT)</Text>
          <Text style={styles.tableValue}>{formatCurrency(params.annualPrice, params.currency, locale)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>VAT ({params.vatRatePct}%)</Text>
          <Text style={styles.tableValue}>{formatCurrency(vatAmount, params.currency, locale)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Total (incl. VAT)</Text>
          <Text style={styles.tableValue}>{formatCurrency(totalWithVat, params.currency, locale)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Billing Interval</Text>
          <Text style={styles.tableValue}>{intervalLabel[params.billingInterval] || params.billingInterval}</Text>
        </View>

        {/* Duration */}
        <Text style={styles.sectionTitle}>4. Contract Duration</Text>
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Start Date</Text>
          <Text style={styles.tableValue}>{formatDate(params.contractStartDate, locale)}</Text>
        </View>
        <View style={styles.tableRow}>
          <Text style={styles.tableLabel}>Duration</Text>
          <Text style={styles.tableValue}>{params.contractDurationMonths} months</Text>
        </View>
        <Text style={styles.paragraph}>
          This agreement automatically renews for successive periods of equal duration unless either party provides
          written notice of termination at least 30 days before the end of the current period.
        </Text>

        {/* Standard Clauses */}
        <Text style={styles.sectionTitle}>5. General Terms</Text>
        <Text style={styles.paragraph}>
          5.1 Data Processing: The Service Provider processes personal data in accordance with GDPR and applicable
          Swedish data protection legislation.
        </Text>
        <Text style={styles.paragraph}>
          5.2 Termination: Either party may terminate this agreement with 30 days written notice. In case of material
          breach, termination is effective immediately upon written notice.
        </Text>
        <Text style={styles.paragraph}>
          5.3 Governing Law: This agreement is governed by Swedish law. Disputes shall be resolved by the Swedish
          courts.
        </Text>

        {/* Custom Terms */}
        {params.customTerms && Object.keys(params.customTerms).length > 0 && (
          <>
            <Text style={styles.sectionTitle}>6. Additional Terms</Text>
            {Object.entries(params.customTerms).map(([key, value]) => (
              <Text key={key} style={styles.paragraph}>
                {String(value)}
              </Text>
            ))}
          </>
        )}

        {/* Signatures */}
        <View style={styles.signatureSection}>
          {/* Provider signature (always filled) */}
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLabel}>Service Provider</Text>
            <Text style={styles.signatureName}>Amida</Text>
            <Text style={styles.signatureDetail}>Authorized Representative</Text>
            <Text style={styles.signatureDetail}>Date: {formatDate(params.contractStartDate, locale)}</Text>
          </View>

          {/* Subscriber signature */}
          <View style={styles.signatureBox}>
            <Text style={styles.signatureLabel}>Subscriber</Text>
            {params.signed && params.signatureImageBase64 ? (
              <>
                {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf/renderer Image does not support alt */}
                <Image
                  style={styles.signatureImage}
                  src={
                    params.signatureImageBase64.startsWith('data:')
                      ? params.signatureImageBase64
                      : `data:image/png;base64,${params.signatureImageBase64}`
                  }
                />
                <Text style={styles.signatureName}>{params.signerName}</Text>
                {params.signerTitle && <Text style={styles.signatureDetail}>{params.signerTitle}</Text>}
                <Text style={styles.signatureDetail}>
                  Date: {params.signedAt ? formatDate(params.signedAt, locale) : ''}
                </Text>
                <Text style={styles.signatureDetail}>IP: {params.signerIp || ''}</Text>
              </>
            ) : (
              <>
                <View style={styles.signatureLine} />
                <Text style={styles.signatureDetail}>Name: ___________________________</Text>
                <Text style={styles.signatureDetail}>Title: ___________________________</Text>
                <Text style={styles.signatureDetail}>Date: ___________________________</Text>
              </>
            )}
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>{params.contractNumber}</Text>
          <Text style={styles.footerText}>
            {params.signed ? 'Digitally signed — Simple Electronic Signature (SES) per eIDAS' : 'UNSIGNED DRAFT'}
          </Text>
          {params.documentHash && (
            <Text style={styles.footerText}>SHA-256: {params.documentHash.substring(0, 16)}...</Text>
          )}
        </View>
      </Page>
    </Document>
  )
}

export async function generateContractPdf(params: ContractPdfParams): Promise<Buffer> {
  return renderToBuffer(<ContractDocument {...params} />)
}
