import * as React from 'react'
import { TableHead } from '@/components/ui/table'
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SortColumn, SortConfig } from '@/lib/gigs/gig-helpers'

/** Sortable table header cell with an asc/desc indicator. */
export function SortableHead({
  column,
  sort,
  onSort,
  children,
  className,
}: {
  column: SortColumn
  sort: SortConfig
  onSort: (col: SortColumn) => void
  children: React.ReactNode
  className?: string
}) {
  const active = sort.column === column
  return (
    <TableHead className={cn('cursor-pointer select-none hover:bg-muted/50', className)} onClick={() => onSort(column)}>
      <div className="flex items-center gap-1">
        {children}
        {active ? (
          sort.direction === 'asc' ? (
            <ArrowUp className="h-3 w-3" />
          ) : (
            <ArrowDown className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </div>
    </TableHead>
  )
}
