'use client'

import * as React from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableCell, TableHead, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Ban, Search, Pencil, Copy, Edit, Trash2, ChevronDown } from 'lucide-react'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'
import { getDisplayVenue } from '@/lib/gigs/venue-helpers'
import { fmtFee } from '@/lib/currency/format'
import { formatGigDates, type Gig, type SortColumn, type SortConfig } from '@/lib/gigs/gig-helpers'
import { statusConfig } from '@/lib/gigs/status-config'
import { SortableHead } from '@/components/gigs/sortable-head'

type GigTableProps = {
  gigs: Gig[]
  title: string
  emptyTitle: string
  emptyHint: string
  showTotal: boolean
  searchQuery: string
  onSearchChange: (value: string) => void
  sort: SortConfig
  onSort: (column: SortColumn) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  onScroll: React.UIEventHandler<HTMLDivElement>
  virtualizer: Virtualizer<HTMLDivElement, Element>
  showScrollHint: boolean
  mobileLimit: number
  onShowMore: () => void
  isSharedMode: boolean
  currentUserId: string
  getMemberLabel: (userId: string) => string
  onSelect: (gig: Gig) => void
  onEditById: (id: string) => void
  onEdit: (gig: Gig) => void
  onDuplicate: (gig: Gig) => void
  onDelete: (id: string) => void
}

/**
 * The list body shared by the Declined and Cancelled gig tabs: a mobile card
 * list + a virtualized desktop table. The parent owns sort/scroll/virtualizer
 * state and passes it in, so this component is a pure renderer.
 */
