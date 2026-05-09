'use client'

import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { useTranslations } from 'next-intl'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageTransition } from '@/components/ui/page-transition'

import dynamic from 'next/dynamic'

const ExpensesTab = dynamic(() => import('@/components/finance/expenses-tab'), {
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

export function ExpensesPageContent() {
  const tExpense = useTranslations('expense')

  return (
    <PageTransition>
      <div className="lg:h-[calc(100vh-7rem)] lg:flex lg:flex-col space-y-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{tExpense('expenses')}</h1>
          <Button size="sm" onClick={() => window.dispatchEvent(new Event('upload-receipt'))}>
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
