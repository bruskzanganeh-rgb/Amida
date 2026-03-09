'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import useSWR from 'swr'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Music, Trash2, ArrowUp, ArrowDown, Pencil } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type Position = {
  id: string
  name: string
  sort_order: number
  created_at: string
}

export default function PositionsPage() {
  const tc = useTranslations('common')
  const tPositions = useTranslations('positions')

  const [showCreateDialog, setShowCreateDialog] = useState(false)

  useEffect(() => {
    const handler = () => setShowCreateDialog(true)
    window.addEventListener('create-position', handler)
    return () => window.removeEventListener('create-position', handler)
  }, [])
  const [newPositionName, setNewPositionName] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingPosition, setEditingPosition] = useState<Position | null>(null)
  const [editName, setEditName] = useState('')
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [positionToDelete, setPositionToDelete] = useState<string | null>(null)
  const supabase = createClient()

  const {
    data: positions = [],
    isLoading: loading,
    mutate,
  } = useSWR<Position[]>(
    'positions',
    async () => {
      const { data, error } = await supabase.from('positions').select('*').order('sort_order')
      if (error) throw error
      return (data || []) as Position[]
    },
    { revalidateOnFocus: true, dedupingInterval: 30_000 },
  )

  async function handleCreate() {
    if (!newPositionName.trim()) return

    setSaving(true)
    const maxOrder = positions.length > 0 ? Math.max(...positions.map((p) => p.sort_order)) + 1 : 1

    const { error } = await supabase.from('positions').insert([{ name: newPositionName.trim(), sort_order: maxOrder }])

    if (error) {
      console.error('Error creating position:', error)
      toast.error(tPositions('createError'))
    } else {
      toast.success(tPositions('createSuccess'))
      setNewPositionName('')
      setShowCreateDialog(false)
      mutate()
    }
    setSaving(false)
  }

  function confirmDelete(id: string) {
    setPositionToDelete(id)
    setDeleteConfirmOpen(true)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('positions').delete().eq('id', id)

    if (error) {
      console.error('Error deleting position:', error)
      toast.error(tPositions('deleteError'))
    } else {
      mutate()
    }
  }

  function openEditDialog(position: Position) {
    setEditingPosition(position)
    setEditName(position.name)
  }

  async function handleEdit() {
    if (!editingPosition || !editName.trim()) return

    setSaving(true)
    const { error } = await supabase.from('positions').update({ name: editName.trim() }).eq('id', editingPosition.id)

    if (error) {
      console.error('Error updating position:', error)
      toast.error(tPositions('updateError'))
    } else {
      toast.success(tPositions('updateSuccess'))
      setEditingPosition(null)
      setEditName('')
      mutate()
    }
    setSaving(false)
  }

  async function movePosition(index: number, direction: 'up' | 'down') {
    const newIndex = direction === 'up' ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= positions.length) return

    const updatedPositions = [...positions]
    const [moved] = updatedPositions.splice(index, 1)
    updatedPositions.splice(newIndex, 0, moved)

    // Update sort_order for all affected positions
    const updates = updatedPositions.map((p, i) => ({
      id: p.id,
      sort_order: i + 1,
    }))

    for (const update of updates) {
      await supabase.from('positions').update({ sort_order: update.sort_order }).eq('id', update.id)
    }

    mutate()
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Music className="h-5 w-5" />
            {tPositions('allPositions', { count: positions.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">{tc('loading')}</div>
          ) : positions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{tPositions('noPositions')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">{tPositions('order')}</TableHead>
                  <TableHead>{tPositions('name')}</TableHead>
                  <TableHead className="text-right">{tPositions('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {positions.map((position, index) => (
                  <TableRow key={position.id}>
                    <TableCell>
                      <Badge variant="outline">{position.sort_order}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{position.name}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={index === 0}
                          onClick={() => movePosition(index, 'up')}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={index === positions.length - 1}
                          onClick={() => movePosition(index, 'down')}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(position)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => confirmDelete(position.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tPositions('newPosition')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">{tPositions('name')}</Label>
              <Input
                id="name"
                value={newPositionName}
                onChange={(e) => setNewPositionName(e.target.value)}
                placeholder={tPositions('namePlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={saving || !newPositionName.trim()}>
              {saving ? tPositions('saving') : tc('create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPosition} onOpenChange={(open) => !open && setEditingPosition(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tPositions('editPosition')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">{tPositions('name')}</Label>
              <Input
                id="edit-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder={tPositions('namePlaceholder')}
                onKeyDown={(e) => e.key === 'Enter' && handleEdit()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPosition(null)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleEdit} disabled={saving || !editName.trim()}>
              {saving ? tPositions('saving') : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open)
          if (!open) setPositionToDelete(null)
        }}
        title={tPositions('deleteTitle')}
        description={tPositions('deleteDescription')}
        confirmLabel={tc('delete')}
        variant="destructive"
        onConfirm={() => {
          if (positionToDelete) {
            handleDelete(positionToDelete)
          }
          setDeleteConfirmOpen(false)
          setPositionToDelete(null)
        }}
      />
    </div>
  )
}
