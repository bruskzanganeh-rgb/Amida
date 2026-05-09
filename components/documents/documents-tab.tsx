'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Upload, FileText, Trash2, Download, Eye, Loader2, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  type CompanyDocument,
  type DocumentCategory,
  DOCUMENT_CATEGORIES,
  uploadCompanyDocument,
  deleteCompanyDocument,
  getCompanyDocuments,
  getDocumentSignedUrl,
} from '@/lib/supabase/document-storage'
import { formatFileSize } from '@/lib/supabase/storage'
import { isValidReceiptFile } from '@/lib/upload/file-validation'

const CATEGORY_COLORS: Record<DocumentCategory, string> = {
  annual_report: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  bank_statement: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  tax_authority: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  registration: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  contract: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  other: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
}

export default function DocumentsTab() {
  const t = useTranslations('documents')
  const [documents, setDocuments] = useState<CompanyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<CompanyDocument | null>(null)

  // Upload form state
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('other')
  const [uploadDescription, setUploadDescription] = useState('')
  const [uploadDate, setUploadDate] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true)
      const filter = categoryFilter === 'all' ? undefined : (categoryFilter as DocumentCategory)
      const docs = await getCompanyDocuments(filter)
      setDocuments(docs)
    } catch {
      toast.error(t('fetchError'))
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, t])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  async function handleUpload() {
    if (!uploadFile) return
    setUploading(true)
    try {
      await uploadCompanyDocument(uploadFile, uploadCategory, uploadDescription, uploadDate || undefined)
      toast.success(t('uploadSuccess'))
      setShowUploadDialog(false)
      resetUploadForm()
      fetchDocuments()
    } catch (err) {
      const message =
        err instanceof Error && err.message === 'STORAGE_QUOTA_EXCEEDED' ? t('quotaExceeded') : t('uploadError')
      toast.error(message)
    } finally {
      setUploading(false)
    }
  }

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

  function resetUploadForm() {
    setUploadFile(null)
    setUploadCategory('other')
    setUploadDescription('')
    setUploadDate('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const validation = isValidReceiptFile(file)
    if (!validation.valid) {
      toast.error(validation.error)
      return
    }
    setUploadFile(file)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
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
        <Button size="sm" onClick={() => setShowUploadDialog(true)}>
          <Upload className="h-4 w-4 mr-2" />
          {t('upload')}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : documents.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">{t('noDocuments')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="secondary" className={CATEGORY_COLORS[doc.category as DocumentCategory]}>
                        {t(`categories.${doc.category}`)}
                      </Badge>
                      {doc.description && <span className="truncate">{doc.description}</span>}
                      {doc.document_date && <span>{new Date(doc.document_date).toLocaleDateString('sv-SE')}</span>}
                      <span>{formatFileSize(doc.file_size)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => handlePreview(doc)} title={t('preview')}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)} title={t('download')}>
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(doc)} title={t('delete')}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('uploadDocument')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('file')}</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                onChange={handleFileChange}
              />
            </div>
            <div>
              <Label>{t('category')}</Label>
              <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v as DocumentCategory)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {t(`categories.${cat}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('description')}</Label>
              <Textarea
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder={t('optionalDescription')}
                rows={2}
              />
            </div>
            <div>
              <Label>{t('documentDate')}</Label>
              <Input type="date" value={uploadDate} onChange={(e) => setUploadDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowUploadDialog(false)
                resetUploadForm()
              }}
            >
              {t('cancel')}
            </Button>
            <Button onClick={handleUpload} disabled={!uploadFile || uploading}>
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('upload')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
