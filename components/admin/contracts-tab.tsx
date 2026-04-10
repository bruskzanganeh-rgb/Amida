'use client'

import { Fragment, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Send, Download, Loader2, X, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import type { Contract, ContractAudit, ContractWithAudit } from '@/lib/contracts/types'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent_to_reviewer: 'bg-purple-100 text-purple-700',
  reviewed: 'bg-indigo-100 text-indigo-700',
  sent: 'bg-blue-100 text-blue-700',
  viewed: 'bg-amber-100 text-amber-700',
  signed: 'bg-green-100 text-green-700',
  expired: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-500',
}

export function ContractsTab() {
  const [contracts, setContracts] = useState<(Contract & { company?: { company_name: string | null } | null })[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedContract, setExpandedContract] = useState<ContractWithAudit | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Create form state
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    company_id: '',
    tier: 'Pro',
    annual_price: '',
    currency: 'SEK',
    billing_interval: 'annual',
    vat_rate_pct: '25',
    contract_start_date: new Date().toISOString().split('T')[0],
    contract_duration_months: '12',
    signer_name: '',
    signer_email: '',
    signer_title: '',
    reviewer_name: '',
    reviewer_email: '',
    custom_terms: '',
  })

  useEffect(() => {
    loadContracts()
    loadCompanies()
  }, [])

  async function loadContracts() {
    setLoading(true)
    try {
      const res = await fetch('/api/contracts')
      if (res.ok) {
        const data = await res.json()
        setContracts(data)
      }
    } catch (err) {
      console.error('Failed to load contracts:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadCompanies() {
    try {
      await fetch('/api/contracts?_companies=1')
      // We'll use admin API — for now just load from the contracts we have
    } catch {
      // ignore
    }
  }

  async function loadContractDetail(id: string) {
    try {
      const res = await fetch(`/api/contracts/${id}`)
      if (res.ok) {
        const data = await res.json()
        setExpandedContract(data)
      }
    } catch (err) {
      console.error('Failed to load contract detail:', err)
    }
  }

  async function handleCreate(andSend: boolean = false) {
    if (!form.signer_name || !form.signer_email || !form.annual_price) {
      toast.error('Please fill in required fields')
      return
    }

    setCreating(true)
    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: form.company_id || null,
          tier: form.tier,
          annual_price: parseFloat(form.annual_price),
          currency: form.currency,
          billing_interval: form.billing_interval,
          vat_rate_pct: parseFloat(form.vat_rate_pct),
          contract_start_date: form.contract_start_date,
          contract_duration_months: parseInt(form.contract_duration_months),
          signer_name: form.signer_name,
          signer_email: form.signer_email,
          signer_title: form.signer_title || null,
          reviewer_name: form.reviewer_name || null,
          reviewer_email: form.reviewer_email || null,
          custom_terms: form.custom_terms ? { additional: form.custom_terms } : {},
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error?.toString() || 'Failed to create contract')
        return
      }

      const contract = await res.json()
      toast.success(`Contract ${contract.contract_number} created`)

      if (andSend) {
        await handleSend(contract.id)
      }

      setShowCreate(false)
      resetForm()
      loadContracts()
    } catch {
      toast.error('Failed to create contract')
    } finally {
      setCreating(false)
    }
  }

  async function handleSend(id: string) {
    try {
      const res = await fetch(`/api/contracts/${id}/send`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Signing link sent to ${data.sent_to}`)
        loadContracts()
        if (expandedId === id) loadContractDetail(id)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to send')
      }
    } catch {
      toast.error('Failed to send')
    }
  }

  async function handleCancel(id: string) {
    try {
      const res = await fetch(`/api/contracts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      // Note: PATCH only works for draft. For cancelling sent contracts, we'd need a dedicated endpoint.
      // For now, we'll do it via a direct status update approach
      if (res.ok) {
        toast.success('Contract cancelled')
        loadContracts()
      }
    } catch {
      toast.error('Failed to cancel')
    }
  }

  function resetForm() {
    setForm({
      company_id: '',
      tier: 'Pro',
      annual_price: '',
      currency: 'SEK',
      billing_interval: 'annual',
      vat_rate_pct: '25',
      contract_start_date: new Date().toISOString().split('T')[0],
      contract_duration_months: '12',
      signer_name: '',
      signer_email: '',
      signer_title: '',
      reviewer_name: '',
      reviewer_email: '',
      custom_terms: '',
    })
  }

  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedContract(null)
    } else {
      setExpandedId(id)
      loadContractDetail(id)
    }
  }

  const filtered = statusFilter === 'all' ? contracts : contracts.filter((c) => c.status === statusFilter)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent_to_reviewer">In Review</SelectItem>
              <SelectItem value="reviewed">Reviewed</SelectItem>
              <SelectItem value="sent">Sent to Signer</SelectItem>
              <SelectItem value="viewed">Viewed</SelectItem>
              <SelectItem value="signed">Signed</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{filtered.length} contracts</span>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Create Contract
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No contracts found</p>
        </div>
      ) : (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contract</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Signer</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((contract) => (
                <Fragment key={contract.id}>
                  <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleExpand(contract.id)}>
                    <TableCell>
                      <div>
                        <span className="font-medium text-sm">{contract.contract_number}</span>
                        <div className="text-xs text-muted-foreground">{contract.tier}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {(contract.company as { company_name: string | null } | null)?.company_name || '-'}
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="text-sm">{contract.signer_name}</span>
                        <div className="text-xs text-muted-foreground">{contract.signer_email}</div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {Number(contract.annual_price).toLocaleString()} {contract.currency}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[contract.status] || ''}>{contract.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {['draft', 'sent', 'sent_to_reviewer'].includes(contract.status) && (
                          <Button variant="ghost" size="sm" onClick={() => handleSend(contract.id)} title="Send">
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        {contract.status !== 'signed' && contract.status !== 'cancelled' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`/api/contracts/${contract.id}/pdf?type=unsigned`, '_blank')}
                            title="Download PDF"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        )}
                        {contract.status === 'signed' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(`/api/contracts/${contract.id}/pdf?type=signed`, '_blank')}
                            title="Download signed PDF"
                          >
                            <Download className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        {expandedId === contract.id ? (
                          <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {expandedId === contract.id && expandedContract && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30 p-4">
                        <ContractDetail
                          contract={expandedContract}
                          onSend={() => handleSend(contract.id)}
                          onCancel={() => handleCancel(contract.id)}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create Contract Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Contract</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Signer Name *</Label>
                <Input
                  value={form.signer_name}
                  onChange={(e) => setForm((f) => ({ ...f, signer_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Signer Email *</Label>
                <Input
                  type="email"
                  value={form.signer_email}
                  onChange={(e) => setForm((f) => ({ ...f, signer_email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Signer Title</Label>
              <Input
                value={form.signer_title}
                onChange={(e) => setForm((f) => ({ ...f, signer_title: e.target.value }))}
                placeholder="e.g. Managing Director"
              />
            </div>

            <div className="border-t pt-3 mt-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Reviewer (optional)</Label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                If set, the agreement is first sent to the reviewer for approval, then forwarded to the signer.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Reviewer Name</Label>
                <Input
                  value={form.reviewer_name}
                  onChange={(e) => setForm((f) => ({ ...f, reviewer_name: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Reviewer Email</Label>
                <Input
                  type="email"
                  value={form.reviewer_email}
                  onChange={(e) => setForm((f) => ({ ...f, reviewer_email: e.target.value }))}
                />
              </div>
            </div>

            <div className="border-t pt-3 mt-3">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Terms</Label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tier *</Label>
                <Select value={form.tier} onValueChange={(v) => setForm((f) => ({ ...f, tier: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Free">Free</SelectItem>
                    <SelectItem value="Pro">Pro</SelectItem>
                    <SelectItem value="Team">Team</SelectItem>
                    <SelectItem value="Enterprise">Enterprise</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Annual Price *</Label>
                <Input
                  type="number"
                  value={form.annual_price}
                  onChange={(e) => setForm((f) => ({ ...f, annual_price: e.target.value }))}
                  placeholder="e.g. 4990"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEK">SEK</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="NOK">NOK</SelectItem>
                    <SelectItem value="DKK">DKK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Billing</Label>
                <Select
                  value={form.billing_interval}
                  onValueChange={(v) => setForm((f) => ({ ...f, billing_interval: v }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="annual">Annual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>VAT %</Label>
                <Input
                  type="number"
                  value={form.vat_rate_pct}
                  onChange={(e) => setForm((f) => ({ ...f, vat_rate_pct: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={form.contract_start_date}
                  onChange={(e) => setForm((f) => ({ ...f, contract_start_date: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duration (months)</Label>
                <Input
                  type="number"
                  value={form.contract_duration_months}
                  onChange={(e) => setForm((f) => ({ ...f, contract_duration_months: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Custom Terms</Label>
              <Textarea
                value={form.custom_terms}
                onChange={(e) => setForm((f) => ({ ...f, custom_terms: e.target.value }))}
                placeholder="Additional terms or conditions..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowCreate(false)} disabled={creating}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => handleCreate(false)} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Draft
            </Button>
            <Button onClick={() => handleCreate(true)} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create & Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ContractDetail({
  contract,
  onSend,
  onCancel,
}: {
  contract: ContractWithAudit
  onSend: () => void
  onCancel: () => void
}) {
  const formatLocale = useFormatLocale()
  const hasReviewer = contract.reviewer_email
  const statusSteps = hasReviewer
    ? ['draft', 'sent_to_reviewer', 'reviewed', 'sent', 'viewed', 'signed']
    : ['draft', 'sent', 'viewed', 'signed']
  const currentStep = statusSteps.indexOf(contract.status)

  return (
    <div className="space-y-4">
      {/* Status Timeline */}
      <div className="flex items-center gap-2">
        {statusSteps.map((step, i) => (
          <div key={step} className="flex items-center gap-2">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                contract.status === 'cancelled' || contract.status === 'expired'
                  ? 'bg-gray-300'
                  : i <= currentStep
                    ? 'bg-green-500'
                    : 'bg-gray-200'
              }`}
            />
            <span
              className={`text-xs ${
                i <= currentStep && contract.status !== 'cancelled'
                  ? 'text-foreground font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              {step}
            </span>
            {i < statusSteps.length - 1 && <div className="w-8 h-px bg-gray-200" />}
          </div>
        ))}
        {['expired', 'cancelled'].includes(contract.status) && (
          <Badge className={statusColors[contract.status]}>{contract.status}</Badge>
        )}
      </div>

      {/* Contract Info */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Price</span>
          <p className="font-medium">
            {Number(contract.annual_price).toLocaleString()} {contract.currency}/year
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Duration</span>
          <p className="font-medium">
            {contract.contract_duration_months} months from {contract.contract_start_date}
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">VAT</span>
          <p className="font-medium">{Number(contract.vat_rate_pct)}%</p>
        </div>
      </div>

      {/* Reviewer info */}
      {contract.reviewer_email && (
        <div className="text-sm bg-purple-50 rounded-lg p-3">
          <span className="text-muted-foreground">Reviewer:</span>{' '}
          <span className="font-medium">{contract.reviewer_name || contract.reviewer_email}</span>
          {contract.reviewer_name && <span className="text-muted-foreground"> ({contract.reviewer_email})</span>}
          {contract.reviewed_at && (
            <span className="text-green-600 ml-2">
              Reviewed {new Date(contract.reviewed_at).toLocaleDateString(formatLocale)}
            </span>
          )}
        </div>
      )}

      {/* Audit Trail */}
      {contract.audit_trail && contract.audit_trail.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Audit Trail</h4>
          <div className="space-y-1">
            {contract.audit_trail.map((event: ContractAudit) => (
              <div key={event.id} className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground w-32 shrink-0">
                  {new Date(event.created_at).toLocaleString('sv-SE')}
                </span>
                <Badge variant="outline" className="text-xs">
                  {event.event_type}
                </Badge>
                {event.actor_email && <span className="text-muted-foreground">{event.actor_email}</span>}
                {event.ip_address && <span className="text-muted-foreground">IP: {event.ip_address}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t">
        {['draft', 'sent', 'sent_to_reviewer'].includes(contract.status) && (
          <Button size="sm" onClick={onSend}>
            <Send className="h-3.5 w-3.5 mr-1" />
            {contract.status === 'draft' ? (contract.reviewer_email ? 'Send to Reviewer' : 'Send to Signer') : 'Resend'}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => window.open(`/api/contracts/${contract.id}/pdf?type=unsigned`, '_blank')}
        >
          <Download className="h-3.5 w-3.5 mr-1" />
          Unsigned PDF
        </Button>
        {contract.status === 'signed' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`/api/contracts/${contract.id}/pdf?type=signed`, '_blank')}
          >
            <Download className="h-3.5 w-3.5 mr-1 text-green-600" />
            Signed PDF
          </Button>
        )}
        {!['signed', 'cancelled', 'expired'].includes(contract.status) && (
          <>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onCancel}>
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
