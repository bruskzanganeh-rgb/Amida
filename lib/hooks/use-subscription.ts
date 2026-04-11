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
  payment_provider: string | null
}

type Usage = {
  invoice_count: number
  receipt_scan_count: number
  email_send_count: number
}

type StorageQuota = {
  usedBytes: number
  limitBytes: number
  plan: string
}

type TierData = {
  invoiceLimit: number
  receiptScanLimit: number
  emailSendLimit: number
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

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [tierConfig, setTierConfig] = useState<TierConfig | null>(null)
  const [storageQuota, setStorageQuota] = useState<StorageQuota | null>(null)
  const [subLoaded, setSubLoaded] = useState(false)
  const [tierLoaded, setTierLoaded] = useState(false)
  const loading = !subLoaded || !tierLoaded
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
          if (!cancelled) {
            setTierConfig(data)
            setTierLoaded(true)
          }
        }
      } catch {
        if (!cancelled) setTierLoaded(true)
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
      try {
        const { data: sub } = await supabase.from('subscriptions').select('*').limit(1).single()
        if (cancelled) return

        setSubscription(sub)

        const now = new Date()
        const { data: usageData } = await supabase
          .from('usage_tracking')
          .select('invoice_count, receipt_scan_count, email_send_count')
          .eq('year', now.getFullYear())
          .eq('month', now.getMonth() + 1)
          .limit(1)
          .single()

        if (!cancelled) {
          setUsage(usageData || { invoice_count: 0, receipt_scan_count: 0, email_send_count: 0 })
          setSubLoaded(true)
        }
      } catch {
        if (!cancelled) {
          setSubscription(null)
          setUsage({ invoice_count: 0, receipt_scan_count: 0, email_send_count: 0 })
          setSubLoaded(true)
        }
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

  // Use zero tier (restrictive) until config loads from platform_config
  const zeroTier: TierData = {
    invoiceLimit: 0,
    receiptScanLimit: 0,
    emailSendLimit: 0,
    storageMb: 0,
    priceMonthly: 0,
    priceYearly: 0,
    features: [],
  }
  const tier = tierConfig ? tierConfig[plan] : zeroTier

  const limits = {
    invoices: tier.invoiceLimit === 0 ? Infinity : tier.invoiceLimit,
    receiptScans: tier.receiptScanLimit === 0 ? Infinity : tier.receiptScanLimit,
    emailSends: tier.emailSendLimit === 0 ? Infinity : tier.emailSendLimit,
  }

  const canCreateInvoice = limits.invoices === Infinity || (usage?.invoice_count || 0) < limits.invoices
  const canScanReceipt = limits.receiptScans === Infinity || (usage?.receipt_scan_count || 0) < limits.receiptScans
  const canSendEmail = limits.emailSends === Infinity || (usage?.email_send_count || 0) < limits.emailSends

  // Check if user has ever had a paid subscription (for trial eligibility)
  const hasHadSubscription = !!(subscription?.stripe_subscription_id || subscription?.status === 'canceled')

  return {
    subscription,
    usage,
    loading,
    isPro,
    isTeam,
    plan,
    limits,
    canCreateInvoice,
    canScanReceipt,
    canSendEmail,
    hasHadSubscription,
    storageQuota,
    tierConfig,
    refresh,
    syncWithStripe,
  }
}
