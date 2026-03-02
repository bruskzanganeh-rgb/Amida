'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Building2, FileText, TrendingUp, Clock, Calendar } from 'lucide-react'
import { format } from 'date-fns'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import dynamic from 'next/dynamic'
const ClientInvoiceChart = dynamic(
  () => import('@/components/clients/client-invoice-chart').then((mod) => ({ default: mod.ClientInvoiceChart })),
  { ssr: false, loading: () => <div className="h-[200px] animate-pulse bg-muted rounded" /> },
)
import { useFormatLocale } from '@/lib/hooks/use-format-locale'

type Client = {
  id: string
  name: string
  org_number: string | null
  client_code: string | null
  email: string | null
  address: string | null
  payment_terms: number | null
  notes: string | null
}

type Invoice = {
  id: string
  invoice_number: number
  invoice_date: string
  due_date: string
  paid_date: string | null
  total: number
  status: 'draft' | 'sent' | 'paid' | 'overdue' | null
}

export default function ClientDetailPage() {
  const params = useParams()
  const clientId = params.id as string
  const t = useTranslations('client')
  const tc = useTranslations('common')
  const ti = useTranslations('invoice')
  const tis = useTranslations('invoice.status')
  const dateLocale = useDateLocale()
  const formatLocale = useFormatLocale()

  const [client, setClient] = useState<Client | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (clientId) {
      async function loadClientData() {
        setLoading(true)

        // Load client
        const { data: clientData } = await supabase.from('clients').select('*').eq('id', clientId).single()

        // Load invoices for this client
        const { data: invoicesData } = await supabase
          .from('invoices')
          .select('id, invoice_number, invoice_date, due_date, paid_date, total, status')
          .eq('client_id', clientId)
          .order('invoice_date', { ascending: false })

        setClient(clientData)
        setInvoices(invoicesData || [])
        setLoading(false)
      }
      loadClientData()
    }
  }, [clientId, supabase])

  // Calculate statistics
  const totalRevenue = invoices
    .filter((inv) => inv.status === 'paid' || inv.status === 'sent')
    .reduce((sum, inv) => sum + inv.total, 0)

  const unpaidAmount = invoices
    .filter((inv) => inv.status === 'sent' || inv.status === 'overdue')
    .reduce((sum, inv) => sum + inv.total, 0)

  const invoiceCount = invoices.length

  const lastInvoiceDate = invoices.length > 0 ? invoices[0].invoice_date : null

  function getStatusBadge(status: Invoice['status']) {
    if (!status) return <Badge variant="secondary">—</Badge>
    const variants: Record<
      NonNullable<Invoice['status']>,
      { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }
    > = {
      draft: { variant: 'secondary', label: tis('draft') },
      sent: { variant: 'default', label: tis('sent') },
      paid: { variant: 'outline', label: tis('paid') },
      overdue: { variant: 'destructive', label: tis('overdue') },
    }
    const { variant, label } = variants[status]
    return <Badge variant={variant}>{label}</Badge>
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{tc('loading')}</div>
      </div>
    )
  }

  if (!client) {
    return (
      <div className="space-y-6">
        <Link href="/config?tab=clients">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('backToClients')}
          </Button>
        </Link>
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-xl font-semibold">{t('notFound')}</h2>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back button */}
      <Link href="/config?tab=clients">
        <Button variant="ghost" size="sm">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('backToClients')}
        </Button>
      </Link>

      {/* Client header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
          <Building2 className="h-8 w-8" />
          {client.name}
        </h1>
        <div className="flex items-center gap-4 mt-2 text-muted-foreground">
          {client.org_number && (
            <span>
              {t('orgNumber')}: {client.org_number}
            </span>
          )}
          <span>
            {t('paymentTerms')}: {client.payment_terms} {tc('days')}
          </span>
          {client.address && <span className="text-sm">{client.address}</span>}
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('totalRevenue')}</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {totalRevenue.toLocaleString(formatLocale)} {tc('kr')}
            </div>
            <p className="text-xs text-muted-foreground">{t('allPaidSentInvoices')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('unpaidInvoices')}</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {unpaidAmount.toLocaleString(formatLocale)} {tc('kr')}
            </div>
            <p className="text-xs text-muted-foreground">{t('awaitingPayment')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('invoiceCount')}</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{invoiceCount}</div>
            <p className="text-xs text-muted-foreground">{t('totalCount')}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{t('latestInvoice')}</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {lastInvoiceDate ? format(new Date(lastInvoiceDate), 'MMM yyyy', { locale: dateLocale }) : '-'}
            </div>
            <p className="text-xs text-muted-foreground">
              {lastInvoiceDate ? format(new Date(lastInvoiceDate), 'PPP', { locale: dateLocale }) : t('noInvoices')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice chart */}
      {invoices.length > 0 && <ClientInvoiceChart invoices={invoices} clientName={client.name} />}

      {/* Invoice table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {ti('invoices')} ({invoices.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('noInvoicesForClient')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{ti('invoiceNumberShort')}</TableHead>
                  <TableHead>{ti('invoiceDate')}</TableHead>
                  <TableHead>{ti('dueDate')}</TableHead>
                  <TableHead>{ti('amount')}</TableHead>
                  <TableHead>{t('statusHeader')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">#{invoice.invoice_number}</TableCell>
                    <TableCell>{format(new Date(invoice.invoice_date), 'PPP', { locale: dateLocale })}</TableCell>
                    <TableCell>{format(new Date(invoice.due_date), 'PPP', { locale: dateLocale })}</TableCell>
                    <TableCell className="font-medium">
                      {invoice.total.toLocaleString(formatLocale)} {tc('kr')}
                    </TableCell>
                    <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
