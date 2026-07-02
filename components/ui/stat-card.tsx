import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

/**
 * A summary/metric card: a small label, a large value, and an optional icon and
 * subtext. Consolidates the card blocks that were duplicated across the invoices,
 * analytics, export and dashboard views.
 *
 * - With `icon`: label + icon on one row (matches the analytics style).
 * - Without `icon`: muted label (matches the invoices/finance style).
 */
export function StatCard({
  label,
  value,
  icon,
  subtext,
  className,
  valueClassName,
}: {
  label: React.ReactNode
  value: React.ReactNode
  icon?: React.ReactNode
  subtext?: React.ReactNode
  className?: string
  valueClassName?: string
}) {
  return (
    <Card className={className}>
      <CardHeader className={cn('pb-2', icon && 'flex flex-row items-center justify-between space-y-0')}>
        <CardTitle className={cn('text-sm font-medium', !icon && 'text-muted-foreground')}>{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', valueClassName)}>{value}</div>
        {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
      </CardContent>
    </Card>
  )
}
