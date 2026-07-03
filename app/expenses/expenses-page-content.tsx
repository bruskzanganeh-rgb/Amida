'use client'

import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { useTranslations } from 'next-intl'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requestAction } from '@/lib/pending-action'
import { PageTransition } from '@/components/ui/page-transition'
import { Skeleton } from '@/components/ui/skeleton'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'

import dynamic from 'next/dynamic'

const ExpensesTab = dynamic(() => import('@/components/finance/expenses-tab'), {
  ssr: false,
  loading: () => <TabSkeleton />,
})

function TabSkeleton() {
  return (
    <div className="space-y-6">
      {/* filter row */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-32" />
        ))}
      </div>
      {/* summary + chart */}
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      {/* table */}
      <div className="rounded-lg border p-4">
        <TableSkeleton columns={7} rows={6} />
      </div>
    </div>
  )
}

export function ExpensesPageContent() {
  const tExpense = useTranslations('expense')

  return (
    <PageTransition>
      <div className="lg:h-[calc(100vh-7rem)] lg:flex lg:flex-col space-y-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{tExpense('expenses')}</h1>
          <Button size="sm" onClick={() => requestAction('upload-receipt')}>
            <Upload className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{tExpense('uploadReceipt')}</span>
          </Button>
        </div>
        <div className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
          <ErrorBoundary>
            <Suspense fallback={<TabSkeleton />}>
              <ExpensesTab />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
    </PageTransition>
  )
}
