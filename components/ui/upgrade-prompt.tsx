'use client'

import { useTranslations } from 'next-intl'
import { Crown, Zap } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

type UpgradePromptType = 'invoice' | 'scan' | 'storage'

interface UpgradePromptProps {
  type: UpgradePromptType
  current: number
  limit: number
  showTrial?: boolean
  onManualFallback?: () => void
}

export function UpgradePrompt({ type, current, limit, showTrial, onManualFallback }: UpgradePromptProps) {
  const t = useTranslations('subscription')

  const titles: Record<UpgradePromptType, string> = {
    invoice: t('invoiceLimitTitle', { current, limit }),
    scan: t('scanLimitTitle', { current, limit }),
    storage: t('storageLimitTitle'),
  }

  const descriptions: Record<UpgradePromptType, string> = {
    invoice: t('invoiceLimitDesc'),
    scan: t('scanLimitDesc'),
    storage: t('storageLimitDesc'),
  }

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
          {showTrial ? (
            <Zap className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          ) : (
            <Crown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">{titles[type]}</p>
          <p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-300/80">{descriptions[type]}</p>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Button size="sm" asChild className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white">
              <Link href="/settings?tab=subscription">{showTrial ? t('tryProFree') : t('upgradeToPro')}</Link>
            </Button>
            {onManualFallback && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-amber-800 dark:text-amber-300"
                onClick={onManualFallback}
              >
                {t('enterManually')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
