'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertTriangle,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  Crown,
  Mail,
  Phone,
  MapPin,
  Trash2,
  Plus,
  Loader2,
  UserPlus,
  X,
  Pencil,
  LogIn,
  Copy,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'

type Member = {
  user_id: string
  role: string
  email: string | null
  gig_count: number
  invoice_count: number
  expense_count: number
}

type User = {
  user_id: string
  plan: string
  status: string
  stripe_customer_id: string | null
  stripe_price_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  admin_override: boolean
  created_at: string
  company_name: string | null
  org_number: string | null
  email: string | null
  address: string | null
  phone: string | null
  gig_count: number
  invoice_count: number
  client_count: number
  position_count: number
  gig_type_count: number
  expense_count: number
  monthly_invoices: number
  monthly_scans: number
  city: string | null
  postal_code: string | null
  country_code: string | null
  categories: { id: string; name: string }[]
  instruments_text: string | null
  last_active?: string | null
  recent_activity_count?: number
  members?: Member[]
}

type Props = {
  users: User[]
  setUsers: React.Dispatch<React.SetStateAction<User[]>>
  onReload: () => void
}

export function OrganizationsTab({ users, setUsers, onReload }: Props) {
  const t = useTranslations('admin')
  const tSub = useTranslations('subscription')
  const tc = useTranslations('common')
  const formatLocale = useFormatLocale()

  // Filter states
  const [planFilter, setPlanFilter] = useState('')

  const [expanded, setExpanded] = useState<string | null>(null)
  const [changingTier, setChangingTier] = useState<string | null>(null)
  const [deletingUser, setDeletingUser] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Add user dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addMode, setAddMode] = useState<'invite' | 'create'>('invite')
  const [addForm, setAddForm] = useState({ email: '', password: '', company_name: '', full_name: '' })
  const [addSaving, setAddSaving] = useState(false)

  // Invite member dialog
  const [inviteForUserId, setInviteForUserId] = useState<string | null>(null)
  const [inviteMode, setInviteMode] = useState<'invite' | 'create'>('invite')
  const [inviteForm, setInviteForm] = useState({ email: '', password: '' })
  const [inviteSaving, setInviteSaving] = useState(false)

  // Impersonate
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null)
  const [impersonateUrl, setImpersonateUrl] = useState('')
  const [impersonateCopied, setImpersonateCopied] = useState(false)

  // Edit user dialog
  const [editUserId, setEditUserId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ email: '', password: '' })
  const [editSaving, setEditSaving] = useState(false)

  // Get current user ID for self-delete guard
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setCurrentUserId(user.id)
    })
  }, [])

  async function handleTierChange(userId: string, newPlan: string) {
    setChangingTier(userId)
    const res = await fetch(`/api/admin/users/${userId}/tier`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: newPlan }),
    })
    if (res.ok) {
      setUsers((prev) => prev.map((u) => (u.user_id === userId ? { ...u, plan: newPlan, admin_override: true } : u)))
      toast.success(t('tierChanged'))
    } else {
      toast.error('Failed to change tier')
    }
    setChangingTier(null)
  }

  async function handleDeleteCompany(ownerUserId: string) {
    if (ownerUserId === currentUserId) {
      toast.error(t('cannotDeleteSelf'))
      return
    }
    setDeletingUser(ownerUserId)
    const res = await fetch(`/api/admin/users/${ownerUserId}?company=true`, {
      method: 'DELETE',
    })
    if (res.ok) {
      setUsers((prev) => prev.filter((u) => u.user_id !== ownerUserId))
      toast.success(t('companyDeleted'))
    } else {
      const data = await res.json()
      toast.error(data.error || 'Failed to delete')
    }
    setDeletingUser(null)
    setConfirmDeleteId(null)
  }

  async function handleEditUser() {
    if (!editUserId) return
    const { email, password } = editForm
    if (!email && !password) {
      toast.error('No changes')
      return
    }
    setEditSaving(true)
    const body: Record<string, string> = {}
    if (email) body.email = email
    if (password) body.password = password

    const res = await fetch(`/api/admin/users/${editUserId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      toast.success(t('userUpdated'))
      if (email) {
        // Update local state with new email
        setUsers((prev) =>
          prev.map((u) => {
            if (u.user_id === editUserId) return { ...u, email }
            if (u.members) {
              return { ...u, members: u.members.map((m) => (m.user_id === editUserId ? { ...m, email } : m)) }
            }
            return u
          }),
        )
      }
      setEditUserId(null)
    } else {
      const data = await res.json()
      toast.error(data.error || 'Failed to update user')
    }
    setEditSaving(false)
  }

  async function handleRemoveMember(memberUserId: string, ownerUserId: string) {
    if (memberUserId === currentUserId) {
      toast.error(t('cannotDeleteSelf'))
      return
    }
    const res = await fetch(`/api/admin/users/${memberUserId}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === ownerUserId ? { ...u, members: u.members?.filter((m) => m.user_id !== memberUserId) } : u,
        ),
      )
      toast.success(t('memberRemoved'))
    } else {
      const data = await res.json()
      toast.error(data.error || 'Failed to remove member')
    }
  }

  async function handleAddUser() {
    if (!addForm.email) return
    if (addMode === 'create' && addForm.password.length < 6) return

    setAddSaving(true)
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: addForm.email,
        password: addMode === 'create' ? addForm.password : undefined,
        company_name: addForm.company_name || undefined,
        full_name: addForm.full_name || undefined,
        mode: addMode,
      }),
    })

    if (res.ok) {
      toast.success(addMode === 'invite' ? t('inviteSent') : t('userCreated'))
      setAddDialogOpen(false)
      setAddForm({ email: '', password: '', company_name: '', full_name: '' })
      onReload()
    } else {
      const data = await res.json()
      toast.error(data.error || 'Failed')
    }
    setAddSaving(false)
  }

  async function handleInviteMember() {
    if (!inviteForUserId || !inviteForm.email) return
    if (inviteMode === 'create' && inviteForm.password.length < 6) return

    setInviteSaving(true)
    const res = await fetch(`/api/admin/users/${inviteForUserId}/invite-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: inviteForm.email,
        password: inviteMode === 'create' ? inviteForm.password : undefined,
        mode: inviteMode,
      }),
    })

    if (res.ok) {
      toast.success(inviteMode === 'invite' ? t('inviteSent') : t('userCreated'))
      setInviteForUserId(null)
      setInviteForm({ email: '', password: '' })
      onReload()
    } else {
      const data = await res.json()
      toast.error(data.error || 'Failed')
    }
    setInviteSaving(false)
  }

  async function handleImpersonate(userId: string) {
    setImpersonatingId(userId)
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (res.ok) {
        const { url } = await res.json()
        setImpersonateUrl(url)
      } else {
        const data = await res.json()
        toast.error(data.error || t('impersonateError'))
        setImpersonatingId(null)
      }
    } catch {
      toast.error(t('impersonateError'))
      setImpersonatingId(null)
    }
  }

  async function copyImpersonateUrl() {
    try {
      await navigator.clipboard.writeText(impersonateUrl)
      setImpersonateCopied(true)
      setTimeout(() => setImpersonateCopied(false), 2000)
    } catch {
      toast.error('Could not copy')
    }
  }

  // Filter users
  const filteredUsers = users.filter((u) => {
    if (planFilter && planFilter !== 'all') {
      if (u.plan !== planFilter) return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            {t('companies')} ({users.length})
          </CardTitle>
          <Button size="sm" onClick={() => setAddDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            {t('newUser')}
          </Button>
        </CardHeader>
        <CardContent>
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <Select value={planFilter} onValueChange={setPlanFilter}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder={t('filterByPlan')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('allPlans')}</SelectItem>
                <SelectItem value="free">{tSub('free')}</SelectItem>
                <SelectItem value="pro">{tSub('pro')}</SelectItem>
                <SelectItem value="team">{tSub('team')}</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">
              {t('matchingCompanies', { count: filteredUsers.length, total: users.length })}
            </span>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">{t('noCompanies')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <div key={u.user_id} className="rounded-lg bg-secondary/50 overflow-hidden">
                  <div
                    className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-secondary/80 transition-colors"
                    onClick={() => setExpanded(expanded === u.user_id ? null : u.user_id)}
                  >
                    <div className="flex items-center gap-2">
                      {expanded === u.user_id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{u.company_name || t('noName')}</p>
                          {u.org_number && (
                            <span className="text-[10px] text-muted-foreground">Org.nr {u.org_number}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {u.last_active && (
                        <span className="text-[10px] text-muted-foreground hidden sm:inline">
                          {t('lastActive')}: {new Date(u.last_active).toLocaleDateString(formatLocale)}
                        </span>
                      )}
                      <Badge variant={u.plan === 'free' ? 'secondary' : 'default'} className="text-xs">
                        {tSub(u.plan)}
                      </Badge>
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        {new Date(u.created_at).toLocaleDateString(formatLocale)}
                      </span>
                    </div>
                  </div>

                  {expanded === u.user_id && (
                    <div className="px-3 pb-3 pt-1 border-t border-border/50 space-y-3">
                      {/* Contact info */}
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        {u.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {u.email}
                          </span>
                        )}
                        {u.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {u.phone}
                          </span>
                        )}
                        {u.address && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {u.address}
                          </span>
                        )}
                        {(u.city || u.postal_code) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {[u.postal_code, u.city].filter(Boolean).join(' ')}
                          </span>
                        )}
                      </div>

                      {/* Categories */}
                      {u.categories && u.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {u.categories.map((cat) => (
                            <Badge key={cat.id} variant="outline" className="text-[10px]">
                              {cat.name}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Subscription details */}
                      {(u.plan === 'pro' || u.plan === 'team') && (
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Crown className="h-3 w-3 text-yellow-500" />
                          {u.admin_override ? (
                            <Badge variant="outline" className="text-[10px] text-purple-600 border-purple-300">
                              {t('adminSet')}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              {u.stripe_price_id === process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID
                                ? t('monthly') + ' — ' + t('perMonth')
                                : u.stripe_price_id === process.env.NEXT_PUBLIC_STRIPE_PRO_YEARLY_PRICE_ID
                                  ? t('yearly') + ' — ' + t('perYear')
                                  : t('adminSet')}
                            </Badge>
                          )}
                          {u.admin_override && u.stripe_customer_id && (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Stripe: {u.stripe_price_id ? 'aktiv' : 'ingen'}
                            </Badge>
                          )}
                          {u.current_period_end && (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {t('renewsAt', { date: new Date(u.current_period_end).toLocaleDateString(formatLocale) })}
                            </span>
                          )}
                          {u.cancel_at_period_end && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                              {t('endsAtPeriod')}
                            </Badge>
                          )}
                          {u.status === 'past_due' && (
                            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              past_due
                            </Badge>
                          )}
                          {u.status === 'canceled' && (
                            <Badge variant="outline" className="text-[10px] text-red-600 border-red-300">
                              canceled
                            </Badge>
                          )}
                        </div>
                      )}

                      {/* Tier change */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-medium">{t('changeTier')}:</span>
                        <Select
                          value={u.plan}
                          onValueChange={(v) => handleTierChange(u.user_id, v)}
                          disabled={changingTier === u.user_id}
                        >
                          <SelectTrigger className="w-32 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="free">{tSub('free')}</SelectItem>
                            <SelectItem value="pro">{tSub('pro')}</SelectItem>
                            <SelectItem value="team">{tSub('team')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <StatBox label={t('gigCount')} value={u.gig_count} />
                        <StatBox label={t('invoiceCount')} value={u.invoice_count} />
                        <StatBox label={t('clientCount')} value={u.client_count} />
                        <StatBox label={t('expenseCount')} value={u.expense_count} />
                        <StatBox label={t('gigTypeCount')} value={u.gig_type_count} />
                        <StatBox label={t('positionCount')} value={u.position_count} />
                        <StatBox label={t('monthlyInvoices')} value={u.monthly_invoices} />
                        <StatBox label={t('monthlyScans')} value={u.monthly_scans} />
                      </div>

                      {/* Members */}
                      {u.members && u.members.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">
                            {t('members')} ({u.members.length})
                          </p>
                          <div className="space-y-1">
                            {u.members.map((m) => (
                              <div
                                key={m.user_id}
                                className="flex items-center gap-2 text-xs bg-background rounded px-2 py-1.5"
                              >
                                <span className="text-muted-foreground flex-1">{m.email || m.user_id.slice(0, 8)}</span>
                                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                                  {m.gig_count}g · {m.invoice_count}i · {m.expense_count}e
                                </span>
                                <Badge variant={m.role === 'owner' ? 'default' : 'secondary'} className="text-[10px]">
                                  {m.role}
                                </Badge>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    setEditUserId(m.user_id)
                                    setEditForm({ email: m.email || '', password: '' })
                                  }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                {m.role !== 'owner' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                                    onClick={() => handleRemoveMember(m.user_id, u.user_id)}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setInviteForUserId(u.user_id)
                            setInviteForm({ email: '', password: '' })
                            setInviteMode('invite')
                          }}
                        >
                          <UserPlus className="h-3 w-3 mr-1" />
                          {t('inviteMember')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleImpersonate(u.user_id)}
                          disabled={impersonatingId === u.user_id}
                        >
                          {impersonatingId === u.user_id ? (
                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <LogIn className="h-3 w-3 mr-1" />
                          )}
                          {t('impersonate')}
                        </Button>
                      </div>

                      {/* Delete company */}
                      {confirmDeleteId === u.user_id ? (
                        <div className="flex items-center gap-2 p-2 rounded bg-red-50 border border-red-200">
                          <p className="text-xs text-red-700 flex-1">{t('deleteCompanyConfirm')}</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            {tc('cancel')}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 text-xs"
                            onClick={() => handleDeleteCompany(u.user_id)}
                            disabled={deletingUser === u.user_id}
                          >
                            {deletingUser === u.user_id && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                            {tc('delete')}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive h-7 text-xs"
                          onClick={() => setConfirmDeleteId(u.user_id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          {t('deleteCompany')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add user dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('newUser')}</DialogTitle>
            <DialogDescription>{addMode === 'invite' ? t('inviteMode') : t('createMode')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={addMode === 'invite' ? 'default' : 'outline'}
                onClick={() => setAddMode('invite')}
                className="flex-1"
              >
                {t('inviteUser')}
              </Button>
              <Button
                size="sm"
                variant={addMode === 'create' ? 'default' : 'outline'}
                onClick={() => setAddMode('create')}
                className="flex-1"
              >
                {t('createAccount')}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{t('email')}</Label>
              <Input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('fullName')}</Label>
              <Input
                value={addForm.full_name}
                onChange={(e) => setAddForm((f) => ({ ...f, full_name: e.target.value }))}
                placeholder={t('fullNamePlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('companyName')}</Label>
              <Input
                value={addForm.company_name}
                onChange={(e) => setAddForm((f) => ({ ...f, company_name: e.target.value }))}
                placeholder="Företagsnamn AB"
              />
            </div>

            {addMode === 'create' && (
              <div className="space-y-2">
                <Label>{t('password')}</Label>
                <Input
                  type="password"
                  value={addForm.password}
                  onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••"
                />
                <p className="text-xs text-muted-foreground">{t('minPassword')}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={handleAddUser}
              disabled={addSaving || !addForm.email || (addMode === 'create' && addForm.password.length < 6)}
            >
              {addSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {addMode === 'invite' ? t('inviteUser') : t('createAccount')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog
        open={!!editUserId}
        onOpenChange={(open) => {
          if (!open) setEditUserId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('editUser')}</DialogTitle>
            <DialogDescription>{t('editUserDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('email')}</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label>{t('newPassword')}</Label>
              <Input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Leave empty to keep current"
              />
              <p className="text-xs text-muted-foreground">{t('minPassword')}</p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserId(null)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleEditUser} disabled={editSaving || (!editForm.email && !editForm.password)}>
              {editSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite member dialog */}
      <Dialog
        open={!!inviteForUserId}
        onOpenChange={(open) => {
          if (!open) setInviteForUserId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('inviteMember')}</DialogTitle>
            <DialogDescription>{t('inviteMemberDesc')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={inviteMode === 'invite' ? 'default' : 'outline'}
                onClick={() => setInviteMode('invite')}
                className="flex-1"
              >
                {t('inviteUser')}
              </Button>
              <Button
                size="sm"
                variant={inviteMode === 'create' ? 'default' : 'outline'}
                onClick={() => setInviteMode('create')}
                className="flex-1"
              >
                {t('createAccount')}
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{t('email')}</Label>
              <Input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
              />
            </div>

            {inviteMode === 'create' && (
              <div className="space-y-2">
                <Label>{t('password')}</Label>
                <Input
                  type="password"
                  value={inviteForm.password}
                  onChange={(e) => setInviteForm((f) => ({ ...f, password: e.target.value }))}
                  placeholder="••••••"
                />
                <p className="text-xs text-muted-foreground">{t('minPassword')}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteForUserId(null)}>
              {tc('cancel')}
            </Button>
            <Button
              onClick={handleInviteMember}
              disabled={
                inviteSaving || !inviteForm.email || (inviteMode === 'create' && inviteForm.password.length < 6)
              }
            >
              {inviteSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {inviteMode === 'invite' ? t('inviteUser') : t('createAccount')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impersonate link dialog */}
      <Dialog
        open={!!impersonateUrl}
        onOpenChange={(open) => {
          if (!open) {
            setImpersonateUrl('')
            setImpersonatingId(null)
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('impersonateLink')}</DialogTitle>
            <DialogDescription>{t('impersonateLinkDesc')}</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input value={impersonateUrl} readOnly className="text-xs" />
            <Button variant="outline" size="sm" onClick={copyImpersonateUrl}>
              {impersonateCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setImpersonateUrl('')
                setImpersonatingId(null)
              }}
            >
              {tc('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-background rounded-md px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  )
}
