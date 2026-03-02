'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useTranslations } from 'next-intl'
import { formatDistanceToNow } from 'date-fns'
import { sv, enUS } from 'date-fns/locale'
import { useLocale } from 'next-intl'

type SponsorImpressionRow = {
  id: string
  name: string
  count: number
  latest: string
}

type Stats = {
  totalUsers: number
  proUsers: number
  freeUsers: number
  mrr: number
  arr: number
  monthlySubscribers: number
  yearlySubscribers: number
  adminSetPro: number
  totalImpressions: number
  sponsorImpressionBreakdown?: SponsorImpressionRow[]
}

export function StatsTab({ stats }: { stats: Stats | null }) {
  const t = useTranslations('admin')
  const locale = useLocale()

  return (
    <div className="space-y-4">
      {/* Row 1: User counts + MRR */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('totalUsers')}</p>
            <p className="text-2xl font-bold">{stats?.totalUsers ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('proUsers')}</p>
            <p className="text-2xl font-bold">
              {stats?.proUsers ?? '-'}
              {(stats?.adminSetPro ?? 0) > 0 && (
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  (+{stats!.adminSetPro} {t('adminSetPro')})
                </span>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('freeUsers')}</p>
            <p className="text-2xl font-bold">{stats?.freeUsers ?? '-'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('mrr')}</p>
            <p className="text-2xl font-bold">{stats?.mrr ?? 0} kr</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: ARR + Subscriber breakdown */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('arr')}</p>
            <p className="text-2xl font-bold">{stats?.arr ?? 0} kr</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('monthlySubscribers')}</p>
            <p className="text-2xl font-bold">{stats?.monthlySubscribers ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t('perMonth')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">{t('yearlySubscribers')}</p>
            <p className="text-2xl font-bold">{stats?.yearlySubscribers ?? 0}</p>
            <p className="text-xs text-muted-foreground">{t('perYear')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Sponsor impressions */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-baseline gap-3 mb-3">
            <p className="text-xs text-muted-foreground">{t('sponsorImpressions')}</p>
            <p className="text-2xl font-bold">{stats?.totalImpressions ?? 0}</p>
          </div>
          {stats?.sponsorImpressionBreakdown && stats.sponsorImpressionBreakdown.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead className="text-right">{t('impressions')}</TableHead>
                  <TableHead className="text-right">{t('latest')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.sponsorImpressionBreakdown.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right">{s.count}</TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {formatDistanceToNow(new Date(s.latest), {
                        addSuffix: true,
                        locale: locale === 'sv' ? sv : enUS,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">{t('noData')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
