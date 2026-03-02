/**
 * Pure subscription/tier utility functions — no DB or React dependencies.
 * Used by both the API route and unit tests.
 */

export const TIER_DEFAULTS = {
  free: {
    invoiceLimit: 5,
    receiptScanLimit: 3,
    emailSendLimit: 2,
    storageMb: 50,
    priceMonthly: 0,
    priceYearly: 0,
    features: ['unlimitedGigs', 'basicInvoicing', 'calendarView'],
  },
  pro: {
    invoiceLimit: 0,
    receiptScanLimit: 0,
    emailSendLimit: 0,
    storageMb: 1024,
    priceMonthly: 5,
    priceYearly: 50,
    features: ['unlimitedInvoices', 'unlimitedScans', 'noBranding'],
  },
  team: {
    invoiceLimit: 0,
    receiptScanLimit: 0,
    emailSendLimit: 0,
    storageMb: 5120,
    priceMonthly: 10,
    priceYearly: 100,
    features: ['everythingInPro', 'inviteMembers', 'sharedCalendar'],
  },
} as const

export type Plan = 'free' | 'pro' | 'team'

export type TierData = {
  invoiceLimit: number
  receiptScanLimit: number
  emailSendLimit: number
  storageMb: number
  priceMonthly: number
  priceYearly: number
  features: string[]
}

export function parseJsonArray(value: string | undefined, fallback: readonly string[]): string[] {
  if (!value) return [...fallback]
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : [...fallback]
  } catch {
    return [...fallback]
  }
}

export function buildTier(
  prefix: string,
  config: Record<string, string>,
  defaults: (typeof TIER_DEFAULTS)[Plan],
): TierData {
  return {
    invoiceLimit: parseInt(config[`${prefix}_invoice_limit`] ?? String(defaults.invoiceLimit)),
    receiptScanLimit: parseInt(config[`${prefix}_receipt_scan_limit`] ?? String(defaults.receiptScanLimit)),
    emailSendLimit: parseInt(config[`${prefix}_email_send_limit`] ?? String(defaults.emailSendLimit)),
    storageMb: parseInt(config[`${prefix}_storage_mb`] ?? String(defaults.storageMb)),
    priceMonthly: parseInt(config[`${prefix}_price_monthly`] ?? String(defaults.priceMonthly)),
    priceYearly: parseInt(config[`${prefix}_price_yearly`] ?? String(defaults.priceYearly)),
    features: parseJsonArray(config[`${prefix}_features`], defaults.features),
  }
}

export function buildAllTiers(config: Record<string, string>) {
  return {
    free: buildTier('free', config, TIER_DEFAULTS.free),
    pro: buildTier('pro', config, TIER_DEFAULTS.pro),
    team: buildTier('team', config, TIER_DEFAULTS.team),
  }
}

export function isPro(plan: string | undefined, status: string | undefined): boolean {
  return (plan === 'pro' || plan === 'team') && status === 'active'
}

export function isTeam(plan: string | undefined, status: string | undefined): boolean {
  return plan === 'team' && status === 'active'
}

export function resolvePlan(plan: string | undefined, status: string | undefined): Plan {
  if (isTeam(plan, status)) return 'team'
  if (isPro(plan, status)) return 'pro'
  return 'free'
}

export function canCreateInvoice(tier: TierData, invoiceCount: number): boolean {
  const limit = tier.invoiceLimit === 0 ? Infinity : tier.invoiceLimit
  return invoiceCount < limit
}

export function canScanReceipt(tier: TierData, scanCount: number): boolean {
  const limit = tier.receiptScanLimit === 0 ? Infinity : tier.receiptScanLimit
  return scanCount < limit
}

export function canSendEmail(tier: TierData, emailSendCount: number): boolean {
  const limit = tier.emailSendLimit === 0 ? Infinity : tier.emailSendLimit
  return emailSendCount < limit
}
