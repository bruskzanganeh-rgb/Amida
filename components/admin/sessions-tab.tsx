'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Activity, ChevronDown, ChevronLeft, ChevronRight, Monitor, RefreshCw, Smartphone } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

type Session = {
  id: string
  user_id: string
  started_at: string
  last_active_at: string
  ended_at: string | null
  ip_address: string | null
  user_agent: string | null
  full_name: string | null
  company_name: string | null
  email: string | null
}

type User = {
  user_id: string
  company_name: string | null
  email: string | null
}

type Props = {
  users: User[]
}

// --- Helpers ---

function formatDuration(startedAt: string, lastActiveAt: string): string {
  const ms = new Date(lastActiveAt).getTime() - new Date(startedAt).getTime()
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

function getInitials(fullName: string | null, email: string | null): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/)
    return parts
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }
  if (email) return email[0].toUpperCase()
  return '?'
}

const USER_COLORS = [
  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
]

function getUserColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i)
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

function parseDevice(ua: string | null): { browser: string; os: string; isMobile: boolean } {
  if (!ua) return { browser: '-', os: '-', isMobile: false }

  let browser = 'Other'
  if (ua.includes('Edg')) browser = 'Edge'
  else if (ua.includes('Chrome')) browser = 'Chrome'
  else if (ua.includes('Firefox')) browser = 'Firefox'
  else if (ua.includes('Safari')) browser = 'Safari'

  let os = ''
  if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS'
  else if (ua.includes('Android')) os = 'Android'
  else if (ua.includes('Mac OS')) os = 'macOS'
  else if (ua.includes('Windows')) os = 'Windows'
  else if (ua.includes('Linux')) os = 'Linux'

  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua)

  return { browser, os, isMobile }
}

function displayIp(ip: string | null): string | null {
  if (!ip) return null
  if (ip === '::1' || ip === '127.0.0.1') return 'localhost'
  return ip
}

function getDateRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const to = now.toISOString().split('T')[0]

  switch (preset) {
    case 'today':
      return { from: to, to }
    case '7d': {
      const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      return { from: d.toISOString().split('T')[0], to }
    }
    case '30d': {
      const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      return { from: d.toISOString().split('T')[0], to }
    }
    case '90d': {
      const d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
      return { from: d.toISOString().split('T')[0], to }
    }
    case 'all':
      return { from: '', to: '' }
    default:
      return { from: '', to: '' }
  }
}

