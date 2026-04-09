'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Copy, ExternalLink, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'

type AuditEvent = {
  id: number
  table_name: string
  record_id: string
  action: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_fields: string[] | null
  user_id: string | null
  created_at: string
}

type StripeData = {
  metrics: {
    mrr: number
    arr: number
    monthlyCount: number
    yearlyCount: number
    adminSetCount: number
    activePro: number
    cancelingCount: number
    pastDueCount: number
  }
  events: AuditEvent[]
  webhookUrl: string
  webhookConfigured: boolean
}

export function StripeTab({ data }: { data: StripeData | null }) {
  const t = useTranslations('admin')
  const formatLocale = useFormatLocale()
  const [expandedEvent, setExpandedEvent] = useState<number | null>(null)

  // Timestamp for computing time-ago labels, captured once at initial render
  const [renderTimestamp] = useState(() => Date.now())

  if (!data) return null

  const { metrics, events, webhookUrl, webhookConfigured } = data

  function getEventLabel(event: AuditEvent): string {
    const fields = event.changed_fields || []
    const newData = event.new_data || {}
    const oldData = event.old_data || {}

    if (event.action === 'INSERT') return t('eventNewSubscription')
    if (fields.includes('plan')) {
      return newData.plan === 'pro' ? t('eventUpgrade') : t('eventDowngrade')
    }
    if (fields.includes('cancel_at_period_end') && newData.cancel_at_period_end) {
      return t('eventCancelRequested')
    }
    if (fields.includes('status')) {
      return t('eventStatusChange', { status: String(newData.status || '?') })
    }
    if (fields.includes('stripe_subscription_id') && !oldData.stripe_subscription_id) {
      return t('eventNewSubscription')
    }
    return event.action
  }

  function getEventBadgeVariant(event: AuditEvent): 'default' | 'secondary' | 'destructive' | 'outline' {
    const fields = event.changed_fields || []
    const newData = event.new_data || {}
    if (fields.includes('plan') && newData.plan === 'pro') return 'default'
    if (fields.includes('plan') && newData.plan === 'free') return 'destructive'
    if (fields.includes('cancel_at_period_end')) return 'destructive'
    return 'secondary'
  }

  function timeAgo(dateStr: string): string {
    const diff = renderTimestamp - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return t('timeAgo', { time: '<1 min' })
    if (minutes < 60) return t('timeAgo', { time: `${minutes} min` })
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return t('timeAgo', { time: `${hours}h` })
    const days = Math.floor(hours / 24)
    return t('timeAgo', { time: `${days}d` })
  }

  return (
    <div className="space-y-6">
      {/* Webhook config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Webhook
            {webhookConfigured ? (
              <Badge variant="outline" className="text-green-600 border-green-300 text-xs font-normal">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                {t('webhookConfigured')}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-red-600 border-red-300 text-xs font-normal">
                <XCircle className="h-3 w-3 mr-1" />
                {t('webhookMissing')}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>{t('webhookUrl')}</Label>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" />
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl)
                  toast.success(t('copied'))
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('webhookUrlHint')}</p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-1.5" />
              {t('stripeDashboard')}
            </a>
          </Button>
        </CardContent>
      </Card>

      {/* Revenue metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('mrr')}</p>
            <p className="text-2xl font-bold">{metrics.mrr} SEK</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('arr')}</p>
            <p className="text-2xl font-bold">{metrics.arr} SEK</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('monthlySubscribers')}</p>
            <p className="text-2xl font-bold">{metrics.monthlyCount}</p>
            <p className="text-xs text-muted-foreground">{t('perMonth')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('yearlySubscribers')}</p>
            <p className="text-2xl font-bold">{metrics.yearlyCount}</p>
            <p className="text-xs text-muted-foreground">{t('perYear')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscription status */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('activePro')}</p>
            <p className="text-2xl font-bold">
              {metrics.activePro}
              {metrics.adminSetCount > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  (+{metrics.adminSetCount} {t('adminSetPro')})
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('cancelingSubscriptions')}</p>
            <p className="text-2xl font-bold">{metrics.cancelingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('pastDueSubscriptions')}</p>
            <p className="text-2xl font-bold text-amber-600">{metrics.pastDueCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('recentEvents')}</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">{t('noEvents')}</p>
          ) : (
            <div className="space-y-1">
              {events.map((event) => (
                <div key={event.id} className="rounded-lg bg-secondary/50 overflow-hidden">
                  <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-secondary/80 transition-colors"
                    onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
                  >
                    <div className="flex items-center gap-2">
                      {expandedEvent === event.id ? (
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      )}
                      <Badge variant={getEventBadgeVariant(event)} className="text-xs">
                        {getEventLabel(event)}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{timeAgo(event.created_at)}</span>
                  </div>
                  {expandedEvent === event.id && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-2">
                      <div className="text-xs text-muted-foreground">
                        {new Date(event.created_at).toLocaleString(formatLocale)}
                      </div>
                      {event.changed_fields && (
                        <div className="text-xs">
                          <span className="font-medium">Fields: </span>
                          {event.changed_fields.join(', ')}
                        </div>
                      )}
                      {event.new_data && (
                        <pre className="text-[11px] bg-background rounded p-2 overflow-x-auto max-h-40">
                          {JSON.stringify(event.new_data, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
