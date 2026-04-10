'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSubscription } from '@/lib/hooks/use-subscription'
import { useCompany } from '@/lib/hooks/use-company'
import { isNative } from '@/lib/capacitor'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertTriangle,
  ArrowDown,
  Check,
  Crown,
  ExternalLink,
  HardDrive,
  Info,
  Loader2,
  RefreshCw,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import Link from 'next/link'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'

export function SubscriptionSettings() {
  const t = useTranslations('subscription')
  const tc = useTranslations('common')
  const tToast = useTranslations('toast')
  const formatLocale = useFormatLocale()

  const { subscription, usage, isPro, isTeam, limits, loading, refresh, syncWithStripe, storageQuota, tierConfig } =
    useSubscription()
  const { isOwner } = useCompany()
  const isAppleSubscriber = subscription?.payment_provider === 'apple'
  const [upgrading, setUpgrading] = useState(false)
  const [changingPlan, setChangingPlan] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [reactivating, setReactivating] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [showDowngradeConfirm, setShowDowngradeConfirm] = useState<string | null>(null)
  const searchParams = useSearchParams()

  // Sync subscription from Stripe after successful checkout
  useEffect(() => {
    if (searchParams.get('upgrade') === 'success') {
      syncWithStripe()
    }
  }, [searchParams, syncWithStripe])

  async function handleUpgrade(priceId: string, plan: 'pro' | 'team' = 'pro') {
    setUpgrading(true)
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, plan }),
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || tToast('checkoutError'))
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : tToast('checkoutError'))
      setUpgrading(false)
    }
  }

  async function handleChangePlan(plan: 'pro' | 'team', interval: 'monthly' | 'yearly') {
    setChangingPlan(true)
    try {
      const res = await fetch('/api/stripe/change-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, interval }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      if (data.scheduled) {
        toast.success(t('downgradeScheduled'))
      } else {
        toast.success(t('changePlanSuccess'))
      }
      refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('changePlanError'))
    } finally {
      setChangingPlan(false)
      setShowDowngradeConfirm(null)
    }
  }

  async function handleCancelDowngrade() {
    setChangingPlan(true)
    try {
      const res = await fetch('/api/stripe/cancel-downgrade', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('downgradeCancelled'))
      refresh()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('changePlanError'))
    } finally {
      setChangingPlan(false)
    }
  }

  async function handleReactivate() {
    setReactivating(true)
    try {
      const res = await fetch('/api/stripe/reactivate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('reactivateSuccess'))
      refresh()
    } catch {
      toast.error(t('reactivateError'))
    } finally {
      setReactivating(false)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    try {
      const res = await fetch('/api/stripe/cancel', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(t('cancelSuccess'))
      refresh()
    } catch {
      toast.error(t('cancelError'))
    } finally {
      setCancelling(false)
      setShowCancelConfirm(false)
    }
  }

  /**
   * Apple In-App Purchase handler for native iOS app.
   * Uses @capgo/native-purchases (thin StoreKit 2 wrapper).
   */
  async function handleAppleIAP(productId: string) {
    setUpgrading(true)
    try {
      const { NativePurchases } = await import('@capgo/native-purchases')

      const { transactionId } = await NativePurchases.purchaseProduct({
        productIdentifier: productId,
      })

      // Validate with our server
      const res = await fetch('/api/iap/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId, productId }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Validation failed')

      toast.success(t('upgradeSuccess'))
      refresh()
    } catch (err: unknown) {
      // User cancelled purchase — not an error
      if (err && typeof err === 'object' && 'message' in err && /cancel/i.test(String((err as Error).message))) {
        setUpgrading(false)
        return
      }
      toast.error(err instanceof Error ? err.message : tToast('checkoutError'))
    } finally {
      setUpgrading(false)
    }
  }

  async function handleRestorePurchases() {
    setRestoring(true)
    try {
      const { NativePurchases } = await import('@capgo/native-purchases')
      await NativePurchases.restorePurchases()
      toast.success(t('restoreSuccess'))
      refresh()
    } catch {
      toast.error(t('restoreError'))
    } finally {
      setRestoring(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{t('yourPlan')}</CardTitle>
            <Badge variant={isPro ? 'default' : 'secondary'} className="text-xs">
              {isTeam ? (
                <>
                  <Users className="h-3 w-3 mr-1" />
                  {t('team')}
                </>
              ) : isPro ? (
                <>
                  <Crown className="h-3 w-3 mr-1" />
                  {t('pro')}
                </>
              ) : (
                t('free')
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {isPro ? (
            <div>
              <p className="text-sm text-muted-foreground mb-2">{isTeam ? t('teamAccess') : t('unlimitedAccess')}</p>
              {subscription?.current_period_end && (
                <p className="text-xs text-muted-foreground">
                  {t('renewsAt', { date: new Date(subscription.current_period_end).toLocaleDateString(formatLocale) })}
                </p>
              )}
              {storageQuota && (
                <div className="mt-3 space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <HardDrive className="h-3 w-3" />
                      {t('storage')}
                    </span>
                    <span>
                      {t('storageUsed', {
                        used: formatBytes(storageQuota.usedBytes),
                        limit: formatBytes(storageQuota.limitBytes),
                      })}
                    </span>
                  </div>
                  <div className="w-full bg-secondary rounded-full h-1.5">
                    <div
                      className={`rounded-full h-1.5 transition-all ${storageQuota.usedBytes >= storageQuota.limitBytes ? 'bg-red-500' : 'bg-primary'}`}
                      style={{ width: `${Math.min((storageQuota.usedBytes / storageQuota.limitBytes) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
              {subscription?.cancel_at_period_end && (
                <div className="mt-2">
                  <p className="text-xs text-amber-600 dark:text-amber-400">{t('cancelledActiveUntil')}</p>
                  {isAppleSubscriber ? (
                    <Button
                      onClick={() => window.open('https://apps.apple.com/account/subscriptions', '_blank')}
                      size="sm"
                      className="mt-2"
                    >
                      <ExternalLink className="h-3 w-3 mr-2" />
                      {t('manageInAppStore')}
                    </Button>
                  ) : (
                    <Button onClick={handleReactivate} size="sm" className="mt-2" disabled={reactivating}>
                      {reactivating ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                      {t('reactivate')}
                    </Button>
                  )}
                </div>
              )}
              {!subscription?.cancel_at_period_end && (
                <div className="mt-4 pt-4 border-t">
                  {isAppleSubscriber ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => window.open('https://apps.apple.com/account/subscriptions', '_blank')}
                    >
                      <ExternalLink className="h-3 w-3 mr-2" />
                      {t('manageInAppStore')}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={cancelling}
                    >
                      {cancelling ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                      {t('cancelSubscription')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-3">{t('usageThisMonth')}</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t('invoicesUsage')}</span>
                  <span className={usage && usage.invoice_count >= limits.invoices ? 'text-red-500 font-medium' : ''}>
                    {usage?.invoice_count || 0} / {limits.invoices}
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className="bg-primary rounded-full h-1.5 transition-all"
                    style={{ width: `${Math.min(((usage?.invoice_count || 0) / limits.invoices) * 100, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-sm mt-3">
                  <span>{t('receiptScans')}</span>
                  <span
                    className={
                      usage && usage.receipt_scan_count >= limits.receiptScans ? 'text-red-500 font-medium' : ''
                    }
                  >
                    {usage?.receipt_scan_count || 0} / {limits.receiptScans}
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-1.5">
                  <div
                    className="bg-primary rounded-full h-1.5 transition-all"
                    style={{
                      width: `${Math.min(((usage?.receipt_scan_count || 0) / limits.receiptScans) * 100, 100)}%`,
                    }}
                  />
                </div>
                {storageQuota && (
                  <>
                    <div className="flex justify-between text-sm mt-3">
                      <span className="flex items-center gap-1.5">
                        <HardDrive className="h-3.5 w-3.5" />
                        {t('storage')}
                      </span>
                      <span
                        className={storageQuota.usedBytes >= storageQuota.limitBytes ? 'text-red-500 font-medium' : ''}
                      >
                        {t('storageUsed', {
                          used: formatBytes(storageQuota.usedBytes),
                          limit: formatBytes(storageQuota.limitBytes),
                        })}
                      </span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-1.5">
                      <div
                        className={`rounded-full h-1.5 transition-all ${storageQuota.usedBytes >= storageQuota.limitBytes ? 'bg-red-500' : 'bg-primary'}`}
                        style={{ width: `${Math.min((storageQuota.usedBytes / storageQuota.limitBytes) * 100, 100)}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment status warnings */}
      {subscription?.status === 'past_due' && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">{t('pastDueWarning')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {subscription?.status === 'canceled' && (
        <Card className="border-muted">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">{t('canceledInfo')}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upgrade options */}
      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title={t('cancelConfirmTitle')}
        description={t('cancelConfirmDesc')}
        confirmLabel={t('cancelSubscription')}
        cancelLabel={tc('cancel')}
        variant="destructive"
        onConfirm={handleCancel}
      />

      {/* Pro upgrade cards (shown when not Pro) */}
      {!isPro && (isNative() || process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID) && (
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{t('proMonthly')}</CardTitle>
              <CardDescription>
                <span className="text-2xl font-bold text-foreground">${tierConfig?.pro.priceMonthly ?? 0}</span>
                <span className="text-muted-foreground"> {t('perMonth')}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 mb-4">
                {(tierConfig?.pro.features ?? []).map((key) => (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    {t(key)}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() =>
                  isNative()
                    ? handleAppleIAP('amida_pro_monthly')
                    : handleUpgrade(process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID || '', 'pro')
                }
                disabled={upgrading}
                className="w-full"
                variant="outline"
              >
                {upgrading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t('upgrade')}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-primary">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{t('proYearly')}</CardTitle>
                <Badge className="text-[10px]">{t('save15')}</Badge>
              </div>
              <CardDescription>
                <span className="text-2xl font-bold text-foreground">${tierConfig?.pro.priceYearly ?? 0}</span>
                <span className="text-muted-foreground"> {t('perYear')}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 mb-4">
                {(tierConfig?.pro.features ?? []).map((key) => (
                  <li key={key} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                    {t(key)}
                  </li>
                ))}
              </ul>
              <Button
                onClick={() =>
                  isNative()
                    ? handleAppleIAP('amida_pro_yearly')
                    : handleUpgrade(process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID || '', 'pro')
                }
                disabled={upgrading}
                className="w-full"
              >
                {upgrading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                {t('upgrade')}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Team upgrade cards (shown to owners who are not on Team plan) */}
      {isOwner && !isTeam && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">{t('teamPlanTitle')}</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  {t('teamMonthly')}
                </CardTitle>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">${tierConfig?.team.priceMonthly ?? 0}</span>
                  <span className="text-muted-foreground"> {t('perMonth')}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-4">
                  {(tierConfig?.team.features ?? []).map((key) => (
                    <li key={key} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      {t(key)}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() =>
                    isNative()
                      ? handleAppleIAP('amida_team_monthly')
                      : subscription?.stripe_subscription_id
                        ? handleChangePlan('team', 'monthly')
                        : handleUpgrade(process.env.NEXT_PUBLIC_STRIPE_TEAM_MONTHLY_PRICE_ID || '', 'team')
                  }
                  disabled={upgrading || changingPlan}
                  className="w-full"
                  variant="outline"
                >
                  {upgrading || changingPlan ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isPro ? t('upgradeToTeam') : t('upgrade')}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-primary">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {t('teamYearly')}
                  </CardTitle>
                  <Badge className="text-[10px]">{t('save15')}</Badge>
                </div>
                <CardDescription>
                  <span className="text-2xl font-bold text-foreground">${tierConfig?.team.priceYearly ?? 0}</span>
                  <span className="text-muted-foreground"> {t('perYear')}</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 mb-4">
                  {(tierConfig?.team.features ?? []).map((key) => (
                    <li key={key} className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                      {t(key)}
                    </li>
                  ))}
                </ul>
                <Button
                  onClick={() =>
                    isNative()
                      ? handleAppleIAP('amida_team_yearly')
                      : subscription?.stripe_subscription_id
                        ? handleChangePlan('team', 'yearly')
                        : handleUpgrade(process.env.NEXT_PUBLIC_STRIPE_TEAM_YEARLY_PRICE_ID || '', 'team')
                  }
                  disabled={upgrading || changingPlan}
                  className="w-full"
                >
                  {upgrading || changingPlan ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {isPro ? t('upgradeToTeam') : t('upgrade')}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Restore Purchases + Terms (native app only) */}
      {isNative() && (
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleRestorePurchases}
            disabled={restoring}
          >
            {restoring ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <RefreshCw className="h-3 w-3 mr-2" />}
            Restore Purchases
          </Button>
          <div className="flex gap-3 text-xs text-muted-foreground">
            <Link href="/terms" className="underline hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy
            </Link>
          </div>
        </div>
      )}

      {/* Downgrade to Pro (shown to Team users, Stripe only — Apple manages downgrades in iOS Settings) */}
      {isTeam && !subscription?.pending_plan && !isAppleSubscriber && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ArrowDown className="h-4 w-4" />
              {t('downgradeToPro')}
            </CardTitle>
            <CardDescription>{t('downgradeToProDesc')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDowngradeConfirm('monthly')}
                disabled={changingPlan}
              >
                {changingPlan ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                Pro {t('perMonth')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDowngradeConfirm('yearly')}
                disabled={changingPlan}
              >
                {changingPlan ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                Pro {t('perYear')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending downgrade notice */}
      {subscription?.pending_plan && (
        <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800 dark:text-amber-300">{t('pendingDowngradeNotice')}</p>
              </div>
              <Button variant="outline" size="sm" onClick={handleCancelDowngrade} disabled={changingPlan}>
                {changingPlan ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : null}
                {tc('cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDialog
        open={!!showDowngradeConfirm}
        onOpenChange={(open) => {
          if (!open) setShowDowngradeConfirm(null)
        }}
        title={t('downgradeConfirmTitle')}
        description={t('downgradeConfirmDesc')}
        confirmLabel={t('downgrade')}
        onConfirm={() => {
          if (showDowngradeConfirm) handleChangePlan('pro', showDowngradeConfirm as 'monthly' | 'yearly')
        }}
      />
    </div>
  )
}
