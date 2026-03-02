import { describe, it, expect } from 'vitest'
import {
  TIER_DEFAULTS,
  buildTier,
  buildAllTiers,
  isPro,
  isTeam,
  resolvePlan,
  canCreateInvoice,
  canScanReceipt,
} from '@/lib/subscription-utils'

describe('Tier defaults', () => {
  it('free tier has correct limits', () => {
    expect(TIER_DEFAULTS.free.invoiceLimit).toBe(5)
    expect(TIER_DEFAULTS.free.receiptScanLimit).toBe(3)
    expect(TIER_DEFAULTS.free.storageMb).toBe(50)
    expect(TIER_DEFAULTS.free.priceMonthly).toBe(0)
  })

  it('pro tier has unlimited invoices and scans (0)', () => {
    expect(TIER_DEFAULTS.pro.invoiceLimit).toBe(0)
    expect(TIER_DEFAULTS.pro.receiptScanLimit).toBe(0)
    expect(TIER_DEFAULTS.pro.storageMb).toBe(1024)
  })

  it('team tier has same limits as pro plus team features', () => {
    expect(TIER_DEFAULTS.team.invoiceLimit).toBe(0)
    expect(TIER_DEFAULTS.team.receiptScanLimit).toBe(0)
    expect(TIER_DEFAULTS.team.storageMb).toBe(5120)
    expect(TIER_DEFAULTS.team.features).toContain('inviteMembers')
    expect(TIER_DEFAULTS.team.features).toContain('sharedCalendar')
  })
})

describe('buildTier', () => {
  it('returns defaults when config is empty', () => {
    const tier = buildTier('free', {}, TIER_DEFAULTS.free)
    expect(tier.invoiceLimit).toBe(5)
    expect(tier.receiptScanLimit).toBe(3)
    expect(tier.features).toEqual(['unlimitedGigs', 'basicInvoicing', 'calendarView'])
  })

  it('overrides with platform_config values', () => {
    const config = { free_invoice_limit: '10', free_receipt_scan_limit: '5' }
    const tier = buildTier('free', config, TIER_DEFAULTS.free)
    expect(tier.invoiceLimit).toBe(10)
    expect(tier.receiptScanLimit).toBe(5)
    expect(tier.storageMb).toBe(50) // unchanged default
  })

  it('overrides features with valid JSON array', () => {
    const config = { pro_features: '["custom1","custom2"]' }
    const tier = buildTier('pro', config, TIER_DEFAULTS.pro)
    expect(tier.features).toEqual(['custom1', 'custom2'])
  })

  it('falls back to default features on invalid JSON', () => {
    const config = { pro_features: 'not-json' }
    const tier = buildTier('pro', config, TIER_DEFAULTS.pro)
    expect(tier.features).toEqual(['unlimitedInvoices', 'unlimitedScans', 'noBranding'])
  })
})

describe('buildAllTiers', () => {
  it('returns all three tiers with defaults', () => {
    const tiers = buildAllTiers({})
    expect(tiers.free.invoiceLimit).toBe(5)
    expect(tiers.pro.invoiceLimit).toBe(0)
    expect(tiers.team.invoiceLimit).toBe(0)
  })
})

describe('isPro / isTeam / resolvePlan', () => {
  it('isPro returns true for pro+active', () => {
    expect(isPro('pro', 'active')).toBe(true)
  })

  it('isPro returns true for team+active', () => {
    expect(isPro('team', 'active')).toBe(true)
  })

  it('isPro returns false for free', () => {
    expect(isPro('free', 'active')).toBe(false)
  })

  it('isPro returns false for pro+cancelled', () => {
    expect(isPro('pro', 'cancelled')).toBe(false)
  })

  it('isTeam returns true only for team+active', () => {
    expect(isTeam('team', 'active')).toBe(true)
    expect(isTeam('pro', 'active')).toBe(false)
    expect(isTeam('team', 'cancelled')).toBe(false)
  })

  it('resolvePlan returns correct plan', () => {
    expect(resolvePlan('team', 'active')).toBe('team')
    expect(resolvePlan('pro', 'active')).toBe('pro')
    expect(resolvePlan('free', 'active')).toBe('free')
    expect(resolvePlan('pro', 'cancelled')).toBe('free')
    expect(resolvePlan(undefined, undefined)).toBe('free')
  })
})

describe('canCreateInvoice / canScanReceipt', () => {
  const freeTier = buildTier('free', {}, TIER_DEFAULTS.free)
  const proTier = buildTier('pro', {}, TIER_DEFAULTS.pro)

  it('free tier blocks invoice after limit', () => {
    expect(canCreateInvoice(freeTier, 0)).toBe(true)
    expect(canCreateInvoice(freeTier, 4)).toBe(true)
    expect(canCreateInvoice(freeTier, 5)).toBe(false)
    expect(canCreateInvoice(freeTier, 10)).toBe(false)
  })

  it('pro tier allows unlimited invoices', () => {
    expect(canCreateInvoice(proTier, 0)).toBe(true)
    expect(canCreateInvoice(proTier, 100)).toBe(true)
    expect(canCreateInvoice(proTier, 99999)).toBe(true)
  })

  it('free tier blocks scan after limit', () => {
    expect(canScanReceipt(freeTier, 0)).toBe(true)
    expect(canScanReceipt(freeTier, 2)).toBe(true)
    expect(canScanReceipt(freeTier, 3)).toBe(false)
  })

  it('pro tier allows unlimited scans', () => {
    expect(canScanReceipt(proTier, 0)).toBe(true)
    expect(canScanReceipt(proTier, 1000)).toBe(true)
  })
})
