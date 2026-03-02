'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { Shield, LogOut, Moon, Sun, ChevronDown, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface SponsorData {
  id: string
  name: string
  display_prefix: string | null
  website_url: string | null
}

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
  const [sponsor, setSponsor] = useState<SponsorData | null>(null)
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
        supabase.from('company_members').select('company_id, full_name').limit(1).single(),
        supabase.rpc('is_admin', { uid: session.user.id }),
        supabase.from('subscriptions').select('plan').limit(1).single(),
      ])

      let companyName = ''
      let userCity = ''
      let userCountry = ''
      if (membership) {
        const { data: comp } = await supabase
          .from('companies')
          .select('company_name, city, country_code')
          .eq('id', membership.company_id)
          .single()
        companyName = comp?.company_name || ''
        userCity = comp?.city || ''
        userCountry = comp?.country_code || ''
      }

      const currentPlan = sub?.plan || 'free'

      if (!cancelled) {
        setCompanyName(companyName)
        setUserName(membership?.full_name || '')
        setPlan(currentPlan)
        setIsAdmin(!!admin)
      }

      // Load sponsor for free-tier users
      if (currentPlan === 'free' && !cancelled) {
        const { data: userCats } = await supabase.from('user_categories').select('category_id')

        const categoryIds = (userCats || []).map((uc) => uc.category_id).filter(Boolean)

        if (categoryIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: sponsors } = await (supabase.from('sponsors') as any)
            .select('id, name, display_prefix, website_url, target_city, target_country, target_cities')
            .in('instrument_category_id', categoryIds)
            .eq('active', true)
            .order('priority', { ascending: false })

          if (!cancelled && sponsors && sponsors.length > 0) {
            const lowerCity = userCity.toLowerCase()
            // Prefer city match > country match > global > first
            const cityMatch = userCity
              ? sponsors.find((s: { target_cities?: string[] | null }) =>
                  s.target_cities?.some((c: string) => c.toLowerCase() === lowerCity),
                )
              : null
            const countryMatch = userCountry
              ? sponsors.find(
                  (s: { target_country?: string | null; target_cities?: string[] | null }) =>
                    s.target_country === userCountry && !s.target_cities?.length,
                )
              : null
            const globalMatch = sponsors.find(
              (s: { target_country?: string | null; target_cities?: string[] | null }) =>
                !s.target_country && !s.target_cities?.length,
            )
            const best = cityMatch || countryMatch || globalMatch || sponsors[0]
            setSponsor(best)
          }
        }
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
      }).catch(() => {
        // Impression logging is best-effort; don't block UI
      })
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
          className="header-nav-link flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium"
          style={{ color: '#C7D2FE', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span className="flex flex-col items-end leading-tight">
            <span className="max-w-[100px] sm:max-w-[180px] truncate">{companyName || userEmail}</span>
            {companyName && userName && (
              <span className="max-w-[100px] sm:max-w-[180px] truncate text-[10px] opacity-70">{userName}</span>
            )}
          </span>
          {plan !== 'free' && (
            <span
              className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none"
              style={{
                background: plan === 'team' ? 'rgba(139,92,246,0.25)' : 'rgba(99,102,241,0.25)',
                color: plan === 'team' ? '#c4b5fd' : '#a5b4fc',
              }}
            >
              {plan}
            </span>
          )}
          {plan === 'free' && sponsor && (
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
              className="rounded-full px-1.5 py-0.5 text-[9px] font-medium leading-none transition-opacity hover:opacity-80"
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