export function SessionsTab({ users }: Props) {
  const t = useTranslations('admin')
  const formatLocale = useFormatLocale()
  const dateLocale = useDateLocale()

  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessions, setActiveSessions] = useState<Session[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)

  // Filters
  const [filterUser, setFilterUser] = useState<string>('')
  const [datePreset, setDatePreset] = useState<string>('7d')

  // Expand
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Timestamp captured when sessions are loaded, used for "active" check
  const [renderTimestamp, setRenderTimestamp] = useState(() => Date.now())
  const [refreshKey, setRefreshKey] = useState(0)

  const dateRange = useMemo(() => getDateRange(datePreset), [datePreset])

  useEffect(() => {
    async function loadActiveSessions() {
      const params = new URLSearchParams({ active_only: 'true' })
      const res = await fetch(`/api/admin/sessions?${params}`)
      if (res.ok) {
        const data = await res.json()
        setActiveSessions(data.sessions)
      }
    }

    async function loadSessions() {
      setLoading(true)
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (filterUser) params.set('user_id', filterUser)
      if (dateRange.from) params.set('from', dateRange.from)
      if (dateRange.to) params.set('to', dateRange.to)

      const res = await fetch(`/api/admin/sessions?${params}`)
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions)
        setTotal(data.total)
        setTotalPages(data.totalPages)
        setRenderTimestamp(Date.now())
      }
      setLoading(false)
    }

    loadSessions()
    loadActiveSessions()
  }, [page, filterUser, dateRange, refreshKey])

  function handleRefresh() {
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t('sessions')}</h2>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </Button>
      </div>

      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <Card>
          <CardContent className="py-3">
            <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              {t('activeSessions')} ({activeSessions.length})
            </p>
            <div className="space-y-1">
              {activeSessions.map((s) => {
                const device = parseDevice(s.user_agent)
                const color = getUserColor(s.user_id)
                return (
                  <div key={s.id} className="flex items-center justify-between bg-secondary/50 rounded-md px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <Avatar className={cn('h-6 w-6 text-[10px]', color)}>
                        <AvatarFallback className={color}>{getInitials(s.full_name, s.email)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{s.full_name || s.email}</span>
                      <Badge variant="default" className="text-[10px]">
                        {t('activeNow')}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatDuration(s.started_at, s.last_active_at)}</span>
                      <span className="flex items-center gap-0.5">
                        {device.isMobile ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                        {device.browser}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select
          value={filterUser || '__all__'}
          onValueChange={(v) => {
            setFilterUser(v === '__all__' ? '' : v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-48 h-8 text-xs">
            <SelectValue placeholder={t('filterByUser')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('allUsers', { count: users.length })}</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.user_id} value={u.user_id}>
                {u.email || u.company_name || u.user_id.slice(0, 8)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={datePreset}
          onValueChange={(v) => {
            setDatePreset(v)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{t('dateToday')}</SelectItem>
            <SelectItem value="7d">{t('dateLast7d')}</SelectItem>
            <SelectItem value="30d">{t('dateLast30d')}</SelectItem>
            <SelectItem value="90d">{t('dateLast90d')}</SelectItem>
            <SelectItem value="all">{t('dateAll')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Session history */}
      {sessions.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Activity className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('noSessions')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {sessions.map((s) => {
            const isActive = !s.ended_at && renderTimestamp - new Date(s.last_active_at).getTime() < 5 * 60 * 1000
            const isExpanded = expandedId === s.id
            const device = parseDevice(s.user_agent)
            const color = getUserColor(s.user_id)
            const fullTimestamp = new Date(s.started_at).toLocaleString(formatLocale)
            let timeAgo: string
            try {
              timeAgo = formatDistanceToNow(new Date(s.started_at), {
                addSuffix: true,
                locale: dateLocale,
              })
            } catch {
              timeAgo = fullTimestamp
            }

            return (
              <div key={s.id} className="rounded-lg bg-secondary/50 overflow-hidden">
                <div
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-secondary/80 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : s.id)}
                >
                  {/* Expand chevron */}
                  <ChevronDown
                    className={cn(
                      'h-3 w-3 text-muted-foreground shrink-0 transition-transform',
                      !isExpanded && '-rotate-90',
                    )}
                  />

                  {/* Avatar */}
                  <Avatar className={cn('h-7 w-7 text-[11px] shrink-0', color)}>
                    <AvatarFallback className={color}>{getInitials(s.full_name, s.email)}</AvatarFallback>
                  </Avatar>

                  {/* Identity */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {isActive && <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0" />}
                      <p className="text-sm font-medium truncate">{s.full_name || s.email || s.user_id.slice(0, 8)}</p>
                    </div>
                  </div>

                  {/* Meta info - right side */}
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                    <span title={fullTimestamp} className="hidden sm:inline">
                      {timeAgo}
                    </span>
                    <span className="hidden sm:flex items-center gap-0.5">
                      {device.isMobile ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                      {device.browser}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {formatDuration(s.started_at, s.last_active_at)}
                    </Badge>
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/50 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
                    <div>
                      <span className="text-muted-foreground">{t('email')}:</span> <span>{s.email || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('company')}:</span>{' '}
                      <span>{s.company_name || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">IP:</span>{' '}
                      <span className="font-mono">{displayIp(s.ip_address) || '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('started')}:</span>{' '}
                      <span>{new Date(s.started_at).toLocaleString(formatLocale)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('lastActivity')}:</span>{' '}
                      <span>{new Date(s.last_active_at).toLocaleString(formatLocale)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">{t('device')}:</span>{' '}
                      <span>
                        {device.browser} / {device.os}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {total} {t('totalEntries')}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs">
              {page} / {totalPages}
            </span>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
