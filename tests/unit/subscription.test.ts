import { describe, it, expect } from 'vitest'
import {
  buildTier,
  buildAllTiers,
  isPro,
  isTeam,
  resolvePlan,
  canCreateInvoice,
  canScanReceipt,
} from '@/lib/subscription-utils'

describe('buildTier', () => {
  it('returns zeros when config is empty', () => {
    const tier = buildTier('free', {})
    expect(tier.invoiceLimit).toBe(0)
    expect(tier.receiptScanLimit).toBe(0)
    expect(tier.storageMb).toBe(0)
    expect(tier.features).toEqual([])
  })

  it('parses config values correctly', () => {
    const config = {
      free_invoice_limit: '5',
      free_receipt_scan_limit: '3',
      free_storage_mb: '50',
      free_price_monthly: '0',
      free_price_yearly: '0',
      free_features: '["unlimitedGigs","basicInvoicing","calendarView"]',
    }
    const tier = buildTier('free', config)
    expect(tier.invoiceLimit).toBe(5)
    expect(tier.receiptScanLimit).toBe(3)
    expect(tier.storageMb).toBe(50)
    expect(tier.priceMonthly).toBe(0)
    expect(tier.features).toEqual(['unlimitedGigs', 'basicInvoicing', 'calendarView'])
  })

  it('overrides specific fields while others stay at zero', () => {
    const config = { free_invoice_limit: '10', free_receipt_scan_limit: '5' }
    const tier = buildTier('free', config)
    expect(tier.invoiceLimit).toBe(10)
    expect(tier.receiptScanLimit).toBe(5)
    expect(tier.storageMb).toBe(0) // not in config
  })

  it('parses features from valid JSON array', () => {
    const config = { pro_features: '["custom1","custom2"]' }
    const tier = buildTier('pro', config)
    expect(tier.features).toEqual(['custom1', 'custom2'])
  })

  it('falls back to empty features on invalid JSON', () => {
    const config = { pro_features: 'not-json' }
    const tier = buildTier('pro', config)
    expect(tier.features).toEqual([])
  })
})

describe('buildAllTiers', () => {
  it('returns all three tiers from config', () => {
    const config = {
      free_invoice_limit: '5',
      pro_invoice_limit: '0',
      team_invoice_limit: '0',
    }
    const tiers = buildAllTiers(config)
    expect(tiers.free.invoiceLimit).toBe(5)
    expect(tiers.pro.invoiceLimit).toBe(0)
    expect(tiers.team.invoiceLimit).toBe(0)
  })

  it('returns object with exactly three keys', () => {
    const tiers = buildAllTiers({})
    expect(Object.keys(tiers)).toEqual(['free', 'pro', 'team'])
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
  const freeTier = buildTier('free', {
    free_invoice_limit: '5',
    free_receipt_scan_limit: '3',
  })
  const proTier = buildTier('pro', {
    pro_invoice_limit: '0',
    pro_receipt_scan_limit: '0',
  })

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
