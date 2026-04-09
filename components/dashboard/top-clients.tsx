'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'

type ClientRevenue = {
  name: string
  revenue: number
}

const COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#6366f1',
  '#14b8a6',
  '#f97316',
]

export function TopClients() {
  const t = useTranslations('dashboard')
  const tc = useTranslations('common')
  const formatLocale = useFormatLocale()
  const { symbol: baseCurrencySymbol } = useBaseCurrency()
  const [data, setData] = useState<ClientRevenue[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadTopClients() {
      setLoading(true)

      const { data: invoices } = (await supabase
        .from('invoices')
        .select('subtotal, exchange_rate, client:clients(id, name)')
        .in('status', ['sent', 'paid'])) as unknown as {
        data: { subtotal: number; exchange_rate: number | null; client: { id: string; name: string } | null }[] | null
      }

      if (invoices) {
        const clientTotals: { [key: string]: { name: string; revenue: number } } = {}

        invoices.forEach((inv) => {
          if (inv.client) {
            const clientId = inv.client.id
            const clientName = inv.client.name
            if (!clientTotals[clientId]) {
              clientTotals[clientId] = { name: clientName, revenue: 0 }
            }
            clientTotals[clientId].revenue += Math.round((inv.subtotal || 0) * (inv.exchange_rate || 1))
          }
        })

        const sorted = Object.values(clientTotals)
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10)

        setData(sorted)
      }

      setLoading(false)
    }
    loadTopClients()
  }, [supabase])

  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0)

  return (
    <Card>
      <CardHeader className="pb-2 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{t('topClients')}</CardTitle>
          <span className="text-sm font-semibold">
            {totalRevenue.toLocaleString(formatLocale)} {baseCurrencySymbol}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {loading ? (
          <div className="h-[180px] flex items-center justify-center text-muted-foreground text-sm">
            {tc('loading')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data.slice(0, 6)} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
              <XAxis
                type="number"
                tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 10, fill: 'var(--foreground)' }}
                tickLine={false}
                axisLine={false}
                width={100}
                tickFormatter={(value) => (value.length > 15 ? value.substring(0, 15) + '...' : value)}
              />
              <Tooltip
                formatter={(value: number) => [
                  `${value.toLocaleString(formatLocale)} ${baseCurrencySymbol}`,
                  t('revenue'),
                ]}
                contentStyle={{
                  backgroundColor: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  color: 'var(--foreground)',
                }}
              />
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                {data.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
