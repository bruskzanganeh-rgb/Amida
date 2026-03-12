'use client'

import { useState, useEffect } from 'react'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Building2, Edit, Trash2, Search, Upload } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CreateClientDialog } from '@/components/clients/create-client-dialog'
import { ImportClientsDialog } from '@/components/clients/import-clients-dialog'
import { EditClientDialog } from '@/components/clients/edit-client-dialog'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

type Client = {
  id: string
  name: string
  org_number: string | null
  client_code: string | null
  email: string | null
  address: string | null
  payment_terms: number
  reference_person: string | null
  notes: string | null
  invoice_language: string | null
  country_code: string | null
  vat_number: string | null
  created_at: string
  invoices: { subtotal: number; exchange_rate: number | null }[]
}

export default function ClientsPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)

  useEffect(() => {
    const handler = () => setShowCreateDialog(true)
    window.addEventListener('create-client', handler)
    return () => window.removeEventListener('create-client', handler)
  }, [])
  const [editingClient, setEditingClient] = useState<Client | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [clientToDelete, setClientToDelete] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const supabase = createClient()
  const t = useTranslations('client')
  const tc = useTranslations('common')

  const {
    data: clients = [],
    isLoading: loading,
    mutate,
  } = useSWR<Client[]>(
    'clients-with-invoices',
    async () => {
      const { data, error } = await supabase
        .from('clients')
        .select(
          `
          *,
          invoices(subtotal, exchange_rate)
        `,
        )
        .order('name')
      if (error) throw error
      return (data || []) as unknown as Client[]
    },
    { revalidateOnFocus: true, dedupingInterval: 10_000 },
  )

  function confirmDelete(id: string) {
    setClientToDelete(id)
    setDeleteConfirmOpen(true)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('clients').delete().eq('id', id)

    if (error) {
      console.error('Error deleting client:', error)
      toast.error(t('couldNotDeleteClient'))
    } else {
      mutate()
    }
  }

  const filteredClients = clients.filter((c) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      c.name.toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.org_number || '').toLowerCase().includes(q) ||
      (c.reference_person || '').toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-[280px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder={tc('search') + '...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setShowImportDialog(true)}>
          <Upload className="h-3.5 w-3.5 mr-1.5" />
          {t('importClients')}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t('allClients', { count: filteredClients.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton columns={5} rows={5} />
          ) : clients.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t('noClientsYet')}</p>
              <p className="text-sm">{t('noClientsHint')}</p>
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="lg:hidden space-y-2">
                {filteredClients.map((client) => {
                  const invoiceCount = client.invoices?.length || 0
                  const totalInvoiced =
                    client.invoices?.reduce((sum, inv) => sum + (inv.subtotal || 0) * (inv.exchange_rate || 1), 0) || 0
                  return (
                    <div key={client.id} className="p-3 rounded-lg border bg-card">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/clients/${client.id}`}
                            className="font-medium text-sm hover:text-primary hover:underline"
                          >
                            {client.name}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {invoiceCount} {t('invoicesColumn').toLowerCase()} ·{' '}
                            {totalInvoiced > 0 ? `${totalInvoiced.toLocaleString('sv-SE')} ${tc('kr')}` : '-'}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setEditingClient(client)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => confirmDelete(client.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop table view */}
              <div className="hidden lg:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('name')}</TableHead>
                      <TableHead className="text-right">{t('invoicesColumn')}</TableHead>
                      <TableHead className="text-right">{t('invoicedColumn')}</TableHead>
                      <TableHead>{t('orgNumber')}</TableHead>
                      <TableHead>{t('paymentTerms')}</TableHead>
                      <TableHead className="text-right">{t('actionsColumn')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredClients.map((client) => {
                      const invoiceCount = client.invoices?.length || 0
                      const totalInvoiced =
                        client.invoices?.reduce(
                          (sum, inv) => sum + (inv.subtotal || 0) * (inv.exchange_rate || 1),
                          0,
                        ) || 0

                      return (
                        <TableRow key={client.id}>
                          <TableCell className="font-medium">
                            <Link href={`/clients/${client.id}`} className="hover:text-primary hover:underline">
                              {client.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium">{invoiceCount}</span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-sm font-medium">
                              {totalInvoiced > 0 ? `${totalInvoiced.toLocaleString('sv-SE')} ${tc('kr')}` : '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">{client.org_number || '-'}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm">
                              {client.payment_terms} {tc('days')}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setEditingClient(client)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => confirmDelete(client.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <CreateClientDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} onSuccess={() => mutate()} />

      <ImportClientsDialog open={showImportDialog} onOpenChange={setShowImportDialog} onSuccess={() => mutate()} />

      <EditClientDialog
        client={editingClient}
        open={editingClient !== null}
        onOpenChange={(open) => !open && setEditingClient(null)}
        onSuccess={() => mutate()}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open)
          if (!open) setClientToDelete(null)
        }}
        title={t('deleteClient')}
        description={t('deleteConfirm')}
        confirmLabel={tc('delete')}
        variant="destructive"
        onConfirm={() => {
          if (clientToDelete) {
            handleDelete(clientToDelete)
          }
          setDeleteConfirmOpen(false)
          setClientToDelete(null)
        }}
      />
    </div>
  )
}
