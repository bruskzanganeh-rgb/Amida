'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database, Json } from '@/lib/types/supabase'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Paperclip, Upload, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import { GigAttachments } from './gig-attachments'
import { uploadGigAttachment } from '@/lib/supabase/storage'
import { GigReceipts } from './gig-receipts'
import { MultiDayDatePicker } from '@/components/ui/multi-day-date-picker'
import { format } from 'date-fns'
import { SUPPORTED_CURRENCIES, type SupportedCurrency, getRate } from '@/lib/currency/exchange'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/lib/hooks/use-media-query'
import { CreateClientDialog } from '@/components/clients/create-client-dialog'
import { CreateGigTypeDialog } from '@/components/gig-types/create-gig-type-dialog'

type Gig = {
  id: string
  date: string
  start_date: string | null
  end_date: string | null
  total_days: number
  venue: string | null
  fee: number | null
  travel_expense: number | null
  project_name: string | null
  status: string
  notes?: string | null
  invoice_notes?: string | null
  response_deadline?: string | null
  client_id: string | null
  gig_type_id: string
  position_id?: string | null
  currency?: string | null
  exchange_rate?: number | null
  client: { name: string } | null
  gig_type: { name: string } | null
}

type Client = { id: string; name: string }
type GigType = { id: string; name: string; vat_rate: number }
type Position = { id: string; name: string }

type InitialValues = {
  client_id?: string
  gig_type_id?: string
  position_id?: string
  fee?: string
  currency?: string
  venue?: string
  project_name?: string
}

type GigDialogProps = {
  gig: Gig | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  onCreated?: (gigId: string) => void
  initialDate?: Date
  initialValues?: InitialValues
}

const defaultFormData = {
  client_id: '',
  gig_type_id: '',
  position_id: '',
  fee: '',
  travel_expense: '',
  currency: 'SEK' as string,
  venue: '',
  project_name: '',
  notes: '',
  invoice_notes: '',
  status: 'pending',
  response_deadline: '',
}

