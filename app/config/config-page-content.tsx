'use client'

import { Suspense } from 'react'
import { useTranslations } from 'next-intl'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useRouter, usePathname } from 'next/navigation'
import { Tag, Music, Users, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageTransition } from '@/components/ui/page-transition'

import dynamic from 'next/dynamic'

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

export function ConfigPageContent() {
  const t = useTranslations('config')
  const tGigTypes = useTranslations('gigTypes')
  const tPositions = useTranslations('positions')
  const tClient = useTranslations('client')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentTab = searchParams.get('tab') || 'gig-types'

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
              <TabsTrigger value="gig-types" className="gap-2">
                <Tag className="h-4 w-4" />
                {t('gigTypes')}
              </TabsTrigger>
              <TabsTrigger value="positions" className="gap-2">
                <Music className="h-4 w-4" />
                {t('positions')}
              </TabsTrigger>
              <TabsTrigger value="clients" className="gap-2">
                <Users className="h-4 w-4" />
                {t('clients')}
              </TabsTrigger>
            </TabsList>
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
            {currentTab === 'clients' && (
              <Button size="sm" onClick={() => window.dispatchEvent(new Event('create-client'))}>
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{tClient('newClient')}</span>
              </Button>
            )}
          </div>

          <TabsContent value="gig-types" className="mt-4">
            <Suspense fallback={<TabSkeleton />}>
              <GigTypesTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="positions" className="mt-4">
            <Suspense fallback={<TabSkeleton />}>
              <PositionsTab />
            </Suspense>
          </TabsContent>

          <TabsContent value="clients" className="mt-4">
            <Suspense fallback={<TabSkeleton />}>
              <ClientsTab />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </PageTransition>
  )
}
