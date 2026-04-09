'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertTriangle, ArrowUpRight, Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { format, type Locale } from 'date-fns'
import Link from 'next/link'
import { formatCurrency, type SupportedCurrency } from '@/lib/currency/exchange'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'

export type PendingGig = {
  id: string
  date: string
  client: { name: string } | null
  status: string
  fee: number
  response_deadline: string | null
}

export type NeedsActionGig = {
  id: string
  date: string
  start_date: string | null
  end_date: string | null
  total_days: number | null
  fee: number | null
  currency: string | null
  status: string
  project_name: string | null
  client: { name: string } | null
  gig_type: { name: string; color: string | null } | null
}

type Props = {
  pendingGigs: PendingGig[]
  needsActionGigs: NeedsActionGig[]
  dateLocale: Locale
  formatLocale: string
  onStatusChange: (gigId: string, status: string) => void
  getDeadlineInfo: (deadline: string | null) => { label: string; urgent: boolean; isKey: boolean } | null
}

function fmtFee(amount: number, currency?: string | null): string {
  return formatCurrency(amount, (currency || 'SEK') as SupportedCurrency)
}

function formatGigDate(gig: NeedsActionGig, locale: Locale): string {
  if (!gig.total_days || gig.total_days === 1) {
    return format(new Date(gig.date), 'd MMM', { locale })
  }
  const start = format(new Date(gig.start_date!), 'd MMM', { locale })
  const end = format(new Date(gig.end_date!), 'd MMM', { locale })
  return `${start} - ${end}`
}

/**
 * Full card version (kept for backwards compatibility if needed elsewhere).
 */
export function ActionRequiredCard({
  pendingGigs,
  needsActionGigs,
  dateLocale,
  formatLocale,
  onStatusChange,
  getDeadlineInfo,
}: Props) {
  const t = useTranslations('dashboard')
  const tGig = useTranslations('gig')
  const { symbol: baseCurrencySymbol } = useBaseCurrency()

  const totalCount = pendingGigs.length + needsActionGigs.length
  if (totalCount === 0) return null

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
      <CardHeader className="pb-2 pt-4">
        <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
          <AlertTriangle className="h-4 w-4" />
          {t('actionRequired')}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 space-y-4 divide-y divide-amber-200 dark:divide-amber-800 [&>*]:pt-4 [&>*:first-child]:pt-0">
        {pendingGigs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{t('needsResponse')}</span>
              <span className="text-xs text-muted-foreground">{t('pendingCount', { count: pendingGigs.length })}</span>
            </div>
            <div className="space-y-1.5">
              {pendingGigs.map((gig) => {
                const deadlineInfo = getDeadlineInfo(gig.response_deadline)
                return (
                  <div
                    key={gig.id}
                    className={`flex items-center justify-between py-2 px-3 rounded-lg text-xs transition-colors ${
                      deadlineInfo?.urgent ? 'bg-red-500/10' : 'bg-white/60 dark:bg-white/5'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium truncate block">
                        {gig.client?.name || (
                          <span className="text-muted-foreground italic">{tGig('notSpecified')}</span>
                        )}
                      </span>
                      {deadlineInfo && (
                        <span
                          className={`text-[10px] ${deadlineInfo.urgent ? 'text-red-400' : 'text-muted-foreground'}`}
                        >
                          {tGig('response')}: {deadlineInfo.isKey ? t(deadlineInfo.label) : deadlineInfo.label}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-semibold">
                        {gig.fee?.toLocaleString(formatLocale) || '—'} {baseCurrencySymbol}
                      </span>
                      <Link
                        href="/gigs"
                        className="p-1.5 rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 transition-colors"
                      >
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {needsActionGigs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{tGig('needsAction')}</span>
              <span className="text-xs text-muted-foreground">
                {t('pendingCount', { count: needsActionGigs.length })}
              </span>
            </div>
            <div className="space-y-1.5">
              {needsActionGigs.slice(0, 5).map((gig) => (
                <div
                  key={gig.id}
                  className="py-2 px-3 rounded-lg text-xs bg-white/60 dark:bg-white/5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-muted-foreground shrink-0">
                          {formatGigDate(gig, dateLocale)}
                        </span>
                        <span className="font-medium truncate">
                          {gig.client?.name || (
                            <span className="text-muted-foreground italic">{tGig('notSpecified')}</span>
                          )}
                        </span>
                      </div>
                    </div>
                    {gig.fee !== null && (
                      <span className="font-semibold shrink-0">{fmtFee(gig.fee, gig.currency)}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1.5">
                    {gig.gig_type ? (
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: gig.gig_type.color || '#9ca3af' }}
                        />
                        <span className="text-muted-foreground">{gig.gig_type.name}</span>
                      </div>
                    ) : (
                      <div />
                    )}
                    {gig.status === 'accepted' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => onStatusChange(gig.id, 'completed')}
                      >
                        <Check className="h-3 w-3 mr-1" />
                        {tGig('markCompleted')}
                      </Button>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onStatusChange(gig.id, 'accepted')}
                        >
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onStatusChange(gig.id, 'declined')}
                        >
                          <X className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {needsActionGigs.length > 5 && (
                <Link href="/gigs" className="text-xs text-amber-600 hover:underline px-3">
                  {t('viewAll')} ({needsActionGigs.length})
                </Link>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Compact inline version for the new dashboard hero zone.
 * Shows action items as a minimal list with pulsing amber dots.
 */
type InlineProps = {
  pendingCount: number
  needsActionCount: number
}

export function ActionRequiredInline({ pendingCount, needsActionCount }: InlineProps) {
  const t = useTranslations('dashboard')
  const tGig = useTranslations('gig')

  const total = pendingCount + needsActionCount
  if (total === 0) return null

  const items: { label: string; count: number; href: string }[] = []
  if (pendingCount > 0) {
    items.push({ label: t('needsResponse'), count: pendingCount, href: '/gigs' })
  }
  if (needsActionCount > 0) {
    items.push({ label: tGig('needsAction'), count: needsActionCount, href: '/gigs' })
  }

  return (
    <div className="mt-4 space-y-1.5">
      {items.map((item) => (
        <Link
          key={item.href + item.label}
          href={item.href}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors group"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-gentle-pulse shrink-0" />
          <span>
            {item.count} {item.label.toLowerCase()}
          </span>
          <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      ))}
    </div>
  )
}
