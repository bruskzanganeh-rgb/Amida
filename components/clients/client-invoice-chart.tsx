'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'

type Invoice = {
  id: string
  invoice_number: number
  invoice_date: string
  total: number
  subtotal: number
  exchange_rate: number | null
  status: string | null
}

type Props = {
  invoices: Invoice[]
  clientName: string
}

export function ClientInvoiceChart({ invoices }: Props) {
  const t = useTranslations('client')
  const td = useTranslations('dashboard')
  const { symbol: baseCurrencySymbol } = useBaseCurrency()

  // Get available years from invoices
  const availableYears = useMemo(() => {
    const years = [...new Set(invoices.map((inv) => new Date(inv.invoice_date).getFullYear()))].sort((a, b) => b - a) // Descending order
    return years.map((y) => y.toString())
  }, [invoices])

  const [selectedYear, setSelectedYear] = useState<string>(availableYears[0] || new Date().getFullYear().toString())

  // Calculate monthly data for selected year
  const chartData = useMemo(() => {
    const year = parseInt(selectedYear)
    const monthlyData: { [key: number]: number } = {}

    // Initialize all months to 0
    for (let i = 0; i < 12; i++) {
      monthlyData[i] = 0
    }

    // Sum invoices by month
    invoices
      .filter((inv) => {
        const invYear = new Date(inv.invoice_date).getFullYear()
        return invYear === year && (inv.status === 'paid' || inv.status === 'sent')
      })
      .forEach((inv) => {
        const month = new Date(inv.invoice_date).getMonth()
        monthlyData[month] += Math.round((inv.subtotal || 0) * (inv.exchange_rate || 1))
      })

    return Object.entries(monthlyData).map(([month, total]) => ({
      month: (parseInt(month) + 1).toString().padStart(2, '0'),
      monthName: td('monthNames.' + month),
      total,
    }))
  }, [invoices, selectedYear, td])

  const yearTotal = chartData.reduce((sum, d) => sum + d.total, 0)

  if (availableYears.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{t('invoicingPerMonth')}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t('totalYear', { year: selectedYear })}:{' '}
            <span className="font-semibold">
              {yearTotal.toLocaleString('sv-SE')} {baseCurrencySymbol}
            </span>
          </p>
        </div>
        <Select value={selectedYear} onValueChange={setSelectedYear}>
          <SelectTrigger className="w-[100px]">
            <SelectValue placeholder={t('yearLabel')} />
          </SelectTrigger>
          <SelectContent>
            {availableYears.map((year) => (
              <SelectItem key={year} value={year}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorClientRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="monthName" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip
              formatter={(value: number) => [
                `${value.toLocaleString('sv-SE')} ${baseCurrencySymbol}`,
                t('invoicedLabel'),
              ]}
              labelFormatter={(label) => `${label} ${selectedYear}`}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px',
              }}
            />
            <Area type="monotone" dataKey="total" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorClientRevenue)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
