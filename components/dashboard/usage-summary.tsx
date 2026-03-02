'use client'

import { useTranslations } from 'next-intl'
import { useSubscription } from '@/lib/hooks/use-subscription'
import Link from 'next/link'
import { Crown } from 'lucide-react'

function UsageBar({ label, current, limit, unit }: { label: string; current: number; limit: number; unit?: string }) {
  const ratio = limit > 0 ? Math.min(current / limit, 1) : 0
  const color = ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.6 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[11px] text-muted-foreground truncate">{label}</span>
        <span className="text-[11px] font-medium tabular-nums ml-2 shrink-0">
          {unit ? `${current} ${unit}` : current}/{unit ? `${limit} ${unit}` : limit}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  )
}

export function UsageSummary() {
  const { plan, usage, limits, storageQuota, loading } = useSubscription()
  const t = useTranslations('subscription')

  if (loading || plan !== 'free') return null

  const storageMb = storageQuota ? Math.round(storageQuota.usedBytes / (1024 * 1024)) : 0
  const storageLimitMb = storageQuota ? Math.round(storageQuota.limitBytes / (1024 * 1024)) : 50

  return (
    <Link
      href="/settings?tab=subscription"
      className="block rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 transition-colors hover:bg-amber-500/10"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <Crown className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <span className="text-xs font-medium text-amber-900 dark:text-amber-200">{t('usageSummaryTitle')}</span>
      </div>
      <div className="flex gap-4">
        <UsageBar
          label={t('invoicesUsage')}
          current={usage?.invoice_count || 0}
          limit={limits.invoices === Infinity ? 0 : limits.invoices}
        />
        <UsageBar
          label={t('receiptScans')}
          current={usage?.receipt_scan_count || 0}
          limit={limits.receiptScans === Infinity ? 0 : limits.receiptScans}
        />
        <UsageBar
          label={t('emailSends')}
          current={usage?.email_send_count || 0}
          limit={limits.emailSends === Infinity ? 0 : limits.emailSends}
        />
        <UsageBar label={t('storage')} current={storageMb} limit={storageLimitMb} unit="MB" />
      </div>
    </Link>
  )
}
