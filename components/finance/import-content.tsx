'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useBaseCurrency } from '@/lib/hooks/use-base-currency'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Upload,
  Receipt,
  FileText,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Sparkles,
  History,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { ALLOWED_RECEIPT_TYPES, MAX_FILE_SIZE } from '@/lib/upload/file-validation'

type Step = 'select' | 'review' | 'complete'

type SupplierData = {
  category: string
  currency: string
  count: number
}

type SupplierMapping = Record<string, SupplierData>

type AnalyzedFile = {
  id: string
  file: File
  type: 'expense' | 'invoice'
  confidence: number
  selected: boolean
  data: ExpenseData | InvoiceData
  suggestedFilename: string
  status: 'pending' | 'analyzing' | 'done' | 'error'
  error?: string
  isDuplicate?: boolean
  existingExpense?: {
    id: string
    date: string
    supplier: string
    amount: number
    category: string | null
  }
  usedHistoricalData?: boolean
  historicalMatchCount?: number
  showVatDetails?: boolean
}

type ExpenseData = {
  date: string | null
  supplier: string
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  currency: string
  category: string
  notes?: string
}

type ClientMatchResult = {
  clientId: string | null
  confidence: number
  suggestions: Array<{
    id: string
    name: string
    similarity: number
  }>
}

type InvoiceData = {
  invoiceNumber: number
  clientName: string
  invoiceDate: string
  dueDate: string
  subtotal: number
  vatRate: number
  vatAmount: number
  total: number
  clientMatch?: ClientMatchResult
  selectedClientId?: string | null
}

type ImportResult = {
  fileId: string
  success: boolean
  type: 'expense' | 'invoice'
  id?: string
  filename: string
  error?: string
  skippedAsDuplicate?: boolean
}

import { EXPENSE_CATEGORIES, categoryLabelStatic } from '@/lib/expenses/categories'

const currencies = ['SEK', 'EUR', 'USD', 'GBP', 'DKK', 'NOK']

