'use client'

import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'

import dynamic from 'next/dynamic'

const GigsTab = dynamic(() => import('@/components/gigs/gigs-tab'), {
  ssr: false,
  loading: () => <TabSkeleton />,
})

function TabSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 w-48 bg-muted rounded" />
      <div className="h-64 bg-muted rounded" />
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
