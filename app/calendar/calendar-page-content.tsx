'use client'

import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/ui/error-boundary'
import { useSearchParams } from 'next/navigation'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useRouter, usePathname } from 'next/navigation'
import { CalendarDays, CalendarCheck } from 'lucide-react'
import { PageTransition } from '@/components/ui/page-transition'
import { SponsorBanner } from '@/components/sponsor-banner'
import { useTranslations } from 'next-intl'

import dynamic from 'next/dynamic'

const CalendarTab = dynamic(() => import('@/components/calendar/calendar-tab'), {
  ssr: false,
  loading: () => <TabSkeleton />,
})
const AvailabilityTab = dynamic(() => import('@/components/calendar/availability-tab'), {
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

export function CalendarPageContent() {
  const t = useTranslations('calendar')
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const currentTab = searchParams.get('tab') || 'calendar'

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
            <TabsTrigger value="calendar" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              {t('calendar')}
            </TabsTrigger>
            <TabsTrigger value="availability" className="gap-2">
              <CalendarCheck className="h-4 w-4" />
              {t('availability')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendar" className="mt-4 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
            <ErrorBoundary>
              <Suspense fallback={<TabSkeleton />}>
                <CalendarTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="availability" className="mt-4 lg:flex-1 lg:min-h-0 lg:flex lg:flex-col">
            <ErrorBoundary>
              <Suspense fallback={<TabSkeleton />}>
                <AvailabilityTab />
              </Suspense>
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
        <SponsorBanner />
      </div>
    </PageTransition>
  )
}
