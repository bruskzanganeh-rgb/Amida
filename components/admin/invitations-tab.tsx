'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Copy, Trash2, RefreshCw, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'

type InvitationCode = {
  id: string
  code: string
  max_uses: number
  use_count: number
  expires_at: string | null
  created_at: string
}

export function InvitationsTab() {
  const t = useTranslations('admin')
  const tc = useTranslations('common')
  const formatLocale = useFormatLocale()
  const [codes, setCodes] = useState<InvitationCode[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newMaxUses, setNewMaxUses] = useState(10)
  const [newExpiresAt, setNewExpiresAt] = useState('')
  const [creating, setCreating] = useState(false)

  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    async function loadCodes() {
      setLoading(true)
      const res = await fetch('/api/admin/invitation-codes')
      if (res.ok) {
        const { codes: data } = await res.json()
        setCodes(data || [])
      }
      setLoading(false)
    }
    loadCodes()
  }, [refreshKey])

  function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    setNewCode(code)
  }

  async function handleCreate() {
    if (!newCode.trim()) return
    setCreating(true)

    const res = await fetch('/api/admin/invitation-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: newCode,
        max_uses: newMaxUses,
        expires_at: newExpiresAt || null,
      }),
    })

    if (res.ok) {
      toast.success(t('codeCreated'))
      setShowCreateDialog(false)
      setNewCode('')
      setNewMaxUses(10)
      setNewExpiresAt('')
      setRefreshKey((k) => k + 1)
    } else {
      const data = await res.json()
      if (res.status === 409) {
        toast.error(t('codeExists'))
      } else {
        toast.error(data.error || 'Error')
      }
    }
    setCreating(false)
  }

  async function handleDelete(id: string) {
    const res = await fetch('/api/admin/invitation-codes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    if (res.ok) {
      setCodes(codes.filter((c) => c.id !== id))
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    toast.success(t('copied'))
  }

  function getStatus(code: InvitationCode): 'active' | 'expired' | 'used' {
    if (code.expires_at && new Date(code.expires_at) < new Date()) return 'expired'
    if (code.use_count >= code.max_uses) return 'used'
    return 'active'
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            {t('invitations')}
          </CardTitle>
          <Button
            onClick={() => {
              generateCode()
              setShowCreateDialog(true)
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('createCode')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{tc('loading')}</p>
        ) : codes.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">{t('noCodes')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('codeField')}</TableHead>
                <TableHead className="text-right">{t('useCount')}</TableHead>
                <TableHead>{t('expiresAt')}</TableHead>
                <TableHead>{t('createdAt')}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">{tc('edit')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {codes.map((code) => {
                const status = getStatus(code)
                return (
                  <TableRow key={code.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-sm font-semibold">{code.code}</code>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyCode(code.code)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm">
                        {code.use_count} / {code.max_uses}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {code.expires_at ? new Date(code.expires_at).toLocaleDateString(formatLocale) : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {new Date(code.created_at).toLocaleDateString(formatLocale)}
                      </span>
                    </TableCell>
                    <TableCell>
                      {status === 'active' && (
                        <Badge variant="default" className="bg-emerald-500">
                          {t('active')}
                        </Badge>
                      )}
                      {status === 'expired' && <Badge variant="destructive">{t('expired')}</Badge>}
                      {status === 'used' && <Badge variant="secondary">{t('usedUp')}</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(code.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createCode')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('codeField')}</Label>
              <div className="flex gap-2">
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                  placeholder="ABC12345"
                  className="font-mono uppercase tracking-widest"
                />
                <Button variant="outline" size="icon" onClick={generateCode}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('maxUses')}</Label>
              <Input
                type="number"
                value={newMaxUses}
                onChange={(e) => setNewMaxUses(parseInt(e.target.value) || 1)}
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('expiresAt')}</Label>
              <Input type="date" value={newExpiresAt} onChange={(e) => setNewExpiresAt(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newCode.trim()}>
              {t('createCode')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
