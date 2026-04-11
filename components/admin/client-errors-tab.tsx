'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDistanceToNow } from 'date-fns'
import { useDateLocale } from '@/lib/hooks/use-date-locale'

type ClientError = {
  id: string
  user_id: string | null
  error_message: string
  error_stack: string | null
  component_stack: string | null
  url: string | null
  user_agent: string | null
  created_at: string
}

export function ClientErrorsTab() {
  const [errors, setErrors] = useState<ClientError[]>([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState('24h')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const dateLocale = useDateLocale()

  async function loadErrors() {
    setLoading(true)
    const supabase = createClient()
    const now = new Date()
    const since = new Date(now)
    if (range === '24h') since.setHours(since.getHours() - 24)
    else if (range === '7d') since.setDate(since.getDate() - 7)
    else since.setDate(since.getDate() - 30)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from as any)('client_errors')
      .select('*')
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false })
      .limit(200)

    setErrors((data || []) as ClientError[])
    setLoading(false)
  }

  async function clearErrors() {
    if (!confirm('Delete all client errors?')) return
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from as any)('client_errors').delete().lt('created_at', new Date().toISOString())
    loadErrors()
  }

  useEffect(() => {
    loadErrors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range])

  function parseDevice(ua: string | null): string {
    if (!ua) return 'Unknown'
    if (/iPhone|iPad/.test(ua)) return 'iOS'
    if (/Android/.test(ua)) return 'Android'
    if (/Mac/.test(ua)) return 'Mac'
    if (/Windows/.test(ua)) return 'Windows'
    return 'Other'
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Client Errors ({errors.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24h</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadErrors} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {errors.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearErrors}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
        ) : errors.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No errors in this period</p>
        ) : (
          <div className="space-y-2">
            {errors.map((err) => (
              <div
                key={err.id}
                className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedId(expandedId === err.id ? null : err.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{err.error_message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(err.created_at), { addSuffix: true, locale: dateLocale })}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {parseDevice(err.user_agent)}
                      </Badge>
                      {err.url && (
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {new URL(err.url).pathname}
                        </span>
                      )}
                    </div>
                  </div>
                  {expandedId === err.id ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                </div>
                {expandedId === err.id && (
                  <div className="mt-3 space-y-2">
                    {err.error_stack && (
                      <div>
                        <p className="text-xs font-medium mb-1">Stack trace:</p>
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                          {err.error_stack}
                        </pre>
                      </div>
                    )}
                    {err.component_stack && (
                      <div>
                        <p className="text-xs font-medium mb-1">Component stack:</p>
                        <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-[150px] overflow-y-auto whitespace-pre-wrap">
                          {err.component_stack}
                        </pre>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {err.url && <p>URL: {err.url}</p>}
                      {err.user_agent && <p>UA: {err.user_agent}</p>}
                      {err.user_id && <p>User: {err.user_id}</p>}
                      <p>Time: {new Date(err.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
