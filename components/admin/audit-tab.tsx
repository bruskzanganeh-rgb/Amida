'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollText, ChevronDown, ChevronRight, ChevronLeft, RefreshCw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { readJsonSafe } from '@/lib/http'

type AuditLog = {
  id: number
  table_name: string
  record_id: string
  action: string
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_fields: string[] | null
  user_id: string | null
  created_at: string
}

type User = {
  user_id: string
  company_name: string | null
  email: string | null
}

type Props = {
  users: User[]
}

const TABLES = [
  'gigs',
  'clients',
  'invoices',
  'invoice_lines',
  'expenses',
  'company_settings',
  'subscriptions',
  'gig_types',
  'positions',
  'gig_dates',
]
const ACTIONS = ['INSERT', 'UPDATE', 'DELETE']

export function AuditTab({ users }: Props) {
  const t = useTranslations('admin')
  const formatLocale = useFormatLocale()

  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  // Filters
  const [filterUser, setFilterUser] = useState<string>('')
  const [filterTable, setFilterTable] = useState<string>('')
  const [filterAction, setFilterAction] = useState<string>('')
  const [filterFrom, setFilterFrom] = useState<string>('')
  const [filterTo, setFilterTo] = useState<string>('')

  const userMap = new Map(users.map((u) => [u.user_id, u]))
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    async function loadLogs() {
      setLoading(true)
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (filterUser) params.set('user_id', filterUser)
      if (filterTable) params.set('table_name', filterTable)
      if (filterAction) params.set('action', filterAction)
      if (filterFrom) params.set('from', filterFrom)
      if (filterTo) params.set('to', filterTo)

      const res = await fetch(`/api/admin/audit?${params}`)
      if (res.ok) {
        const data = await readJsonSafe<{ logs: AuditLog[]; total: number; totalPages: number }>(res)
        if (data) {
          setLogs(data.logs)
          setTotal(data.total)
          setTotalPages(data.totalPages)
        }
      }
      setLoading(false)
    }
    loadLogs()
  }, [page, filterUser, filterTable, filterAction, filterFrom, filterTo, refreshKey])

  function handleFilter() {
    setPage(1)
    setRefreshKey((k) => k + 1)
  }

  const actionColor = (action: string) => {
    switch (action) {
      case 'INSERT':
        return 'default'
      case 'UPDATE':
        return 'secondary'
      case 'DELETE':
        return 'destructive'
      default:
        return 'secondary'
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t('audit')}</h2>
        <Button variant="outline" size="sm" onClick={() => setRefreshKey((k) => k + 1)} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          {t('refresh')}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <Select value={filterUser || '__all__'} onValueChange={(v) => setFilterUser(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-40 h-8 text-xs">
            <SelectValue placeholder={t('filterByUser')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('allUsers', { count: users.length })}</SelectItem>
            {users.map((u) => (
              <SelectItem key={u.user_id} value={u.user_id}>
                {u.company_name || u.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterTable || '__all__'} onValueChange={(v) => setFilterTable(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder={t('filterByTable')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('allTables')}</SelectItem>
            {TABLES.map((tbl) => (
              <SelectItem key={tbl} value={tbl}>
                {tbl}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterAction || '__all__'} onValueChange={(v) => setFilterAction(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue placeholder={t('filterByAction')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('allActions')}</SelectItem>
            {ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={filterFrom}
          onChange={(e) => setFilterFrom(e.target.value)}
          className="w-36 h-8 text-xs"
          placeholder={t('dateRange')}
        />
        <Input
          type="date"
          value={filterTo}
          onChange={(e) => setFilterTo(e.target.value)}
          className="w-36 h-8 text-xs"
        />

        <Button size="sm" variant="secondary" onClick={handleFilter} className="h-8">
          {t('applyFilter')}
        </Button>
      </div>

      {/* Results */}
      {logs.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <ScrollText className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">{t('noAuditLogs')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-1">
          {logs.map((log) => {
            const user = userMap.get(log.user_id || '')
            return (
              <div key={log.id} className="rounded-lg bg-secondary/50 overflow-hidden">
                <div
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-secondary/80 transition-colors"
                  onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                >
                  <div className="flex items-center gap-2">
                    {expanded === log.id ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                    <Badge
                      variant={actionColor(log.action) as 'default' | 'secondary' | 'destructive'}
                      className="text-[10px]"
                    >
                      {log.action}
                    </Badge>
                    <span className="text-xs font-medium">{log.table_name}</span>
                    {log.changed_fields && log.changed_fields.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">({log.changed_fields.join(', ')})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {user?.company_name || user?.email || log.user_id?.slice(0, 8) || 'system'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(log.created_at).toLocaleString(formatLocale)}
                    </span>
                  </div>
                </div>

                {expanded === log.id && (
                  <div className="px-3 pb-3 pt-1 border-t border-border/50">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {log.old_data && (
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">{t('oldData')}</p>
                          <pre className="text-[10px] bg-background rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">
                            {JSON.stringify(log.old_data, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.new_data && (
                        <div>
                          <p className="text-[10px] font-medium text-muted-foreground mb-1">{t('newData')}</p>
                          <pre className="text-[10px] bg-background rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap">
                            {JSON.stringify(log.new_data, null, 2)}
                          </pre>
                        </div>
                      )}
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
