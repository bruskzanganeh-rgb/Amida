'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { User, Users, Search } from 'lucide-react'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { navigationItems } from './nav-items'
import { useGigFilter } from '@/lib/hooks/use-gig-filter'
import { useActionCount } from '@/lib/hooks/use-action-count'
import { useSponsor } from '@/lib/hooks/use-sponsor'
import { ExternalLink } from 'lucide-react'

const UserMenu = dynamic(() => import('./user-menu').then((m) => m.UserMenu), { ssr: false })
const CommandPalette = dynamic(() => import('./command-palette').then((m) => m.CommandPalette), { ssr: false })

export function Header() {
  const pathname = usePathname()
  const t = useTranslations('nav')
  const { isSharedMode, showOnlyMine, toggleShowOnlyMine } = useGigFilter()
  const actionCount = useActionCount()
  const { sponsor, isFree } = useSponsor()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <header
      className="sticky top-0 z-50 w-full border-b pt-[env(safe-area-inset-top)]"
      style={{ backgroundColor: '#0B1E3A', borderColor: '#102544' }}
    >
      <div className="flex h-11 items-center gap-3 px-4 md:px-6 overflow-hidden">
        {/* Spacer for mobile (logo centered) */}
        <div className="md:hidden" />

        {/* Logo */}
        <Link href="/dashboard" className="mr-4 flex items-center gap-2 shrink-0">
          <Image src="/logo.png" alt="Amida" width={24} height={24} />
          <span className="text-[15px] font-bold tracking-tight" style={{ color: '#ffffff' }}>
            Amida
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1 min-w-0">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.nameKey}
                href={item.href}
                className={cn(
                  'relative flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium',
                  !isActive && 'header-nav-link',
                )}
                style={{ color: isActive ? '#ffffff' : '#94a3b8' }}
              >
                <item.icon className="h-3.5 w-3.5 shrink-0" style={{ color: isActive ? '#F59E0B' : undefined }} />
                {item.nameKey === 'finance' && actionCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[14px] h-[14px] rounded-full bg-destructive text-white text-[9px] font-bold leading-none px-0.5">
                    {actionCount > 9 ? '9+' : actionCount}
                  </span>
                )}
                <span className="hidden lg:inline">{t(item.nameKey)}</span>
                {isActive && (
                  <motion.div
                    layoutId="activeHeaderNav"
                    className="absolute inset-x-1 -bottom-[calc(0.375rem+1px)] h-0.5 rounded-full"
                    style={{ backgroundColor: '#F59E0B' }}
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                  />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Right side */}
        <div className="flex-1 md:hidden" />
        <div className="flex items-center gap-3 shrink-0">
          {isSharedMode && (
            <>
              <button
                onClick={toggleShowOnlyMine}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors hover:bg-white/10"
                style={{ color: showOnlyMine ? '#c4b5fd' : '#94a3b8' }}
                title={showOnlyMine ? t('showingMyGigs') : t('showingTeamGigs')}
              >
                {showOnlyMine ? <User className="h-3.5 w-3.5" /> : <Users className="h-3.5 w-3.5" />}
                {showOnlyMine ? t('mineShort') : t('allShort')}
              </button>
              <div className="h-5 border-l border-white/10" />
            </>
          )}
          <button
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] font-medium transition-colors hover:bg-white/10"
            style={{ color: '#94a3b8' }}
            title="Search (⌘K)"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden lg:inline text-[11px]">⌘K</span>
          </button>
          <div className="h-5 border-l border-white/10" />
          <UserMenu />
        </div>
      </div>
      {isFree && sponsor && (
        <a
          href={
            sponsor.website_url
              ? sponsor.website_url.match(/^https?:\/\//)
                ? sponsor.website_url
                : `https://${sponsor.website_url}`
              : '#'
          }
          target="_blank"
          rel="noopener noreferrer"
          className="md:hidden flex items-center justify-center gap-1.5 py-1.5 transition-opacity hover:opacity-70"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <span className="text-[10px]" style={{ color: 'rgba(148,163,184,0.6)' }}>
            {sponsor.display_prefix || 'Sponsored by'}{' '}
            <span className="font-semibold" style={{ color: '#d4a843' }}>
              {sponsor.name}
            </span>
          </span>
          <ExternalLink className="h-2.5 w-2.5" style={{ color: 'rgba(212,168,67,0.4)' }} />
        </a>
      )}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  )
}
