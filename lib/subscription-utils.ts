/**
 * Pure subscription/tier utility functions — no DB or React dependencies.
 * All tier values come from platform_config (single source of truth).
 */

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

export function buildTier(prefix: string, config: Record<string, string>): TierData {
  return {
    invoiceLimit: parseInt(config[`${prefix}_invoice_limit`] || '0'),
    receiptScanLimit: parseInt(config[`${prefix}_receipt_scan_limit`] || '0'),
    emailSendLimit: parseInt(config[`${prefix}_email_send_limit`] || '0'),
    storageMb: parseInt(config[`${prefix}_storage_mb`] || '0'),
    priceMonthly: parseFloat(config[`${prefix}_price_monthly`] || '0'),
    priceYearly: parseFloat(config[`${prefix}_price_yearly`] || '0'),
    features: parseJsonArray(config[`${prefix}_features`], []),
  }
}

export function buildAllTiers(config: Record<string, string>) {
  return {
    free: buildTier('free', config),
    pro: buildTier('pro', config),
    team: buildTier('team', config),
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
