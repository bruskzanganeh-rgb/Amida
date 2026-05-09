'use client'

import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { useTranslations } from 'next-intl'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FolderOpen, Download, Upload } from 'lucide-react'
import { PageTransition } from '@/components/ui/page-transition'
import dynamic from 'next/dynamic'

const DocumentsTab = dynamic(() => import('@/components/documents/documents-tab'), {
  ssr: false,
  loading: () => <TabSkeleton />,
})
const ImportTab = dynamic(() => import('@/components/documents/import-tab'), {
  ssr: false,
  loading: () => <TabSkeleton />,
})
const ExportTab = dynamic(() => import('@/components/documents/export-tab'), {
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

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsPageContent />
    </Suspense>
  )
}

function DocumentsPageContent() {
  const t = useTranslations('documents')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentTab = searchParams.get('tab') || 'documents'

  function handleTabChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', value)
    router.push(`${pathname}?${params.toString()}`, { scroll: false })
  }

  return (
    <PageTransition>
      <div className="lg:h-[calc(100vh-7rem)] lg:flex lg:flex-col space-y-6">
        <Tabs value={currentTab} onValueChange={handleTabChange} className="lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
          <TabsList>
            <TabsTrigger value="documents" className="gap-2">
              <FolderOpen className="h-4 w-4" />
              {t('title')}
            </TabsTrigger>
            <TabsTrigger value="import" className="gap-2">
              <Upload className="h-4 w-4" />
              {t('import')}
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-2">
              <Download className="h-4 w-4" />
              {t('export')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="mt-4 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
            <ErrorBoundary>
              <Suspense fallback={<TabSkeleton />}>
                <DocumentsTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="import" className="mt-4">
            <ErrorBoundary>
              <Suspense fallback={<TabSkeleton />}>
                <ImportTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="export" className="mt-4">
            <ErrorBoundary>
              <Suspense fallback={<TabSkeleton />}>
                <ExportTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  )
}
