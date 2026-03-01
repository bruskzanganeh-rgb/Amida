'use client'

import { Suspense } from 'react'

import dynamic from 'next/dynamic'

const SettingsTab = dynamic(() => import('@/components/settings/settings-tab'), {
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

export function SettingsPageContent() {
  return (
    <Suspense fallback={<TabSkeleton />}>
      <SettingsTab />
    </Suspense>
  )
}