// Normalisera leverantörsnamn för matchning
function normalizeSupplier(supplier: string): string {
  return supplier
    .toLowerCase()
    .trim()
    .replace(/,?\s*(pbc|inc|ab|ltd|gmbh|as|oy|corp|llc)\.?$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Hitta bästa match i historisk data
function findHistoricalMatch(supplierName: string, mapping: SupplierMapping): SupplierData | null {
  const normalized = normalizeSupplier(supplierName)

  // Exakt match
  if (mapping[normalized]) {
    return mapping[normalized]
  }

  // Partiell match
  for (const [knownSupplier, data] of Object.entries(mapping)) {
    if (normalized.includes(knownSupplier) || knownSupplier.includes(normalized)) {
      return data
    }
  }

  return null
}

export default function ImportPage() {
  const t = useTranslations('expense')
  const tc = useTranslations('common')
  const ti = useTranslations('invoice')
  const locale = useLocale()
  const { symbol: baseCurrencySymbol } = useBaseCurrency()
  const [currentStep, setCurrentStep] = useState<Step>('select')
  const [files, setFiles] = useState<AnalyzedFile[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [supplierMapping, setSupplierMapping] = useState<SupplierMapping>({})
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Hämta leverantörsmappning vid sidladdning
  useEffect(() => {
    async function fetchSupplierMapping() {
      try {
        const response = await fetch('/api/expenses/supplier-categories')
        if (response.ok) {
          const data = await response.json()
          setSupplierMapping(data.mapping || {})
        }
      } catch (err) {
        console.error('Failed to fetch supplier mapping:', err)
      }
    }
    fetchSupplierMapping()
  }, [])

  // Kontrollera dubletter när vi går till review-steget
  const [duplicatesChecked, setDuplicatesChecked] = useState(false)
  useEffect(() => {
    if (currentStep === 'review' && !duplicatesChecked) {
      const analyzedExpenses = files.filter((f) => f.status === 'done' && f.type === 'expense')
      if (analyzedExpenses.length > 0) {
        checkDuplicates()
        setDuplicatesChecked(true)
      }
    }
    // Reset when going back to select
    if (currentStep === 'select') {
      setDuplicatesChecked(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkDuplicates reads from files which is already in deps
  }, [currentStep, files, duplicatesChecked])

  // Beräkna statistik
  const analyzedFiles = files.filter((f) => f.status === 'done')
  const selectedFiles = files.filter((f) => f.selected && f.status === 'done')
  const expenses = selectedFiles.filter((f) => f.type === 'expense')
  const invoices = selectedFiles.filter((f) => f.type === 'invoice')
  const duplicates = selectedFiles.filter((f) => f.isDuplicate)
  const analyzeProgress = files.length > 0 ? Math.round((analyzedFiles.length / files.length) * 100) : 0

  // Hantera filval
  const handleFileSelect = useCallback(
    (selectedFiles: FileList | null) => {
      if (!selectedFiles) return

      const validFiles = Array.from(selectedFiles).filter((file) => {
        if (!ALLOWED_RECEIPT_TYPES.includes(file.type as (typeof ALLOWED_RECEIPT_TYPES)[number])) {
          return false
        }
        if (file.size > MAX_FILE_SIZE) {
          return false
        }
        return true
      })

      if (validFiles.length === 0) {
        setError(t('noValidFilesFound'))
        return
      }

      const newFiles: AnalyzedFile[] = validFiles.map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file,
        type: 'expense',
        confidence: 0,
        selected: true,
        data: {
          date: null,
          supplier: '',
          subtotal: 0,
          vatRate: 25,
          vatAmount: 0,
          total: 0,
          currency: 'SEK',
          category: 'other',
        },
        suggestedFilename: file.name,
        status: 'pending',
      }))

      setFiles(newFiles)
      setError(null)
    },
    [t],
  )

  // Drag & drop handlers
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      handleFileSelect(e.dataTransfer.files)
    },
    [handleFileSelect],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  // Analysera filer med AI
  const analyzeFiles = async () => {
    setAnalyzing(true)
    setError(null)

    const BATCH_SIZE = 3

    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE)

      await Promise.all(
        batch.map(async (file) => {
          setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, status: 'analyzing' as const } : f)))

          try {
            const formData = new FormData()
            formData.append('file', file.file)

            const response = await fetch('/api/import/analyze', {
              method: 'POST',
              body: formData,
            })

            const result = await response.json()

            if (!response.ok) {
              throw new Error(result.error || t('analysisFailed'))
            }

            setFiles((prev) =>
              prev.map((f) => {
                if (f.id !== file.id) return f

                let finalData = result.data
                let usedHistoricalData = false
                let historicalMatchCount = 0

                // Om det är en utgift, försök matcha kategori mot historisk data
                if (result.type === 'expense' && result.data.supplier) {
                  const historicalMatch = findHistoricalMatch(result.data.supplier, supplierMapping)
                  if (historicalMatch) {
                    // Använd historisk kategori (valuta läses från dokumentet)
                    finalData = {
                      ...result.data,
                      category: historicalMatch.category,
                    }
                    usedHistoricalData = true
                    historicalMatchCount = historicalMatch.count
                  }
                }

                // Hantera faktura med klientmatchning
                if (result.type === 'invoice' && result.clientMatch) {
                  finalData = {
                    ...finalData,
                    clientMatch: result.clientMatch,
                    selectedClientId:
                      result.clientMatch.clientId && result.clientMatch.confidence >= 0.85
                        ? result.clientMatch.clientId
                        : undefined,
                  }
                }

                return {
                  ...f,
                  type: result.type,
                  confidence: result.confidence,
                  data: finalData,
                  suggestedFilename: result.suggestedFilename,
                  status: 'done' as const,
                  usedHistoricalData,
                  historicalMatchCount,
                }
              }),
            )
          } catch (err) {
            setFiles((prev) =>
              prev.map((f) =>
                f.id === file.id
                  ? {
                      ...f,
                      status: 'error' as const,
                      error: err instanceof Error ? err.message : t('unknownError'),
                    }
                  : f,
              ),
            )
          }
        }),
      )

      // Small delay between batches to avoid overwhelming the server
      if (i + BATCH_SIZE < files.length) {
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }

    setAnalyzing(false)
    setCurrentStep('review')
  }

  // Kontrollera dubletter mot befintliga utgifter
  const checkDuplicates = async () => {
    const currentFiles = files.filter((f) => f.status === 'done' && f.type === 'expense')
    const expensesToCheck = currentFiles
      .map((f) => {
        const data = f.data as ExpenseData
        return {
          id: f.id,
          date: data.date,
          supplier: data.supplier,
          amount: data.total,
        }
      })
      .filter((e) => e.date && e.supplier && e.amount > 0)

    if (expensesToCheck.length === 0) return

    try {
      const response = await fetch('/api/expenses/check-duplicate', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expenses: expensesToCheck.map((e) => ({
            date: e.date,
            supplier: e.supplier,
            amount: e.amount,
          })),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setFiles((prev) =>
          prev.map((f) => {
            if (f.type !== 'expense' || f.status !== 'done') return f

            const fileData = f.data as ExpenseData
            const matchIndex = expensesToCheck.findIndex(
              (e) => e.date === fileData.date && e.supplier === fileData.supplier && e.amount === fileData.total,
            )

            if (matchIndex >= 0 && data.results[matchIndex]) {
              const dupResult = data.results[matchIndex]
              return {
                ...f,
                isDuplicate: dupResult.isDuplicate,
                existingExpense: dupResult.existingExpense,
                selected: dupResult.isDuplicate ? false : f.selected,
              }
            }
            return f
          }),
        )
      }
    } catch (err) {
      console.error('Duplicate check failed:', err)
    }
  }

  // Uppdatera fil
  const updateFile = (id: string, updates: Partial<AnalyzedFile>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }

  // Uppdatera fildata
  const updateFileData = (id: string, dataUpdates: Partial<ExpenseData | InvoiceData>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, data: { ...f.data, ...dataUpdates } } : f)))
  }

  // Ändra dokumenttyp
  const changeFileType = (id: string, newType: 'expense' | 'invoice') => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== id || f.type === newType) return f

        let newData: ExpenseData | InvoiceData

        if (newType === 'expense') {
          const invoiceData = f.data as InvoiceData
          newData = {
            date: invoiceData.invoiceDate || null,
            supplier: invoiceData.clientName || t('unknownSupplier'),
            subtotal: invoiceData.subtotal || 0,
            vatRate: invoiceData.vatRate || 25,
            vatAmount: invoiceData.vatAmount || 0,
            total: invoiceData.total || 0,
            currency: 'SEK',
            category: 'other',
            notes: t('convertedFromInvoice', { number: invoiceData.invoiceNumber }),
          }
        } else {
          const expenseData = f.data as ExpenseData
          newData = {
            invoiceNumber: 0,
            clientName: expenseData.supplier || t('unknownClient'),
            invoiceDate: expenseData.date || new Date().toISOString().split('T')[0],
            dueDate: expenseData.date || new Date().toISOString().split('T')[0],
            subtotal: expenseData.subtotal || 0,
            vatRate: expenseData.vatRate || 25,
            vatAmount: expenseData.vatAmount || 0,
            total: expenseData.total || 0,
          }
        }

        return {
          ...f,
          type: newType,
          data: newData,
          usedHistoricalData: false,
        }
      }),
    )
  }

  // Importera valda filer
  const handleImport = async () => {
    if (selectedFiles.length === 0) {
      toast.error(t('selectAtLeastOneFile'))
      return
    }

    setImporting(true)
    setError(null)
    setImportResults([])

    try {
      const formData = new FormData()

      const metadata = selectedFiles.map((f) => ({
        id: f.id,
        type: f.type,
        data: f.data,
        suggestedFilename: f.suggestedFilename,
      }))
      formData.append('metadata', JSON.stringify(metadata))
      formData.append('skipDuplicates', 'false')

      selectedFiles.forEach((f) => {
        formData.append(`file_${f.id}`, f.file)
      })

      const response = await fetch('/api/import/batch', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || t('importFailed'))
      }

      setImportResults(result.results)
      setCurrentStep('complete')

      const succeeded = result.summary.succeeded
      const failed = result.summary.failed
      const skipped = result.summary.skipped

      if (succeeded > 0 && failed === 0) {
        toast.success(
          t('importedFiles', { count: succeeded }) + (skipped > 0 ? `, ${t('skippedFiles', { count: skipped })}` : ''),
        )
      } else if (failed > 0) {
        toast.warning(t('importPartialSuccess', { succeeded, failed }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('importFailed'))
      toast.error(t('importFailed'))
    } finally {
      setImporting(false)
    }
  }

  // Återställ
  const handleReset = () => {
    setFiles([])
    setCurrentStep('select')
    setImportResults([])
    setError(null)
  }

  return (
    <div className="container mx-auto py-8 space-y-8 max-w-5xl">
      {/* Progress stepper header */}

      {/* Progress stepper - modern */}
      <div className="flex items-center justify-center gap-4 py-4">
        {[
          { step: 'select', label: t('selectFiles'), num: 1 },
          { step: 'review', label: t('review'), num: 2 },
          { step: 'complete', label: t('done'), num: 3 },
        ].map((item, index) => {
          const isActive = currentStep === item.step
          const isComplete =
            (item.step === 'select' && currentStep !== 'select') ||
            (item.step === 'review' && currentStep === 'complete')

          return (
            <div key={item.step} className="flex items-center">
              {index > 0 && (
                <div
                  className={`w-16 h-0.5 mr-4 transition-colors ${isComplete || isActive ? 'bg-primary' : 'bg-muted'}`}
                />
              )}
              <div className="flex items-center gap-3">
                <div
                  className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold
                  transition-all duration-300
                  ${isComplete ? 'bg-green-500 text-white' : ''}
                  ${isActive ? 'bg-primary text-primary-foreground ring-4 ring-primary/20' : ''}
                  ${!isActive && !isComplete ? 'bg-muted text-muted-foreground' : ''}
                `}
                >
                  {isComplete ? <CheckCircle2 className="h-5 w-5" /> : item.num}
                </div>
                <span className={`text-sm font-medium ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {item.label}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Step 1: Select files - Premium design */}
      {currentStep === 'select' && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div
              className={`
                relative p-16 text-center cursor-pointer transition-all duration-300
                ${isDragging ? 'bg-primary/5 border-primary' : 'hover:bg-muted/50'}
              `}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              {/* Gradient border effect */}
              <div
                className={`
                absolute inset-0 rounded-lg transition-opacity duration-300
                ${isDragging ? 'opacity-100' : 'opacity-0'}
              `}
                style={{
                  background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.5) 100%)',
                  padding: '2px',
                  WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
                  WebkitMaskComposite: 'xor',
                  maskComposite: 'exclude',
                }}
              />

              <div
                className={`
                mx-auto w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-6
                transition-transform duration-300
                ${isDragging ? 'scale-110' : ''}
              `}
              >
                <Upload
                  className={`h-10 w-10 transition-colors ${isDragging ? 'text-primary' : 'text-muted-foreground'}`}
                />
              </div>

              <p className="text-xl font-semibold mb-2">{t('dragAndDropFiles')}</p>
              <p className="text-muted-foreground mb-4">{t('orClickToSelect')}</p>
              <p className="text-sm text-muted-foreground/70">{t('fileFormatsWithSize')}</p>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />
            </div>

            {files.length > 0 && (
              <div className="border-t p-6 bg-muted/30">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t('filesSelected', { count: files.length })}</span>
                    {Object.keys(supplierMapping).length > 0 && (
                      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        <History className="h-3 w-3" />
                        {t('learningFromSuppliers', { count: Object.keys(supplierMapping).length })}
                      </span>
                    )}
                  </div>
                  <Button onClick={analyzeFiles} disabled={analyzing} size="lg">
                    {analyzing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('analyzing')} {analyzeProgress}%
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        {t('analyzeWithAI')}
                      </>
                    )}
                  </Button>
                </div>

                {/* File list with progress */}
                <div className="space-y-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className={`
                        flex items-center gap-3 p-3 rounded-lg transition-all
                        ${file.status === 'analyzing' ? 'bg-primary/5 ring-1 ring-primary/20' : 'bg-background'}
                      `}
                    >
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate text-sm">{file.file.name}</span>
                      <span className="text-xs text-muted-foreground">{(file.file.size / 1024).toFixed(0)} KB</span>
                      {file.status === 'pending' && <div className="w-4 h-4 rounded-full bg-muted" />}
                      {file.status === 'analyzing' && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                      {file.status === 'done' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                      {file.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Review - Inline editing */}
      {currentStep === 'review' && (
        <div className="space-y-6">
          {/* Summary row */}
          <div className="grid grid-cols-4 gap-3">
            <Card className="bg-gradient-to-br from-background to-muted/30">
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">{t('analyzed')}</p>
                <p className="text-3xl font-bold">{analyzedFiles.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 dark:from-orange-950/20 dark:to-orange-900/10">
              <CardContent className="p-4">
                <p className="text-xs text-orange-600 dark:text-orange-400 uppercase tracking-wide flex items-center gap-1">
                  <Receipt className="h-3 w-3" /> {t('expenses')}
                </p>
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{expenses.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10">
              <CardContent className="p-4">
                <p className="text-xs text-blue-600 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1">
                  <FileText className="h-3 w-3" /> {ti('invoices')}
                </p>
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{invoices.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10">
              <CardContent className="p-4">
                <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {t('duplicates')}
                </p>
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{duplicates.length}</p>
              </CardContent>
            </Card>
          </div>

          {/* Inline editable file cards */}
          <div className="space-y-3">
            {files
              .filter((f) => f.status === 'done')
              .map((file) => (
                <Card
                  key={file.id}
                  className={`
                  transition-all duration-200 overflow-hidden
                  ${!file.selected ? 'opacity-50' : ''}
                  ${file.isDuplicate ? 'ring-1 ring-amber-300' : ''}
                `}
                >
                  <div className="p-4">
                    {/* Top row: checkbox, type, filename, badges, delete */}
                    <div className="flex items-center gap-3 mb-3">
                      <Checkbox
                        checked={file.selected}
                        onCheckedChange={(checked) => updateFile(file.id, { selected: !!checked })}
                      />

                      <Select
                        value={file.type}
                        onValueChange={(value: 'expense' | 'invoice') => changeFileType(file.id, value)}
                      >
                        <SelectTrigger
                          className={`
                        h-7 w-24 text-xs font-semibold border-0
                        ${
                          file.type === 'expense'
                            ? 'bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
                            : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400'
                        }
                      `}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">{t('expenseType')}</SelectItem>
                          <SelectItem value="invoice">{t('invoiceType')}</SelectItem>
                        </SelectContent>
                      </Select>

                      <span className="text-sm font-medium truncate flex-1">{file.file.name}</span>

                      <div className="flex items-center gap-2">
                        {/* Confidence badge */}
                        <span
                          className={`
                        text-xs px-2 py-0.5 rounded-full
                        ${
                          file.confidence >= 0.9
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : file.confidence >= 0.7
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }
                      `}
                        >
                          {Math.round(file.confidence * 100)}% {t('confident')}
                        </span>

                        {/* Historical data badge */}
                        {file.usedHistoricalData && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <History className="h-3 w-3" />
                            {t('basedOnPrevious', { count: file.historicalMatchCount ?? 0 })}
                          </span>
                        )}

                        {/* Duplicate badge */}
                        {file.isDuplicate && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            {t('duplicate')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Duplicate warning with action buttons */}
                    {file.isDuplicate && file.existingExpense && (
                      <div className="ml-8 mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                {t('expenseAlreadyExists')}
                              </p>
                              <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                {file.existingExpense.supplier} - {file.existingExpense.amount.toLocaleString('sv-SE')}{' '}
                                {baseCurrencySymbol} ({file.existingExpense.date})
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-7 text-xs ${file.selected ? 'bg-amber-100 border-amber-300' : ''}`}
                              onClick={() => updateFile(file.id, { selected: true })}
                            >
                              {t('importAnyway')}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className={`h-7 text-xs ${!file.selected ? 'bg-muted' : ''}`}
                              onClick={() => updateFile(file.id, { selected: false })}
                            >
                              {t('skip')}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Inline editable fields */}
                    {file.type === 'expense' ? (
                      <div className="ml-8 space-y-3">
                        {/* Main row: 4 columns */}
                        <div className="grid grid-cols-[120px_1fr_180px_160px] gap-3 items-end">
                          <div>
                            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                              {t('date')}
                            </label>
                            <Input
                              type="date"
                              value={(file.data as ExpenseData).date || ''}
                              onChange={(e) => updateFileData(file.id, { date: e.target.value })}
                              className="h-9 mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                              {t('supplier')}
                            </label>
                            <Input
                              value={(file.data as ExpenseData).supplier}
                              onChange={(e) => updateFileData(file.id, { supplier: e.target.value })}
                              placeholder={t('supplier')}
                              className="h-9 mt-1"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                              {t('amount')}
                            </label>
                            <div className="flex items-center gap-2 mt-1">
                              <Input
                                type="number"
                                step="0.01"
                                value={(file.data as ExpenseData).total}
                                onChange={(e) => {
                                  const total = parseFloat(e.target.value) || 0
                                  const vatRate = (file.data as ExpenseData).vatRate
                                  const subtotal = Math.round((total / (1 + vatRate / 100)) * 100) / 100
                                  const vatAmount = Math.round((total - subtotal) * 100) / 100
                                  updateFileData(file.id, { total, subtotal, vatAmount })
                                }}
                                className="h-9 font-mono text-sm"
                              />
                              <span className="text-sm text-muted-foreground font-medium w-10">
                                {(file.data as ExpenseData).currency}
                              </span>
                            </div>
                          </div>
                          <div>
                            <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                              {t('category')}
                            </label>
                            <Select
                              value={(file.data as ExpenseData).category}
                              onValueChange={(value) => updateFileData(file.id, { category: value })}
                            >
                              <SelectTrigger className="h-9 mt-1">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EXPENSE_CATEGORIES.map((c) => (
                                  <SelectItem key={c} value={c}>
                                    {categoryLabelStatic(c, locale as 'sv' | 'en')}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Toggle button for VAT details */}
                        <button
                          type="button"
                          onClick={() => updateFile(file.id, { showVatDetails: !file.showVatDetails })}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {file.showVatDetails ? (
                            <>
                              <ChevronUp className="h-3.5 w-3.5" />
                              {t('hideVatDetails')}
                            </>
                          ) : (
                            <>
                              <ChevronDown className="h-3.5 w-3.5" />
                              {t('showVatDetails')}
                            </>
                          )}
                        </button>

                        {/* Expandable VAT details section */}
                        {file.showVatDetails && (
                          <div className="grid grid-cols-4 gap-3 p-3 rounded-lg bg-muted/50 border">
                            <div>
                              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                                {t('currency')}
                              </label>
                              <Select
                                value={(file.data as ExpenseData).currency}
                                onValueChange={(value) => updateFileData(file.id, { currency: value })}
                              >
                                <SelectTrigger className="h-9 mt-1 bg-background">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {currencies.map((c) => (
                                    <SelectItem key={c} value={c}>
                                      {c}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                                {t('net')}
                              </label>
                              <Input
                                type="number"
                                step="0.01"
                                value={(file.data as ExpenseData).subtotal}
                                onChange={(e) => {
                                  const subtotal = parseFloat(e.target.value) || 0
                                  const vatRate = (file.data as ExpenseData).vatRate
                                  const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100
                                  updateFileData(file.id, { subtotal, vatAmount, total: subtotal + vatAmount })
                                }}
                                className="h-9 mt-1 font-mono text-sm bg-background"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                                {t('vatRate')}
                              </label>
                              <Select
                                value={(file.data as ExpenseData).vatRate.toString()}
                                onValueChange={(value) => {
                                  const vatRate = parseInt(value)
                                  const subtotal = (file.data as ExpenseData).subtotal
                                  const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100
                                  updateFileData(file.id, { vatRate, vatAmount, total: subtotal + vatAmount })
                                }}
                              >
                                <SelectTrigger className="h-9 mt-1 bg-background">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="0">0%</SelectItem>
                                  <SelectItem value="6">6%</SelectItem>
                                  <SelectItem value="12">12%</SelectItem>
                                  <SelectItem value="25">25%</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                                {t('vatAmount')}
                              </label>
                              <Input
                                type="number"
                                step="0.01"
                                value={(file.data as ExpenseData).vatAmount}
                                disabled
                                className="h-9 mt-1 font-mono text-sm bg-muted cursor-not-allowed"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-6 gap-3 ml-8">
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            {ti('invoiceNumberShort')}
                          </label>
                          <Input
                            type="number"
                            value={(file.data as InvoiceData).invoiceNumber}
                            onChange={(e) => updateFileData(file.id, { invoiceNumber: parseInt(e.target.value) || 0 })}
                            className="h-9 mt-1 font-mono"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            {ti('customer')}
                          </label>
                          <Input
                            value={(file.data as InvoiceData).clientName}
                            onChange={(e) => updateFileData(file.id, { clientName: e.target.value })}
                            placeholder={ti('customer')}
                            className="h-9 mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            {t('date')}
                          </label>
                          <Input
                            type="date"
                            value={(file.data as InvoiceData).invoiceDate || ''}
                            onChange={(e) => updateFileData(file.id, { invoiceDate: e.target.value })}
                            className="h-9 mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            {ti('dueDate')}
                          </label>
                          <Input
                            type="date"
                            value={(file.data as InvoiceData).dueDate || ''}
                            onChange={(e) => updateFileData(file.id, { dueDate: e.target.value })}
                            className="h-9 mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                            {tc('total')}
                          </label>
                          <Input
                            type="number"
                            step="0.01"
                            value={(file.data as InvoiceData).total}
                            onChange={(e) => updateFileData(file.id, { total: parseFloat(e.target.value) || 0 })}
                            className="h-9 mt-1 font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              ))}

            {/* Error files */}
            {files.filter((f) => f.status === 'error').length > 0 && (
              <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
                <CardContent className="p-4">
                  <h4 className="text-sm font-medium text-red-700 dark:text-red-400 mb-2">{t('couldNotAnalyze')}:</h4>
                  {files
                    .filter((f) => f.status === 'error')
                    .map((file) => (
                      <p key={file.id} className="text-sm text-red-600 dark:text-red-400">
                        {file.file.name}: {file.error}
                      </p>
                    ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-between pt-4">
            <Button variant="outline" onClick={handleReset}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              {t('startOver')}
            </Button>
            <Button onClick={handleImport} disabled={importing || selectedFiles.length === 0} size="lg">
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('importing')}
                </>
              ) : (
                <>
                  {t('importFiles', { count: selectedFiles.length })}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Complete - Celebration */}
      {currentStep === 'complete' && (
        <Card className="text-center overflow-hidden">
          <CardContent className="pt-12 pb-8">
            {/* Success animation */}
            <div className="relative inline-flex mb-6">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center animate-bounce">
                <Sparkles className="h-3 w-3 text-white" />
              </div>
            </div>

            <h2 className="text-2xl font-bold mb-2">{t('importComplete')}</h2>
            <p className="text-muted-foreground mb-8">
              {t('importCompleteDescription', {
                succeeded: importResults.filter((r) => r.success).length,
                total: importResults.length,
              })}
            </p>

            {/* Results list */}
            <div className="max-w-md mx-auto space-y-2 mb-8 text-left">
              {importResults.map((result) => (
                <div
                  key={result.fileId}
                  className={`
                    flex items-center gap-3 p-3 rounded-lg
                    ${result.success ? 'bg-green-50 dark:bg-green-950/20' : result.skippedAsDuplicate ? 'bg-amber-50 dark:bg-amber-950/20' : 'bg-red-50 dark:bg-red-950/20'}
                  `}
                >
                  {result.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : result.skippedAsDuplicate ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  )}
                  <span className="text-sm truncate flex-1">{result.filename}</span>
                  {result.skippedAsDuplicate && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">{t('duplicate')}</span>
                  )}
                  {result.error && <span className="text-xs text-red-600 dark:text-red-400">{result.error}</span>}
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex justify-center gap-3">
              <Button onClick={handleReset} size="lg">
                <Upload className="mr-2 h-4 w-4" />
                {t('importMore')}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/expenses">
                  <Receipt className="mr-2 h-4 w-4" />
                  {t('viewExpenses')}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/finance">
                  <FileText className="mr-2 h-4 w-4" />
                  {t('viewInvoices')}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
