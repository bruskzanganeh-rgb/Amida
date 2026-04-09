'use client'

import { useState, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Loader2, Upload, FileSpreadsheet, Trash2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'

type ImportClientRow = {
  name: string
  org_number?: string
  email?: string
  address?: string
  payment_terms?: number
  reference_person?: string
  client_code?: string
  notes?: string
}

type ImportClientsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const COLUMN_MAP: Record<string, keyof ImportClientRow> = {
  // Swedish
  namn: 'name',
  kund: 'name',
  kundnamn: 'name',
  'org.nummer': 'org_number',
  orgnummer: 'org_number',
  organisationsnummer: 'org_number',
  'e-post': 'email',
  epost: 'email',
  mail: 'email',
  adress: 'address',
  betalningsvillkor: 'payment_terms',
  referens: 'reference_person',
  referensperson: 'reference_person',
  kundkod: 'client_code',
  kod: 'client_code',
  anteckningar: 'notes',
  noteringar: 'notes',
  // English
  name: 'name',
  client: 'name',
  'client name': 'name',
  'org number': 'org_number',
  org_number: 'org_number',
  'organization number': 'org_number',
  email: 'email',
  address: 'address',
  'payment terms': 'payment_terms',
  payment_terms: 'payment_terms',
  reference: 'reference_person',
  'reference person': 'reference_person',
  reference_person: 'reference_person',
  'client code': 'client_code',
  client_code: 'client_code',
  code: 'client_code',
  notes: 'notes',
}

function detectDelimiter(text: string): string {
  const firstLine = text.split('\n')[0]
  const tabCount = (firstLine.match(/\t/g) || []).length
  const semicolonCount = (firstLine.match(/;/g) || []).length
  const commaCount = (firstLine.match(/,/g) || []).length

  if (tabCount > 0 && tabCount >= commaCount && tabCount >= semicolonCount) return '\t'
  if (semicolonCount > 0 && semicolonCount >= commaCount) return ';'
  return ','
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())
  return result
}

function parsePastedData(text: string): { rows: ImportClientRow[]; errors: string[] } {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length === 0) return { rows: [], errors: [] }

  const delimiter = detectDelimiter(text)
  const headerLine = parseCSVLine(lines[0], delimiter)
  const errors: string[] = []

  // Try to map columns
  const columnMapping: (keyof ImportClientRow | null)[] = headerLine.map((h) => {
    const normalized = h.toLowerCase().trim()
    return COLUMN_MAP[normalized] || null
  })

  const hasNameColumn = columnMapping.includes('name')

  // If no recognized header, treat first column as name
  if (!hasNameColumn) {
    // Check if first line looks like data (not a header)
    const looksLikeHeader = headerLine.some((h) => {
      const n = h.toLowerCase().trim()
      return n in COLUMN_MAP
    })

    if (!looksLikeHeader) {
      // No header detected - treat as single-column name list
      const rows: ImportClientRow[] = lines
        .map((line) => ({ name: parseCSVLine(line, delimiter)[0] }))
        .filter((r) => r.name.length > 0)
      return { rows, errors }
    }
  }

  // Parse data rows using header mapping
  const rows: ImportClientRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i], delimiter)
    const row: ImportClientRow = { name: '' }

    columnMapping.forEach((field, colIdx) => {
      if (field && values[colIdx]) {
        if (field === 'payment_terms') {
          const num = parseInt(values[colIdx])
          if (!isNaN(num)) row.payment_terms = num
        } else {
          ;(row as Record<string, string | number | undefined>)[field] = values[colIdx]
        }
      }
    })

    if (!row.name) {
      // If no name column mapped, use first column
      if (values[0]) row.name = values[0]
    }

    if (row.name) {
      rows.push(row)
    } else {
      errors.push(`Rad ${i + 1}: Namn saknas`)
    }
  }

  return { rows, errors }
}