export function GigDialog({
  gig,
  open,
  onOpenChange,
  onSuccess,
  onCreated,
  initialDate,
  initialValues,
}: GigDialogProps) {
  const t = useTranslations('gig')
  const tc = useTranslations('common')
  const tStatus = useTranslations('status')
  const tToast = useTranslations('toast')
  const isEditing = gig !== null
  const isLg = useMediaQuery('(min-width: 1024px)')
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [gigTypes, setGigTypes] = useState<GigType[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const [formData, setFormData] = useState({ ...defaultFormData })
  const [baseCurrency, setBaseCurrency] = useState<SupportedCurrency>('SEK')
  const [scheduleTexts, setScheduleTexts] = useState<Record<string, string>>({})
  const [dateVenues, setDateVenues] = useState<Record<string, string>>({}) // per-date venue overrides (yyyy-MM-dd → venue)
  const [parsedSessions, setParsedSessions] = useState<
    Record<string, { start: string; end: string | null; label?: string }[]>
  >({})
  const [parsingSessions, setParsingSessions] = useState<Record<string, boolean>>({})
  const [scanningSchedule, setScanningSchedule] = useState(false)
  const [scheduleFile, setScheduleFile] = useState<File | null>(null)
  const scheduleFileRef = useRef<HTMLInputElement>(null)
  const [dateEntryMode, setDateEntryMode] = useState<'choose' | 'manual' | 'import'>('choose')
  const [draftGigId, setDraftGigId] = useState<string | null>(null)
  const [manualExchangeRate, setManualExchangeRate] = useState<string>('')
  const [showCreateClient, setShowCreateClient] = useState(false)
  const [showCreateGigType, setShowCreateGigType] = useState(false)
  const [showCreatePosition, setShowCreatePosition] = useState(false)
  const [newPositionName, setNewPositionName] = useState('')
  const [creatingPosition, setCreatingPosition] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const supabase = createClient()

  // The effective gig ID — either the existing gig or the draft
  const effectiveGigId = isEditing ? gig.id : draftGigId

  // Create draft gig when dialog opens in create mode
  const createDraft = useCallback(async () => {
    try {
      const res = await fetch('/api/gigs/draft', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setDraftGigId(data.id)
      }
    } catch (err) {
      console.error('Failed to create draft:', err)
      toast.error(tToast('draftCreateError'))
    }
  }, [tToast])

  // Delete draft gig on cancel
  const deleteDraft = useCallback(async (id: string) => {
    try {
      await fetch(`/api/gigs/draft?id=${id}`, { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to delete draft:', err)
    }
  }, [])

  // Load clients, gig types and positions when dialog opens
  useEffect(() => {
    if (open) {
      setStep(1)
      loadClients()
      loadGigTypes()
      loadPositions()
      loadBaseCurrency()

      // Always reset schedule file state when dialog opens (prevents re-upload on edit)
      setScheduleFile(null)

      setManualExchangeRate('')

      // Reset date entry mode — skip chooser for edit or when a date is pre-selected
      setDateEntryMode(gig ? 'manual' : 'choose')

      // Reset form for create mode
      if (!gig) {
        setFormData({
          ...defaultFormData,
          ...(initialValues
            ? {
                client_id: initialValues.client_id || '',
                gig_type_id: initialValues.gig_type_id || '',
                position_id: initialValues.position_id || '',
                fee: initialValues.fee || '',
                currency: initialValues.currency || 'SEK',
                venue: initialValues.venue || '',
                project_name: initialValues.project_name || '',
              }
            : {}),
        })
        setSelectedDates(initialDate ? [initialDate] : [])
        setScheduleTexts({})
        setDateVenues({})
        setParsedSessions({})
        setParsingSessions({})
        createDraft()
      }
    } else {
      // Dialog closing — clean up draft if it still exists
      if (draftGigId) {
        deleteDraft(draftGigId)
        setDraftGigId(null)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs only when dialog opens/closes; loader fns and form values are intentionally excluded to avoid re-triggering
  }, [open])

  // Populate form when gig changes (edit mode)
  useEffect(() => {
    if (gig && open) {
      setFormData({
        client_id: gig.client_id || '',
        gig_type_id: gig.gig_type_id || '',
        position_id: gig.position_id || '',
        fee: gig.fee?.toString() || '',
        travel_expense: gig.travel_expense?.toString() || '',
        currency: gig.currency || 'SEK',
        venue: gig.venue || '',
        project_name: gig.project_name || '',
        notes: gig.notes || '',
        invoice_notes: gig.invoice_notes || '',
        status: gig.status || 'pending',
        response_deadline: gig.response_deadline || '',
      })

      // Pre-populate exchange rate if editing a foreign currency gig
      if (gig.exchange_rate && gig.exchange_rate !== 1) {
        setManualExchangeRate(gig.exchange_rate.toString())
      } else {
        setManualExchangeRate('')
      }

      // Load gig dates
      loadGigDates(gig.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadGigDates is stable; only re-run when gig or open changes
  }, [gig, open])

  async function loadClients() {
    const { data } = await supabase.from('clients').select('id, name').order('name')
    setClients(data || [])
  }

  async function loadGigTypes() {
    const { data } = await supabase.from('gig_types').select('id, name, vat_rate').order('name')
    setGigTypes(data || [])
  }

  async function loadPositions() {
    const { data } = await supabase.from('positions').select('id, name').order('sort_order')
    setPositions(data || [])
  }

  async function loadBaseCurrency() {
    const { data: membership } = await supabase.from('company_members').select('company_id').limit(1).single()
    if (membership) {
      const { data } = await supabase.from('companies').select('base_currency').eq('id', membership.company_id).single()
      if (data?.base_currency) {
        setBaseCurrency(data.base_currency as SupportedCurrency)
        if (!gig) {
          setFormData((f) => ({ ...f, currency: data.base_currency! }))
        }
      }
    }
  }

  async function handleCreatePosition() {
    if (!newPositionName.trim()) return
    setCreatingPosition(true)
    const { data: created, error } = await supabase
      .from('positions')
      .insert([{ name: newPositionName.trim() }])
      .select('id')
      .single()
    setCreatingPosition(false)
    if (error) {
      toast.error(tToast('createError'))
    } else if (created) {
      await loadPositions()
      setFormData((f) => ({ ...f, position_id: created.id }))
      setNewPositionName('')
      setShowCreatePosition(false)
    }
  }

  async function loadGigDates(gigId: string) {
    const { data } = await supabase
      .from('gig_dates')
      .select('date, schedule_text, sessions, venue')
      .eq('gig_id', gigId)
      .order('date')

    if (data && data.length > 0) {
      const dates = data.map((d) => new Date(d.date + 'T12:00:00'))
      setSelectedDates(dates)

      // Load schedule texts, existing parsed sessions, and per-date venues
      const texts: Record<string, string> = {}
      const sessions: Record<string, { start: string; end: string | null; label?: string }[]> = {}
      const venues: Record<string, string> = {}
      data.forEach((d) => {
        if (d.schedule_text) texts[d.date] = d.schedule_text
        if (d.sessions && Array.isArray(d.sessions) && d.sessions.length > 0) {
          sessions[d.date] = d.sessions as { start: string; end: string | null; label?: string }[]
        }
        if (d.venue) venues[d.date] = d.venue
      })
      setScheduleTexts(texts)
      setParsedSessions(sessions)
      setDateVenues(venues)
    } else {
      // Fallback to start_date if no gig_dates
      if (gig?.start_date) {
        setSelectedDates([new Date(gig.start_date + 'T12:00:00')])
      }
      setScheduleTexts({})
      setDateVenues({})
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (selectedDates.length === 0) {
      toast.warning(t('selectDate'))
      return
    }

    const needsClient = ['completed', 'invoiced', 'paid'].includes(formData.status)
    if (needsClient && (!formData.client_id || formData.client_id === 'none')) {
      toast.warning(t('clientRequired'))
      return
    }

    setLoading(true)

    // Sort dates
    const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime())

    // Use first date for the main date field
    const primaryDate = sortedDates[0]
    const dateTime = `${format(primaryDate, 'yyyy-MM-dd')}T00:00:00`

    // Calculate start and end dates
    const startDate = format(sortedDates[0], 'yyyy-MM-dd')
    const endDate = format(sortedDates[sortedDates.length - 1], 'yyyy-MM-dd')

    const fee = formData.fee ? parseFloat(formData.fee) : null
    const travelExpense = formData.travel_expense ? parseFloat(formData.travel_expense) : null
    const currency = (formData.currency || baseCurrency) as SupportedCurrency

    // Identify unparsed schedule texts early for parallel fetch
    const unparsedEntries = Object.entries(scheduleTexts)
      .filter(([date, text]) => text.trim() && !parsedSessions[date])
      .map(([date, text]) => ({ date, text }))

    // Parallelize exchange rate + schedule parsing (independent network calls)
    const [exchangeResult, finalSessions] = await Promise.all([
      // Exchange rate
      (async () => {
        if (currency !== baseCurrency && (fee || travelExpense)) {
          // Use manual exchange rate if provided
          const manualRate = manualExchangeRate ? parseFloat(manualExchangeRate) : null
          if (manualRate && manualRate > 0) {
            return {
              exchangeRate: manualRate,
              feeBase: fee ? Math.round(fee * manualRate * 100) / 100 : fee,
              travelExpenseBase: travelExpense ? Math.round(travelExpense * manualRate * 100) / 100 : travelExpense,
            }
          }
          try {
            const rate = await getRate(currency, baseCurrency, startDate)
            setManualExchangeRate(rate.toString())
            return {
              exchangeRate: rate,
              feeBase: fee ? Math.round(fee * rate * 100) / 100 : fee,
              travelExpenseBase: travelExpense ? Math.round(travelExpense * rate * 100) / 100 : travelExpense,
            }
          } catch {
            toast.error(tToast('exchangeRateError'))
            setLoading(false)
            return null
          }
        }
        return { exchangeRate: 1.0, feeBase: fee, travelExpenseBase: travelExpense }
      })(),
      // Schedule parsing
      (async () => {
        if (unparsedEntries.length > 0) {
          try {
            const res = await fetch('/api/gigs/parse-schedule', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ entries: unparsedEntries }),
            })
            if (res.ok) {
              const data = await res.json()
              return { ...parsedSessions, ...(data.sessions || {}) }
            }
          } catch (err) {
            console.error('Schedule parse error:', err)
            toast.warning(tToast('scheduleParseError'))
          }
        }
        return { ...parsedSessions }
      })(),
    ])

    // If exchange rate fetch failed (null result), abort save
    if (!exchangeResult) return

    const { exchangeRate, feeBase, travelExpenseBase } = exchangeResult

    const gigData = {
      client_id: formData.client_id && formData.client_id !== 'none' ? formData.client_id : null,
      gig_type_id: formData.gig_type_id,
      position_id: formData.position_id && formData.position_id !== 'none' ? formData.position_id : null,
      date: dateTime,
      start_date: startDate,
      end_date: endDate,
      total_days: sortedDates.length,
      fee,
      travel_expense: travelExpense,
      currency,
      fee_base: feeBase,
      travel_expense_base: travelExpenseBase,
      exchange_rate: exchangeRate,
      venue: formData.venue || null,
      project_name: formData.project_name || null,
      notes: formData.notes || null,
      invoice_notes: formData.invoice_notes || null,
      status: formData.status as Database['public']['Enums']['gig_status'],
      response_deadline: formData.response_deadline || null,
    }

    // Build gig_dates with schedule data
    function buildGigDates(gigId: string) {
      return sortedDates.map((date) => {
        const key = format(date, 'yyyy-MM-dd')
        return {
          gig_id: gigId,
          date: key,
          schedule_text: scheduleTexts[key] || null,
          sessions: (finalSessions[key] || []) as Json,
          venue: dateVenues[key] || null, // per-date venue override
        }
      })
    }

    if (isEditing) {
      // Update existing gig
      const { error } = await supabase.from('gigs').update(gigData).eq('id', gig.id)

      if (error) {
        setLoading(false)
        console.error('Error updating gig:', error)
        toast.error(tToast('gigUpdateError', { error: error.message }))
        return
      }

      // Delete old gig_dates and insert new ones
      await supabase.from('gig_dates').delete().eq('gig_id', gig.id)

      const gigDates = buildGigDates(gig.id)
      const { error: datesError } = await supabase.from('gig_dates').insert(gigDates)
      if (datesError) {
        console.error('Error updating gig dates:', datesError)
        toast.warning(tToast('gigDatesError'))
      }

      // Upload schedule file if imported (only new imports, not re-saves)
      if (scheduleFile) {
        try {
          await uploadGigAttachment(gig.id, scheduleFile, 'schedule')
          setScheduleFile(null)
        } catch (err) {
          console.error('Schedule file upload error:', err)
          toast.warning(tToast('scheduleUploadError'))
        }
      }
    } else {
      // Create mode — update the draft gig with real data
      if (draftGigId) {
        const { error } = await supabase.from('gigs').update(gigData).eq('id', draftGigId)

        if (error) {
          setLoading(false)
          console.error('Error updating draft gig:', error)
          toast.error(tToast('gigCreateError', { error: error.message }))
          return
        }

        // Insert gig_dates
        const gigDates = buildGigDates(draftGigId)
        const { error: datesError } = await supabase.from('gig_dates').insert(gigDates)
        if (datesError) {
          console.error('Error inserting gig dates:', datesError)
          toast.warning(tToast('gigDatesError'))
        }

        // Upload schedule file if imported
        if (scheduleFile) {
          try {
            await uploadGigAttachment(draftGigId, scheduleFile, 'schedule')
            setScheduleFile(null)
          } catch (err) {
            console.error('Schedule file upload error:', err)
            toast.warning(tToast('scheduleUploadError'))
          }
        }

        toast.success(tToast('gigCreated'))
        onCreated?.(draftGigId)
        // Clear draft so closing doesn't delete it
        setDraftGigId(null)
      } else {
        // Fallback: create without draft (if draft creation failed)
        const { data: newGig, error } = await supabase.from('gigs').insert([gigData]).select().single()

        if (error) {
          setLoading(false)
          console.error('Error creating gig:', error)
          toast.error(tToast('gigCreateError', { error: error.message }))
          return
        }

        const gigDates = buildGigDates(newGig.id)
        const { error: datesError } = await supabase.from('gig_dates').insert(gigDates)
        if (datesError) {
          console.error('Error inserting gig dates:', datesError)
          toast.warning(tToast('gigDatesError'))
        }

        if (scheduleFile) {
          try {
            await uploadGigAttachment(newGig.id, scheduleFile, 'schedule')
            setScheduleFile(null)
          } catch (err) {
            console.error('Schedule file upload error:', err)
            toast.warning(tToast('scheduleUploadError'))
          }
        }

        toast.success(tToast('gigCreated'))
        onCreated?.(newGig.id)
      }
    }

    setLoading(false)
    onSuccess()
    onOpenChange(false)
  }

  async function handleParseScheduleText(date: string, text: string) {
    if (!text.trim()) {
      setParsedSessions((prev) => {
        const next = { ...prev }
        delete next[date]
        return next
      })
      return
    }
    setParsingSessions((prev) => ({ ...prev, [date]: true }))
    try {
      const res = await fetch('/api/gigs/parse-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: [{ date, text }] }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.sessions?.[date]) {
          setParsedSessions((prev) => ({ ...prev, [date]: data.sessions[date] }))
        }
      }
    } catch (err) {
      console.error('Schedule parse error:', err)
    } finally {
      setParsingSessions((prev) => ({ ...prev, [date]: false }))
    }
  }

  async function handleScanSchedule() {
    scheduleFileRef.current?.click()
  }

  async function handleScheduleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setDateEntryMode('import')
    setScanningSchedule(true)
    try {
      const formDataUpload = new FormData()
      formDataUpload.append('file', file)

      const res = await fetch('/api/gigs/scan-schedule', {
        method: 'POST',
        body: formDataUpload,
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Scan failed (${res.status})`)
      }

      const result = await res.json()

      // Set dates and sessions from scan result
      if (result.dates) {
        const dates = Object.keys(result.dates)
          .sort()
          .map((d) => new Date(d + 'T12:00:00'))
        setSelectedDates(dates)

        // Store parsed sessions so they don't get re-parsed on save
        const scannedSessions: Record<string, { start: string; end: string | null; label?: string }[]> = {}
        for (const [date, sessions] of Object.entries(result.dates)) {
          if (Array.isArray(sessions) && sessions.length > 0) {
            scannedSessions[date] = sessions as { start: string; end: string | null; label?: string }[]
          }
        }
        if (Object.keys(scannedSessions).length > 0) {
          setParsedSessions((prev) => ({ ...prev, ...scannedSessions }))
        }
      }

      // Set schedule texts
      if (result.scheduleTexts) {
        setScheduleTexts(result.scheduleTexts)
      }

      // Set per-date venue overrides (for touring schedules)
      if (result.venues && typeof result.venues === 'object') {
        setDateVenues(result.venues as Record<string, string>)
      }

      // Pre-fill project name and venue if empty
      if (result.projectName && !formData.project_name) {
        setFormData((f) => ({ ...f, project_name: result.projectName }))
      }
      if (result.venue && !formData.venue) {
        setFormData((f) => ({ ...f, venue: result.venue }))
      }

      setScheduleFile(file)
      toast.success(tToast('scheduleScanned') || 'Schema importerat')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Okänt fel'
      console.error('Schedule scan error:', message)
      toast.error(message)
    } finally {
      setScanningSchedule(false)
      if (scheduleFileRef.current) {
        scheduleFileRef.current.value = ''
      }
    }
  }

  function handleCancel() {
    // Draft cleanup happens in the useEffect when open changes to false
    onOpenChange(false)
  }

  const statusOptions = [
    { value: 'tentative', label: tStatus('tentative') },
    { value: 'pending', label: tStatus('pending') },
    { value: 'accepted', label: tStatus('accepted') },
    { value: 'declined', label: tStatus('declined') },
    { value: 'completed', label: tStatus('completed') },
    { value: 'invoiced', label: tStatus('invoiced') },
    { value: 'paid', label: tStatus('paid') },
  ]

  const sectionHeader = 'text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70'
  const sectionCard = 'rounded-lg border border-border/60 bg-card p-4 space-y-3'
  const fieldLabel = 'text-xs font-medium text-muted-foreground'

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex flex-col max-h-[90vh] p-0 gap-0 w-[calc(100vw-2rem)] md:max-w-7xl"
          style={{ maxWidth: 1280 }}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <form ref={formRef} onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-border/50 shrink-0">
              <DialogHeader>
                <div>
                  <DialogTitle className="text-base font-semibold tracking-tight">
                    {isEditing ? t('editGig') : t('newGig')}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground mt-0.5">
                    {isEditing ? t('editGigDescription') : t('createGigDescription')}
                  </DialogDescription>
                </div>
              </DialogHeader>
            </div>

            {/* Main 2-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 min-h-0 flex-1 overflow-hidden">
              {/* LEFT — Form (always on desktop, step 1 on mobile) */}
              <div className={cn('overflow-y-auto px-5 py-4 space-y-3', !isLg && step !== 1 && 'hidden')}>
                {/* Section: Gig Details */}
                <div className={sectionCard}>
                  <p className={sectionHeader}>{t('sectionGig')}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className={fieldLabel}>
                        {t('type')} <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={formData.gig_type_id}
                        onValueChange={(value) => {
                          if (value === '__create__') {
                            setShowCreateGigType(true)
                            return
                          }
                          setFormData({ ...formData, gig_type_id: value })
                        }}
                      >
                        <SelectTrigger className="h-9 w-full truncate" data-testid="gig-type-select">
                          <SelectValue placeholder={t('selectType')} />
                        </SelectTrigger>
                        <SelectContent>
                          {gigTypes.map((type) => (
                            <SelectItem key={type.id} value={type.id}>
                              {type.name} ({type.vat_rate}%)
                            </SelectItem>
                          ))}
                          <SelectSeparator />
                          <SelectItem value="__create__" className="text-primary font-medium">
                            {t('addNewGigType')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {positions.length > 0 ? (
                      <div className="space-y-1">
                        <Label className={fieldLabel}>{t('position')}</Label>
                        <Select
                          value={formData.position_id}
                          onValueChange={(value) => {
                            if (value === '__create__') {
                              setShowCreatePosition(true)
                              return
                            }
                            setFormData({ ...formData, position_id: value })
                          }}
                        >
                          <SelectTrigger className="h-9 w-full truncate">
                            <SelectValue placeholder={t('selectPosition')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">{t('none')}</SelectItem>
                            {positions.map((pos) => (
                              <SelectItem key={pos.id} value={pos.id}>
                                {pos.name}
                              </SelectItem>
                            ))}
                            <SelectSeparator />
                            <SelectItem value="__create__" className="text-primary font-medium">
                              {t('addNewPosition')}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div />
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className={fieldLabel}>{t('projectName')}</Label>
                      <Input
                        className="h-9"
                        placeholder={t('projectNamePlaceholder')}
                        value={formData.project_name}
                        onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className={fieldLabel}>{t('venue')}</Label>
                      <Input
                        className="h-9"
                        placeholder={t('venuePlaceholder')}
                        value={formData.venue}
                        onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Section: Client & Fees */}
                <div className={sectionCard}>
                  <p className={sectionHeader}>{t('sectionClientFee')}</p>
                  <div className="space-y-1">
                    <Label className={fieldLabel}>
                      {t('client')}{' '}
                      {['completed', 'invoiced', 'paid'].includes(formData.status) && (
                        <span className="text-destructive">*</span>
                      )}
                    </Label>
                    <Select
                      value={formData.client_id || 'none'}
                      onValueChange={(value) => {
                        if (value === '__create__') {
                          setShowCreateClient(true)
                          return
                        }
                        setFormData({ ...formData, client_id: value })
                      }}
                    >
                      <SelectTrigger className="h-9 w-full truncate">
                        <SelectValue placeholder={t('selectClient')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t('noClient')}</SelectItem>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                        <SelectSeparator />
                        <SelectItem value="__create__" className="text-primary font-medium">
                          {t('addNewClient')}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-[1fr_120px] gap-3">
                    <div className="space-y-1">
                      <Label className={fieldLabel}>{t('fee')}</Label>
                      <Input
                        className="h-9"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0"
                        value={formData.fee}
                        onChange={(e) => setFormData({ ...formData, fee: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className={fieldLabel}>{t('currency')}</Label>
                      <Select
                        value={formData.currency}
                        onValueChange={(value) => setFormData({ ...formData, currency: value })}
                      >
                        <SelectTrigger className="h-9 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SUPPORTED_CURRENCIES.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {formData.currency && formData.currency !== baseCurrency && (
                    <div className="space-y-1">
                      <Label className={fieldLabel}>
                        {t('exchangeRateLabel', { from: formData.currency, to: baseCurrency })}
                      </Label>
                      <Input
                        className="h-9"
                        type="number"
                        min="0"
                        step="0.0001"
                        placeholder={t('exchangeRateAuto')}
                        value={manualExchangeRate}
                        onChange={(e) => setManualExchangeRate(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className={fieldLabel}>{t('status')}</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(value) => setFormData({ ...formData, status: value })}
                    >
                      <SelectTrigger className="h-9 w-full" data-testid="gig-status-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {(formData.status === 'pending' || formData.status === 'tentative') && (
                    <div className="space-y-1">
                      <Label className={fieldLabel}>{t('responseDeadline')}</Label>
                      <Input
                        className="h-9"
                        type="date"
                        value={formData.response_deadline}
                        onChange={(e) => setFormData({ ...formData, response_deadline: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                {/* Section: Notes */}
                <div className={sectionCard}>
                  <p className={sectionHeader}>{t('sectionNotes')}</p>
                  <div className="space-y-1">
                    <Label className={fieldLabel}>{t('notes')}</Label>
                    <Textarea
                      placeholder={t('notesPlaceholder')}
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className={fieldLabel}>{t('invoiceNotes')}</Label>
                    <Textarea
                      placeholder={t('invoiceNotesPlaceholder')}
                      value={formData.invoice_notes}
                      onChange={(e) => setFormData({ ...formData, invoice_notes: e.target.value })}
                      rows={2}
                      className="resize-none text-sm"
                    />
                    <p className="text-[11px] text-muted-foreground/60">{t('invoiceNotesHint')}</p>
                  </div>
                </div>

                {/* Section: Receipts & Attachments */}
                {effectiveGigId ? (
                  <div className={sectionCard}>
                    <p className={sectionHeader}>{t('sectionAttachments')}</p>
                    <div className="space-y-3">
                      <GigReceipts
                        gigId={effectiveGigId}
                        gigTitle={formData.project_name || gig?.gig_type?.name}
                        disabled={loading}
                      />
                      <GigAttachments gigId={effectiveGigId} disabled={loading} />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-border/40 text-muted-foreground/50">
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <p className="text-xs">{t('attachmentsLoading')}</p>
                  </div>
                )}
              </div>

              {/* RIGHT — Calendar (always on desktop, step 2 on mobile) */}
              <div
                className={cn(
                  'border-t lg:border-t-0 lg:border-l border-border/40 bg-muted/30 p-4 flex flex-col overflow-y-auto',
                  !isLg && step !== 2 && 'hidden',
                )}
              >
                {dateEntryMode === 'choose' ? (
                  <div className="flex-1 flex flex-col items-center justify-center">
                    <p className="text-sm font-medium text-muted-foreground mb-8">{t('addDates')}</p>
                    <div className="grid grid-cols-2 gap-4 px-4 w-full">
                      <button
                        type="button"
                        className="group flex flex-col items-center justify-center gap-3 rounded-2xl bg-card border border-border shadow-sm cursor-pointer hover:border-primary hover:shadow-lg hover:-translate-y-1 transition-all duration-200 py-8 lg:aspect-square lg:py-0"
                        onClick={() => handleScanSchedule()}
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                          <Upload className="h-6 w-6 text-primary" />
                        </div>
                        <div className="text-center px-2">
                          <span className="block text-[13px] font-semibold">{t('uploadSchedule')}</span>
                          <span className="block text-[11px] text-muted-foreground mt-0.5">PDF, JPG, PNG</span>
                        </div>
                      </button>
                      <button
                        type="button"
                        className="group flex flex-col items-center justify-center gap-3 rounded-2xl bg-card border border-border shadow-sm cursor-pointer hover:border-primary hover:shadow-lg hover:-translate-y-1 transition-all duration-200 py-8 lg:aspect-square lg:py-0"
                        onClick={() => setDateEntryMode('manual')}
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 group-hover:bg-primary/15 transition-colors">
                          <CalendarDays className="h-6 w-6 text-primary" />
                        </div>
                        <div className="text-center px-2">
                          <span className="block text-[13px] font-semibold">{t('enterManually')}</span>
                          <span className="block text-[11px] text-muted-foreground mt-0.5">
                            {t('enterManuallyHint')}
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                ) : (
                  <MultiDayDatePicker
                    selectedDates={selectedDates}
                    onDatesChange={setSelectedDates}
                    disabled={loading || scanningSchedule}
                    scheduleTexts={scheduleTexts}
                    onScheduleTextsChange={setScheduleTexts}
                    onScanSchedule={handleScanSchedule}
                    parsedSessions={parsedSessions}
                    parsingSessions={parsingSessions}
                    onParseScheduleText={handleParseScheduleText}
                    dateVenues={dateVenues}
                    onDateVenuesChange={setDateVenues}
                  />
                )}
                <input
                  ref={scheduleFileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.gif"
                  className="hidden"
                  onChange={handleScheduleFileSelected}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-border/50 flex items-center gap-2.5 shrink-0 bg-card">
              {!isLg && step === 2 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setStep(1)}>
                  {tc('back')}
                </Button>
              )}
              <div className="flex-1" />
              <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={loading}>
                {tc('cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={loading}
                onClick={() => {
                  if (!isLg && step === 1) {
                    setStep(2)
                  } else {
                    formRef.current?.requestSubmit()
                  }
                }}
              >
                {loading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                {!isLg && step === 1 ? tc('next') : isEditing ? t('saveChanges') : t('createGig')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inline create dialogs */}
      <CreateClientDialog
        open={showCreateClient}
        onOpenChange={setShowCreateClient}
        onSuccess={loadClients}
        onCreated={(id) => setFormData((f) => ({ ...f, client_id: id }))}
      />
      <CreateGigTypeDialog
        open={showCreateGigType}
        onOpenChange={setShowCreateGigType}
        onSuccess={loadGigTypes}
        onCreated={(id) => setFormData((f) => ({ ...f, gig_type_id: id }))}
      />

      {/* Inline position create dialog */}
      <Dialog open={showCreatePosition} onOpenChange={setShowCreatePosition}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('newPosition')}</DialogTitle>
            <DialogDescription>{t('newPositionDescription')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            <div className="space-y-1">
              <Label className="text-sm font-medium">{t('positionName')}</Label>
              <Input
                placeholder={t('positionNamePlaceholder')}
                value={newPositionName}
                onChange={(e) => setNewPositionName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleCreatePosition()
                  }
                }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setShowCreatePosition(false)}>
              {tc('cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={creatingPosition || !newPositionName.trim()}
              onClick={handleCreatePosition}
            >
              {creatingPosition && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              {tc('create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
