'use client'

import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

import dynamic from 'next/dynamic'

const GigsTab = dynamic(() => import('@/components/gigs/gigs-tab'), {
  ssr: false,
  loading: () => <TabSkeleton />,
})

function TabSkeleton() {
  return (
    <div className="space-y-4">
      {/* tab bar */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28" />
        ))}
      </div>
      {/* list card */}
      <div className="rounded-lg border p-4">
        <TableSkeleton columns={6} rows={8} />
      </div>
    </div>
  )
}

export function GigsPageContent() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<TabSkeleton />}>
        <GigsTab />
      </Suspense>
    </ErrorBoundary>
  )
}