export function ImportClientsDialog({ open, onOpenChange, onSuccess }: ImportClientsDialogProps) {
  const [step, setStep] = useState<'paste' | 'preview'>('paste')
  const [pastedText, setPastedText] = useState('')
  const [parsedRows, setParsedRows] = useState<ImportClientRow[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const supabase = createClient()
  const t = useTranslations('client')
  const tc = useTranslations('common')

  const reset = useCallback(() => {
    setStep('paste')
    setPastedText('')
    setParsedRows([])
    setParseErrors([])
  }, [])

  function handleParse() {
    const { rows, errors } = parsePastedData(pastedText)
    setParsedRows(rows)
    setParseErrors(errors)
    if (rows.length > 0) {
      setStep('preview')
    } else {
      toast.error(t('importNoValidRows'))
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      setPastedText(text)
      const { rows, errors } = parsePastedData(text)
      setParsedRows(rows)
      setParseErrors(errors)
      if (rows.length > 0) {
        setStep('preview')
      } else {
        toast.error(t('importNoValidRows'))
      }
    }
    reader.readAsText(file)
    // Reset file input
    e.target.value = ''
  }

  function removeRow(index: number) {
    setParsedRows((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleImport() {
    if (parsedRows.length === 0) return

    setImporting(true)

    const insertData = parsedRows.map((row) => ({
      name: row.name,
      org_number: row.org_number || null,
      email: row.email || null,
      address: row.address || null,
      payment_terms: row.payment_terms || 30,
      reference_person: row.reference_person || null,
      client_code: row.client_code || null,
      notes: row.notes || null,
    }))

    const { error } = await supabase.from('clients').insert(insertData)

    setImporting(false)

    if (error) {
      console.error('Import error:', error)
      toast.error(t('importError'))
    } else {
      toast.success(t('importSuccess', { count: parsedRows.length }))
      onSuccess()
      onOpenChange(false)
      reset()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) reset()
      }}
    >
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            {t('importClients')}
          </DialogTitle>
          <DialogDescription>{t('importDescription')}</DialogDescription>
        </DialogHeader>

        {step === 'paste' && (
          <div className="space-y-4 flex-1 overflow-y-auto">
            <div className="space-y-2">
              <Textarea
                placeholder={t('importPlaceholder')}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                rows={10}
                className="font-mono text-xs"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{t('importOrUpload')}</span>
              <Button variant="outline" size="sm" asChild>
                <label className="cursor-pointer">
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  {t('importUploadCSV')}
                  <input type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFileUpload} />
                </label>
              </Button>
            </div>

            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">{t('importFormatHint')}</p>
              <p>{t('importFormatColumns')}</p>
              <code className="block mt-1 text-[11px] bg-muted p-2 rounded">
                Namn;Org.nummer;E-post;Adress;Betalningsvillkor
                <br />
                Kungliga Filharmonikerna;802005-8915;faktura@konserthuset.se;Stockholm;30
                <br />
                Göteborgs Symfoniker;556100-8445;ekon@gso.se;Göteborg;20
              </code>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="flex-1 overflow-y-auto space-y-3">
            {parseErrors.length > 0 && (
              <div className="rounded-md bg-destructive/10 p-3 text-sm space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  {t('importWarnings')}
                </div>
                {parseErrors.map((err, i) => (
                  <p key={i} className="text-xs text-destructive/80">
                    {err}
                  </p>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between">
              <Badge variant="secondary">{t('importRowCount', { count: parsedRows.length })}</Badge>
              <Button variant="ghost" size="sm" onClick={() => setStep('paste')}>
                {t('importEditData')}
              </Button>
            </div>

            <div className="border rounded-md overflow-auto max-h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">{t('name')}</TableHead>
                    <TableHead>{t('orgNumber')}</TableHead>
                    <TableHead>{t('email')}</TableHead>
                    <TableHead>{t('address')}</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium text-sm">{row.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.org_number || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{row.email || '-'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate max-w-[150px]">
                        {row.address || '-'}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeRow(i)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false)
              reset()
            }}
            disabled={importing}
          >
            {tc('cancel')}
          </Button>
          {step === 'paste' ? (
            <Button onClick={handleParse} disabled={!pastedText.trim()}>
              {t('importPreview')}
            </Button>
          ) : (
            <Button onClick={handleImport} disabled={importing || parsedRows.length === 0}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('importButton', { count: parsedRows.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