export function GigTable({
  gigs,
  title,
  emptyTitle,
  emptyHint,
  showTotal,
  searchQuery,
  onSearchChange,
  sort,
  onSort,
  scrollRef,
  onScroll,
  virtualizer,
  showScrollHint,
  mobileLimit,
  onShowMore,
  isSharedMode,
  currentUserId,
  getMemberLabel,
  onSelect,
  onEditById,
  onEdit,
  onDuplicate,
  onDelete,
}: GigTableProps) {
  const t = useTranslations('gig')
  const tc = useTranslations('common')
  const tStatus = useTranslations('status')
  const dateLocale = useDateLocale()
  const formatLocale = useFormatLocale()
  const { symbol: baseCurrencySymbol } = useBaseCurrency()

  return (
    <Card className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
      <CardHeader>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5" />
              {title} ({gigs.length})
            </CardTitle>
            <div className="flex items-center gap-2">
              {showTotal && gigs.length > 0 && (
                <p className="text-sm text-muted-foreground">
                  {tc('total')}:{' '}
                  {gigs.reduce((sum, g) => sum + (g.fee_base || g.fee || 0), 0).toLocaleString(formatLocale)}{' '}
                  {baseCurrencySymbol}
                </p>
              )}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`${tc('search')}...`}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
        {gigs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Ban className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{emptyTitle}</p>
            <p className="text-sm">{emptyHint}</p>
          </div>
        ) : (
          <div className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
            {/* Mobile card view */}
            <div className="lg:hidden space-y-2">
              {gigs.slice(0, mobileLimit).map((gig) => {
                const StatusIcon = statusConfig[gig.status]?.icon
                return (
                  <div
                    key={gig.id}
                    className="py-2.5 pr-3 pl-3 rounded-lg border border-l-4 bg-card cursor-pointer hover:bg-muted/50 transition-colors"
                    style={{ borderLeftColor: gig.gig_type.color || '#9ca3af' }}
                    onClick={() => onSelect(gig)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{formatGigDates(gig, dateLocale)}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          {gig.client?.name || t('notSpecified')}
                        </p>
                        {isSharedMode && gig.user_id !== currentUserId && (
                          <p className="text-xs text-blue-600 dark:text-blue-400">{getMemberLabel(gig.user_id)}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0 flex items-start gap-1.5">
                        <div>
                          <span className="font-semibold text-sm">
                            {gig.fee !== null ? fmtFee(gig.fee, gig.currency) : '-'}
                          </span>
                          <div className="mt-0.5">
                            <Badge className={`text-xs ${statusConfig[gig.status]?.color}`}>
                              {StatusIcon && <StatusIcon className="h-3 w-3 mr-0.5" />}
                              {tStatus(gig.status)}
                            </Badge>
                          </div>
                        </div>
                        <button
                          className="p-1 -mr-1 text-muted-foreground hover:text-foreground transition-colors"
                          title={t('editGig')}
                          aria-label={t('editGig')}
                          onClick={(e) => {
                            e.stopPropagation()
                            onEditById(gig.id)
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
              {gigs.length > mobileLimit && (
                <Button variant="ghost" className="w-full mt-2 text-sm text-muted-foreground" onClick={onShowMore}>
                  {t('showMore', { count: gigs.length - mobileLimit })}
                </Button>
              )}
            </div>

            {/* Desktop table view */}
            <div className="relative hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0">
              <div ref={scrollRef} onScroll={onScroll} className="lg:flex-1 lg:min-h-0 overflow-auto rounded-md border">
                <table className="w-full caption-bottom text-sm table-fixed">
                  <thead className="[&_tr]:border-b sticky top-0 z-10 bg-background">
                    <TableRow>
                      <SortableHead column="date" sort={sort} onSort={onSort} className="w-[18%]">
                        {t('date')}
                      </SortableHead>
                      <SortableHead column="client" sort={sort} onSort={onSort} className="w-[18%]">
                        {t('client')}
                      </SortableHead>
                      <SortableHead column="type" sort={sort} onSort={onSort} className="w-[16%]">
                        {t('type')}
                      </SortableHead>
                      <SortableHead column="venue" sort={sort} onSort={onSort} className="w-[14%]">
                        {t('venue')}
                      </SortableHead>
                      <SortableHead column="fee" sort={sort} onSort={onSort} className="w-[12%]">
                        {t('fee')}
                      </SortableHead>
                      <SortableHead column="status" sort={sort} onSort={onSort} className="w-[10%]">
                        {t('status')}
                      </SortableHead>
                      <TableHead className="w-[12%] text-right">{t('actions')}</TableHead>
                    </TableRow>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {virtualizer.getVirtualItems().length > 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          style={{ height: virtualizer.getVirtualItems()[0].start, padding: 0, border: 'none' }}
                        />
                      </tr>
                    )}
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                      const gig = gigs[virtualRow.index]
                      const StatusIcon = statusConfig[gig.status]?.icon
                      return (
                        <TableRow
                          key={gig.id}
                          data-index={virtualRow.index}
                          ref={virtualizer.measureElement}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => onSelect(gig)}
                        >
                          <TableCell className="font-medium">
                            <div>
                              {formatGigDates(gig, dateLocale)}
                              {gig.total_days > 1 && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({gig.total_days} {tc('days')})
                                </span>
                              )}
                              {gig.project_name && (
                                <div
                                  className="text-sm text-muted-foreground truncate max-w-[250px]"
                                  title={gig.project_name}
                                >
                                  {gig.project_name}
                                </div>
                              )}
                              {isSharedMode && gig.user_id !== currentUserId && (
                                <div className="text-xs text-blue-600 dark:text-blue-400">
                                  {getMemberLabel(gig.user_id)}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {gig.client?.name || (
                              <span className="text-muted-foreground italic">{t('notSpecified')}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: gig.gig_type.color || '#9ca3af' }}
                              />
                              <span className="text-sm">{gig.gig_type.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {gig.gig_type.vat_rate}%
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const { venue, isMixed, allVenues } = getDisplayVenue(gig)
                              if (isMixed) {
                                return (
                                  <span
                                    className="text-sm text-muted-foreground cursor-help"
                                    title={allVenues.join('\n')}
                                  >
                                    {t('multipleVenues')}
                                  </span>
                                )
                              }
                              return <span className="text-sm text-muted-foreground">{venue || '-'}</span>
                            })()}
                          </TableCell>
                          <TableCell className="font-medium">
                            {gig.fee !== null ? (
                              fmtFee(gig.fee, gig.currency)
                            ) : (
                              <span className="text-muted-foreground italic">{t('notSet')}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusConfig[gig.status]?.color}>
                              {StatusIcon && <StatusIcon className="h-3 w-3 mr-1" />}
                              {tStatus(gig.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onDuplicate(gig)}
                                title={t('duplicateGig')}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => onEdit(gig)} title={t('editGig')}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => onDelete(gig.id)} title={t('deleteGig')}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                    {virtualizer.getVirtualItems().length > 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          style={{
                            height: virtualizer.getTotalSize() - (virtualizer.getVirtualItems().at(-1)?.end ?? 0),
                            padding: 0,
                            border: 'none',
                          }}
                        />
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {showScrollHint && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none animate-bounce">
                  <ChevronDown className="h-5 w-5 text-muted-foreground/40" />
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
