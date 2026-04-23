'use client'

import { useEffect, useState } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Tag, Edit, Trash2 } from 'lucide-react'
import { CreateGigTypeDialog } from '@/components/gig-types/create-gig-type-dialog'
import { EditGigTypeDialog } from '@/components/gig-types/edit-gig-type-dialog'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'

type GigType = {
  id: string
  name: string
  name_en: string | null
  vat_rate: number
  color: string | null
  default_description: string | null
  is_default: boolean | null
}

export default function GigTypesPage() {
  const tc = useTranslations('common')
  const tGigTypes = useTranslations('gigTypes')
  const locale = useLocale()

  const [gigTypes, setGigTypes] = useState<GigType[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  useEffect(() => {
    const handler = () => setShowCreateDialog(true)
    window.addEventListener('create-gig-type', handler)
    return () => window.removeEventListener('create-gig-type', handler)
  }, [])
  const [selectedGigType, setSelectedGigType] = useState<GigType | null>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [gigTypeToDelete, setGigTypeToDelete] = useState<string | null>(null)
  const supabase = createClient()

  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    async function loadGigTypes() {
      setLoading(true)
      const { data, error } = await supabase.from('gig_types').select('*').order('name')

      if (error) {
        console.error('Error loading gig types:', error)
      } else {
        setGigTypes(data || [])
      }
      setLoading(false)
    }
    loadGigTypes()
  }, [supabase, refreshKey])

  function confirmDelete(id: string) {
    setGigTypeToDelete(id)
    setDeleteConfirmOpen(true)
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('gig_types').delete().eq('id', id)

    if (error) {
      console.error('Error deleting gig type:', error)
      toast.error(tGigTypes('deleteError'))
    } else {
      setRefreshKey((k) => k + 1)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {tGigTypes('allGigTypes', { count: gigTypes.length })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">{tc('loading')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{tGigTypes('name')}</TableHead>
                  {locale !== 'en' && <TableHead>{tGigTypes('nameEn')}</TableHead>}
                  <TableHead>{tGigTypes('vatRate')}</TableHead>
                  <TableHead>{tGigTypes('color')}</TableHead>
                  <TableHead className="text-right">{tGigTypes('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gigTypes.map((type) => (
                  <TableRow key={type.id}>
                    <TableCell className="font-medium">{type.name}</TableCell>
                    {locale !== 'en' && (
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{type.name_en || '-'}</span>
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant="outline">{type.vat_rate}%</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: type.color || '#gray' }} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedGigType(type)
                            setShowEditDialog(true)
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => confirmDelete(type.id)}>
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

      <CreateGigTypeDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      <EditGigTypeDialog
        gigType={selectedGigType}
        open={showEditDialog}
        onOpenChange={(open) => {
          setShowEditDialog(open)
          if (!open) setSelectedGigType(null)
        }}
        onSuccess={() => setRefreshKey((k) => k + 1)}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(open) => {
          setDeleteConfirmOpen(open)
          if (!open) setGigTypeToDelete(null)
        }}
        title={tGigTypes('deleteTitle')}
        description={tGigTypes('deleteDescription')}
        confirmLabel={tc('delete')}
        variant="destructive"
        onConfirm={() => {
          if (gigTypeToDelete) {
            handleDelete(gigTypeToDelete)
          }
          setDeleteConfirmOpen(false)
          setGigTypeToDelete(null)
        }}
      />
    </div>
  )
}
