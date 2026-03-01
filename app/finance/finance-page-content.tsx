'use client'

import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useRouter, usePathname } from 'next/navigation'
import { FileText, BarChart3, Tag, Music, Users, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageTransition } from '@/components/ui/page-transition'

import dynamic from 'next/dynamic'

const InvoicesTab = dynamic(() => import('@/components/finance/invoices-tab'), {
  ssr: false,
  loading: () => <TabSkeleton />,
})
const AnalyticsContent = dynamic(
  () => import('@/components/analytics/analytics-content').then((mod) => ({ default: mod.AnalyticsContent })),
  { ssr: false, loading: () => <TabSkeleton /> },
)
const GigTypesTab = dynamic(() => import('@/components/settings/gig-types-tab'), {
  ssr: false,
  loading: () => <TabSkeleton />,
})
const PositionsTab = dynamic(() => import('@/components/settings/positions-tab'), {
  ssr: false,
  loading: () => <TabSkeleton />,
})
const ClientsTab = dynamic(() => import('@/components/settings/clients-tab'), {
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

export function FinancePageContent() {
  const tInvoice = useTranslations('invoice')
  const tConfig = useTranslations('config')
  const tGigTypes = useTranslations('gigTypes')
  const tPositions = useTranslations('positions')
  const tClient = useTranslations('client')
  const tAnalytics = useTranslations('analytics')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentTab = searchParams.get('tab') || 'invoices'

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <PageTransition>
      <div className="space-y-6">
        <Tabs value={currentTab} onValueChange={handleTabChange}>
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger value="invoices" className="gap-2">
                <FileText className="h-4 w-4" />
                {tInvoice('invoices')}
              </TabsTrigger>
              <TabsTrigger value="clients" className="gap-2">
                <Users className="h-4 w-4" />
                {tConfig('clients')}
              </TabsTrigger>
              <TabsTrigger value="gig-types" className="gap-2">
                <Tag className="h-4 w-4" />
                {tConfig('gigTypes')}
              </TabsTrigger>
              <TabsTrigger value="positions" className="gap-2">
                <Music className="h-4 w-4" />
                {tConfig('positions')}
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                {tAnalytics('title')}
              </TabsTrigger>
            </TabsList>
            {currentTab === 'invoices' && (
              <Button size="sm" onClick={() => window.dispatchEvent(new Event('create-invoice'))}>
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{tInvoice('newInvoice')}</span>
              </Button>
            )}
            {currentTab === 'clients' && (
              <Button size="sm" onClick={() => window.dispatchEvent(new Event('create-client'))}>
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{tClient('newClient')}</span>
              </Button>
            )}
            {currentTab === 'gig-types' && (
              <Button size="sm" onClick={() => window.dispatchEvent(new Event('create-gig-type'))}>
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{tGigTypes('newGigType')}</span>
              </Button>
            )}
            {currentTab === 'positions' && (
              <Button size="sm" onClick={() => window.dispatchEvent(new Event('create-position'))}>
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{tPositions('newPosition')}</span>
              </Button>
            )}
          </div>

          <TabsContent value="invoices" className="mt-4">
            <ErrorBoundary>
              <Suspense fallback={<TabSkeleton />}>
                <InvoicesTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="clients" className="mt-4">
            <ErrorBoundary>
              <Suspense fallback={<TabSkeleton />}>
                <ClientsTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="gig-types" className="mt-4">
            <ErrorBoundary>
              <Suspense fallback={<TabSkeleton />}>
                <GigTypesTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="positions" className="mt-4">
            <ErrorBoundary>
              <Suspense fallback={<TabSkeleton />}>
                <PositionsTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="analytics" className="mt-4">
            <ErrorBoundary>
              <Suspense fallback={<TabSkeleton />}>
                <AnalyticsContent />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  )
}
