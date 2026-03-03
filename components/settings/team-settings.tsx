'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Users, Copy, Check, Loader2, UserPlus, Crown, Trash2, Pencil, Clock, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useTranslations } from 'next-intl'
import { useCompany } from '@/lib/hooks/use-company'
import { useSubscription } from '@/lib/hooks/use-subscription'
import { createClient } from '@/lib/supabase/client'

export function TeamSettings() {
  const t = useTranslations('team')
  const tc = useTranslations('common')
  const { company, companyId, isOwner, members, mutate } = useCompany()
  const { isTeam } = useSubscription()
  const [inviteUrl, setInviteUrl] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [removeMemberId, setRemoveMemberId] = useState<string | null>(null)
  const [showOnlyMyData, setShowOnlyMyData] = useState(false)
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [pendingInvites, setPendingInvites] = useState<
    {
      id: string
      invited_email: string | null
      created_at: string | null
      expires_at: string | null
      used_by: string | null
    }[]
  >([])
  const [revokeInviteId, setRevokeInviteId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('company_settings')
        .select('show_only_my_data')
        .eq('user_id', user.id)
        .single()
        .then(({ data }) => {
          if (data) setShowOnlyMyData(data.show_only_my_data ?? false)
        })
    })
  }, [supabase])

  useEffect(() => {
    if (!companyId) return
    supabase
      .from('company_invitations')
      .select('id, invited_email, created_at, expires_at, used_by')
      .eq('company_id', companyId)
      .is('used_by', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setPendingInvites(data)
      })
  }, [companyId, supabase])

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes}m`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  }

  function timeUntil(dateStr: string) {
    const diff = new Date(dateStr).getTime() - Date.now()
    if (diff <= 0) return '0d'
    const hours = Math.floor(diff / 3600000)
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    return `${days}d`
  }

  async function handleRevokeInvite(inviteId: string) {
    const { error } = await supabase.from('company_invitations').delete().eq('id', inviteId)
    if (error) {
      toast.error(t('revokeError'))
    } else {
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId))
      toast.success(t('inviteRevoked'))
    }
  }

  async function handleToggleShowOnlyMyData() {
    const newValue = !showOnlyMyData
    setShowOnlyMyData(newValue)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase
      .from('company_settings')
      .update({ show_only_my_data: newValue })
      .eq('user_id', user.id)
    if (error) {
      setShowOnlyMyData(!newValue)
      toast.error(tc('saveError'))
    } else {
      toast.success(tc('saved'))
    }
  }

  async function handleCreateInvite() {
    setCreating(true)
    try {
      const res = await fetch('/api/invitations/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail || undefined }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || t('inviteError'))
        return
      }

      setInviteUrl(data.url)
      const sentEmail = inviteEmail
      setInviteEmail('')
      if (data.emailSent) {
        toast.success(t('inviteEmailSent', { email: sentEmail }))
      } else {
        toast.success(sentEmail ? t('inviteCreated') : t('inviteCreatedNoEmail'))
      }
    } catch {
      toast.error(t('inviteError'))
    } finally {
      setCreating(false)
    }
  }

  async function copyInviteUrl() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy')
    }
  }

  async function handleToggleVisibility() {
    if (!companyId || !company) return
    const newVisibility = company.gig_visibility === 'shared' ? 'personal' : 'shared'

    const { error } = await supabase.from('companies').update({ gig_visibility: newVisibility }).eq('id', companyId)

    if (error) {
      toast.error(t('visibilityError'))
    } else {
      mutate()
      toast.success(t('visibilityUpdated'))
    }
  }

  async function handleRemoveMember(memberId: string) {
    const { error } = await supabase
      .from('company_members')
      .update({ removed_at: new Date().toISOString() })
      .eq('id', memberId)

    if (error) {
      toast.error(t('removeMemberError'))
    } else {
      mutate()
      toast.success(t('memberRemoved'))
    }
  }

  async function handleSaveMemberName() {
    if (!editingMemberId) return
    setSavingName(true)
    const { error } = await supabase
      .from('company_members')
      .update({ full_name: editName || null })
      .eq('id', editingMemberId)

    if (error) {
      toast.error(tc('saveError'))
    } else {
      mutate()
      toast.success(tc('saved'))
      setEditingMemberId(null)
    }
    setSavingName(false)
  }

  if (!isTeam) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('title')}
          </CardTitle>
          <CardDescription>{t('upgradeRequired')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('upgradeDescription')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('members')}
          </CardTitle>
          <CardDescription>{t('membersDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 gap-2">
              <div className="flex-1 min-w-0">
                {editingMemberId === member.id ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder={t('namePlaceholder')}
                      className="h-7 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveMemberName()
                        if (e.key === 'Escape') setEditingMemberId(null)
                      }}
                      autoFocus
                    />
                    <Button size="sm" className="h-7 text-xs px-2" onClick={handleSaveMemberName} disabled={savingName}>
                      {savingName ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="min-w-0">
                      {member.full_name && (
                        <span className="text-sm font-medium block truncate">{member.full_name}</span>
                      )}
                      <span
                        className={`text-sm truncate block ${member.full_name ? 'text-muted-foreground text-xs' : 'font-medium'}`}
                      >
                        {member.email || member.user_id.slice(0, 8) + '...'}
                      </span>
                    </div>
                    {member.role === 'owner' && (
                      <Badge variant="secondary" className="gap-1 shrink-0">
                        <Crown className="h-3 w-3" />
                        {t('owner')}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              {editingMemberId !== member.id && (
                <div className="flex items-center gap-1 shrink-0">
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingMemberId(member.id)
                        setEditName(member.full_name || '')
                      }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isOwner && member.role !== 'owner' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoveMemberId(member.id)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Pending invitations */}
      {isOwner && pendingInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t('pendingInvitations')}
            </CardTitle>
            <CardDescription>{t('pendingInvitationsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingInvites.map((invite) => {
              const expiresAt = invite.expires_at
              const isExpired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false
              return (
                <div
                  key={invite.id}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50 gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-medium block truncate">
                        {invite.invited_email || t('openInvite')}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {invite.created_at && t('invitedAgo', { time: timeAgo(invite.created_at) })}
                        {expiresAt && !isExpired && <> · {t('expiresIn', { time: timeUntil(expiresAt as string) })}</>}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={isExpired ? 'destructive' : 'secondary'}>
                      {isExpired ? t('expired') : t('pending')}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokeInviteId(invite.id)}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Invite */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              {t('inviteMember')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder={t('emailOptional')}
                type="email"
              />
              <Button onClick={handleCreateInvite} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t('createInvite')}
              </Button>
            </div>
            {inviteUrl && (
              <div className="flex gap-2">
                <Input value={inviteUrl} readOnly className="text-xs" />
                <Button variant="outline" size="sm" onClick={copyInviteUrl}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Visibility */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle>{t('gigVisibility')}</CardTitle>
            <CardDescription>{t('gigVisibilityDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label>{t('sharedMode')}</Label>
                <p className="text-xs text-muted-foreground">{t('sharedModeDescription')}</p>
              </div>
              <Switch checked={company?.gig_visibility === 'shared'} onCheckedChange={handleToggleVisibility} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Personal filter */}
      {company?.gig_visibility === 'shared' && members.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('personalFilter')}</CardTitle>
            <CardDescription>{t('personalFilterDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <Label>{t('showOnlyMyData')}</Label>
                <p className="text-xs text-muted-foreground">{t('showOnlyMyDataDesc')}</p>
              </div>
              <Switch checked={showOnlyMyData} onCheckedChange={handleToggleShowOnlyMyData} />
            </div>
          </CardContent>
        </Card>
      )}
      <ConfirmDialog
        open={!!removeMemberId}
        onOpenChange={(open) => {
          if (!open) setRemoveMemberId(null)
        }}
        title={t('removeMemberConfirmTitle')}
        description={t('removeMemberConfirmDesc')}
        confirmLabel={tc('delete')}
        cancelLabel={tc('cancel')}
        variant="destructive"
        onConfirm={() => {
          if (removeMemberId) handleRemoveMember(removeMemberId)
          setRemoveMemberId(null)
        }}
      />
      <ConfirmDialog
        open={!!revokeInviteId}
        onOpenChange={(open) => {
          if (!open) setRevokeInviteId(null)
        }}
        title={t('revokeInviteTitle')}
        description={t('revokeInviteDesc')}
        confirmLabel={t('revokeInvite')}
        cancelLabel={tc('cancel')}
        variant="destructive"
        onConfirm={() => {
          if (revokeInviteId) handleRevokeInvite(revokeInviteId)
          setRevokeInviteId(null)
        }}
      />
    </div>
  )
}
