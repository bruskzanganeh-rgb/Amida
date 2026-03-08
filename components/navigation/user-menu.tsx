'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { Shield, LogOut, Moon, Sun, ChevronDown, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useSponsor } from '@/lib/hooks/use-sponsor'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function UserMenu() {
  const t = useTranslations('nav')
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [userName, setUserName] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [plan, setPlan] = useState<string>('free')
  const [isAdmin, setIsAdmin] = useState(false)
  const { sponsor, isFree } = useSponsor()
  const [impressionLogged, setImpressionLogged] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
    let cancelled = false

    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session?.user || cancelled) return

      setUserEmail(session.user.email || '')

      const [{ data: membership }, { data: admin }, { data: sub }] = await Promise.all([
        supabase.from('company_members').select('company_id, full_name').eq('user_id', session.user.id).single(),
        supabase.rpc('is_admin', { uid: session.user.id }),
        supabase.from('subscriptions').select('plan').limit(1).single(),
      ])

      let companyName = ''
      if (membership) {
        const { data: comp } = await supabase
          .from('companies')
          .select('company_name')
          .eq('id', membership.company_id)
          .single()
        companyName = comp?.company_name || ''
      }

      const currentPlan = sub?.plan || 'free'

      if (!cancelled) {
        setCompanyName(companyName)
        setUserName(membership?.full_name || '')
        setPlan(currentPlan)
        setIsAdmin(!!admin)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Log impression once when sponsor becomes visible
  useEffect(() => {
    if (sponsor && !impressionLogged) {
      setImpressionLogged(true)
      fetch('/api/sponsor-impression', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sponsor_id: sponsor.id }),
      }).catch(() => {})
    }
  }, [sponsor, impressionLogged])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-white/5"
          style={{ color: '#C7D2FE', background: 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer' }}
        >
          <span className="flex items-center gap-1.5 text-[12px]">
            {userName && companyName ? (
              <>
                <span className="truncate max-w-[50px] sm:max-w-[100px]">{userName.split(' ')[0]}</span>
                <span className="opacity-40">·</span>
                <span className="truncate max-w-[60px] sm:max-w-[140px]">{companyName}</span>
              </>
            ) : (
              <span className="truncate max-w-[100px] sm:max-w-[180px]">{companyName || userEmail}</span>
            )}
            {plan !== 'free' && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none shrink-0"
                style={{
                  background: plan === 'team' ? 'rgba(139,92,246,0.25)' : 'rgba(99,102,241,0.25)',
                  color: plan === 'team' ? '#c4b5fd' : '#a5b4fc',
                }}
              >
                {plan === 'team' ? 'Business' : 'Pro'}
              </span>
            )}
          </span>
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
              onClick={(e) => {
                e.stopPropagation()
                fetch('/api/sponsor-impression', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sponsor_id: sponsor.id, type: 'click' }),
                }).catch(() => {})
              }}
              className="hidden md:inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none transition-opacity hover:opacity-80"
              style={{
                background: 'rgba(217,173,66,0.15)',
                color: '#d4a843',
              }}
            >
              {sponsor.display_prefix || 'Sponsored by'} {sponsor.name}
            </a>
          )}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            {companyName && <span className="font-medium text-sm">{companyName}</span>}
            <span className="text-xs text-muted-foreground truncate">{userEmail}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            {t('settings')}
          </Link>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem asChild>
            <Link href="/admin" className="flex items-center gap-2">
              <Shield className="h-4 w-4" style={{ color: '#ef4444' }} />
              {t('admin')}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        {mounted && (
          <DropdownMenuItem onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" style={{ color: '#fbbf24' }} />
            ) : (
              <Moon className="h-4 w-4" style={{ color: '#475569' }} />
            )}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          {t('logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
