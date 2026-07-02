'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Eye, Download, Trash2, Loader2, FolderOpen, Search } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { TableSkeleton } from '@/components/skeletons/table-skeleton'
import { format } from 'date-fns'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import {
  type CompanyDocument,
  type DocumentCategory,
  DOCUMENT_CATEGORIES,
  deleteCompanyDocument,
  getCompanyDocuments,
  getDocumentSignedUrl,
} from '@/lib/supabase/document-storage'
import { formatFileSize } from '@/lib/supabase/storage'

const CATEGORY_COLORS: Record<string, string> = {
  annual_report: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  bank_statement: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  tax_authority: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  registration: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  contract: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}

export default function DocumentsTab() {
  const t = useTranslations('documents')
  const tc = useTranslations('common')
  const dateLocale = useDateLocale()
  const [documents, setDocuments] = useState<CompanyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<CompanyDocument | null>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true)
      const docs = await getCompanyDocuments()
      setDocuments(docs)
    } catch {
      toast.error(t('fetchError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      await deleteCompanyDocument(deleteTarget.id, deleteTarget.file_path)
      toast.success(t('deleteSuccess'))
      setDeleteTarget(null)
      fetchDocuments()
    } catch {
      toast.error(t('deleteError'))
    }
  }

  async function handlePreview(doc: CompanyDocument) {
    const url = await getDocumentSignedUrl(doc.file_path)
    if (url) {
      window.open(url, '_blank')
    } else {
      toast.error(t('previewError'))
    }
  }

  async function handleDownload(doc: CompanyDocument) {
    const url = await getDocumentSignedUrl(doc.file_path)
    if (url) {
      const a = document.createElement('a')
      a.href = url
      a.download = doc.file_name
      a.click()
    } else {
      toast.error(t('downloadError'))
    }
  }

  // Filter documents
  const filtered = documents.filter((doc) => {
    if (categoryFilter !== 'all' && doc.category !== categoryFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return doc.file_name.toLowerCase().includes(q) || (doc.description || '').toLowerCase().includes(q)
    }
    return true
  })

  if (loading) {
    return <TableSkeleton rows={5} columns={5} />
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('allCategories')}</SelectItem>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {t(`categories.${cat}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('search')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-48"
          />
        </div>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{t('totalDocuments')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-bold">{documents.length}</p>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {t('allDocuments')} ({filtered.length})
            </span>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{t('noDocuments')}</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('documentDate')}</TableHead>
                  <TableHead>{t('fileName')}</TableHead>
                  <TableHead>{t('category')}</TableHead>
                  <TableHead>{t('description')}</TableHead>
                  <TableHead className="text-right">{t('size')}</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((doc) => (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handlePreview(doc)}
                  >
                    <TableCell className="whitespace-nowrap">
                      {doc.document_date ? format(new Date(doc.document_date), 'PPP', { locale: dateLocale }) : '-'}
                    </TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{doc.file_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={CATEGORY_COLORS[doc.category] || CATEGORY_COLORS.other}>
                        {t(`categories.${doc.category}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate text-muted-foreground">
                      {doc.description || '-'}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">{formatFileSize(doc.file_size)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={tc('download')}
                          title={tc('download')}
                          onClick={() => handleDownload(doc)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={tc('delete')}
                          title={tc('delete')}
                          onClick={() => setDeleteTarget(doc)}
                        >
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

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title={t('deleteTitle')}
        description={t('deleteConfirm')}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  )
}
