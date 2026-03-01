'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Subscription = {
  id: string
  plan: 'free' | 'pro' | 'team'
  status: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
  pending_plan: string | null
  admin_override: boolean | null
}

type Usage = {
  invoice_count: number
  receipt_scan_count: number
}

type StorageQuota = {
  usedBytes: number
  limitBytes: number
  plan: string
}

type TierData = {
  invoiceLimit: number
  receiptScanLimit: number
  storageMb: number
  priceMonthly: number
  priceYearly: number
  features: string[]
}

export type TierConfig = {
  free: TierData
  pro: TierData
  team: TierData
}

const DEFAULT_TIER_CONFIG: TierConfig = {
  free: {
    invoiceLimit: 5,
    receiptScanLimit: 3,
    storageMb: 10,
    priceMonthly: 0,
    priceYearly: 0,
    features: ['unlimitedGigs', 'basicInvoicing', 'calendarView'],
  },
  pro: {
    invoiceLimit: 0,
    receiptScanLimit: 0,
    storageMb: 1024,
    priceMonthly: 5,
    priceYearly: 50,
    features: ['unlimitedInvoices', 'unlimitedScans', 'noBranding'],
  },
  team: {
    invoiceLimit: 0,
    receiptScanLimit: 0,
    storageMb: 5120,
    priceMonthly: 10,
    priceYearly: 100,
    features: ['everythingInPro', 'inviteMembers', 'sharedCalendar'],
  },
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [tierConfig, setTierConfig] = useState<TierConfig>(DEFAULT_TIER_CONFIG)
  const [storageQuota, setStorageQuota] = useState<StorageQuota | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const [refreshKey, setRefreshKey] = useState(0)
  const lastSyncRef = useRef(0)

  useEffect(() => {
    let cancelled = false

    async function loadTierConfig() {
      try {
        const res = await fetch('/api/config/tiers')
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setTierConfig(data)
        }
      } catch {
        // Use defaults on failure
      }
    }

    async function loadStorageQuota() {
      try {
        const res = await fetch('/api/storage/quota')
        if (res.ok) {
          const data = await res.json()
          if (!cancelled) setStorageQuota(data)
        }
      } catch {
        // Ignore - storage quota is non-critical
      }
    }

    async function loadSubscription() {
      const { data: sub } = await supabase.from('subscriptions').select('*').limit(1).single()
      if (cancelled) return

      setSubscription(sub)

      const now = new Date()
      const { data: usageData } = await supabase
        .from('usage_tracking')
        .select('invoice_count, receipt_scan_count')
        .eq('year', now.getFullYear())
        .eq('month', now.getMonth() + 1)
        .limit(1)
        .single()

      if (!cancelled) {
        setUsage(usageData || { invoice_count: 0, receipt_scan_count: 0 })
        setLoading(false)
      }
    }

    loadSubscription()
    loadTierConfig()
    loadStorageQuota()

    return () => {
      cancelled = true
    }
  }, [supabase, refreshKey])

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const syncWithStripe = useCallback(async () => {
    const now = Date.now()
    // Debounce: skip if last sync was less than 10 seconds ago
    if (now - lastSyncRef.current < 10_000) return
    lastSyncRef.current = now

    try {
      await fetch('/api/stripe/sync', { method: 'POST' })
      refresh()
    } catch {
      // Ignore sync errors
    }
  }, [refresh])

  const isPro = (subscription?.plan === 'pro' || subscription?.plan === 'team') && subscription?.status === 'active'
  const isTeam = subscription?.plan === 'team' && subscription?.status === 'active'

  const plan = isTeam ? 'team' : isPro ? 'pro' : 'free'
  const tier = tierConfig[plan]

  const limits = {
    invoices: tier.invoiceLimit === 0 ? Infinity : tier.invoiceLimit,
    receiptScans: tier.receiptScanLimit === 0 ? Infinity : tier.receiptScanLimit,
  }

  const canCreateInvoice = limits.invoices === Infinity || (usage?.invoice_count || 0) < limits.invoices
  const canScanReceipt = limits.receiptScans === Infinity || (usage?.receipt_scan_count || 0) < limits.receiptScans

  return {
    subscription,
    usage,
    loading,
    isPro,
    isTeam,
    limits,
    canCreateInvoice,
    canScanReceipt,
    storageQuota,
    tierConfig,
    refresh,
    syncWithStripe,
  }
}
