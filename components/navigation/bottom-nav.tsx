'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { navigationItems } from './nav-items'
import { useActionCount } from '@/lib/hooks/use-action-count'

function haptic() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(10)
  }
}

export function BottomNav() {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const actionCount = useActionCount()

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex h-16 items-center justify-around px-1">
        {navigationItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const showBadge = item.nameKey === 'finance' && actionCount > 0
          return (
            <Link
              key={item.nameKey}
              href={item.href}
              onClick={haptic}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 flex-1 h-full transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <item.icon className="h-6 w-6" />
              {showBadge && (
                <span className="absolute top-1.5 left-1/2 ml-2 flex items-center justify-center min-w-[16px] h-[16px] rounded-full bg-destructive text-white text-[10px] font-bold leading-none px-1">
                  {actionCount > 9 ? '9+' : actionCount}
                </span>
              )}
              <span className="text-[10px] font-medium leading-tight">{t(item.nameKey)}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
