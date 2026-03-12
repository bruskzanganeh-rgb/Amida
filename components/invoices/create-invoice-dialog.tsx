'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import * as VisuallyHidden from '@radix-ui/react-visually-hidden'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import { InvoicePreview } from './invoice-preview'
import { useSubscription } from '@/lib/hooks/use-subscription'
import { UpgradePrompt } from '@/components/ui/upgrade-prompt'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'
import { getRate, type SupportedCurrency } from '@/lib/currency/exchange'
import { shouldReverseCharge, COUNTRY_CONFIGS } from '@/lib/country-config'

type GigExpense = {
  id: string
  supplier: string
  amount: number
  amount_base: number
  category: string | null
  notes: string | null
}

type InitialGig = {
  id: string
  fee: number
  travel_expense: number | null
  date: string
  start_date: string | null
  end_date: string | null
  total_days: number
  project_name: string | null
  client_id: string
  client_name: string
  gig_type_id: string
  gig_type_name: string
  gig_type_name_en: string | null
  gig_type_vat_rate: number
  client_payment_terms: number
  invoice_notes?: string | null
  expenses?: GigExpense[]
  currency?: string
}

type CreateInvoiceDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  initialGig?: InitialGig
  initialGigs?: InitialGig[]
}

type Client = {
  id: string
  name: string
  org_number: string | null
  address: string | null
  payment_terms: number | null
  reference_person: string | null
  invoice_language: string | null
  country_code: string | null
  vat_number: string | null
}
type Gig = {
  id: string
  date: string
  fee: number | null
  travel_expense: number | null
  client: { name: string }
  gig_type: { vat_rate: number }
}
type GigType = { id: string; name: string; name_en: string | null; vat_rate: number }
type CompanySettings = {
  company_name: string
  org_number: string
  address: string
  email: string
  phone: string
  bank_account: string
  vat_registration_number: string | null
  late_payment_interest_text: string | null
  country_code: string | null
  bankgiro: string | null
  iban: string | null
  bic: string | null
}

type InvoiceLine = {
  description: string
  amount: string
  gig_type_id: string
  expenseId?: string // Track which expense this line came from
}

function findGigType(types: GigType[], ...names: string[]) {
  return types.find((t) =>
    names.some((n) => t.name.toLowerCase() === n.toLowerCase() || t.name_en?.toLowerCase() === n.toLowerCase()),
  )
}

export function CreateInvoiceDialog({
  open,
  onOpenChange,
  onSuccess,
  initialGig,
  initialGigs,
}: CreateInvoiceDialogProps) {
  const t = useTranslations('invoice')
  const tc = useTranslations('common')
  const tg = useTranslations('gig')
  const te = useTranslations('expense')
  const tToast = useTranslations('toast')
  const { canCreateInvoice, limits, usage, hasHadSubscription } = useSubscription()
  const formatLocale = useFormatLocale()
  const [loading, setLoading] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [, setCompletedGigs] = useState<Gig[]>([])
  const [gigTypes, setGigTypes] = useState<GigType[]>([])
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null)
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState<number>(46)
  const [formData, setFormData] = useState({
    client_id: '',
    invoice_date: new Date().toISOString().split('T')[0],
    payment_terms: '30',
    reference_person: '',
    notes: '',
  })
  const [lines, setLines] = useState<InvoiceLine[]>([{ description: '', amount: '', gig_type_id: '' }])
  const [selectedGigIds, setSelectedGigIds] = useState<Set<string>>(new Set())
  const [clientGigs, setClientGigs] = useState<InitialGig[]>([])
  const initializedRef = useRef(false)

  const supabase = createClient()

  // Calculate due date
  const dueDate = useMemo(() => {
    const date = new Date(formData.invoice_date)
    date.setDate(date.getDate() + parseInt(formData.payment_terms || '30'))
    return date.toISOString().split('T')[0]
  }, [formData.invoice_date, formData.payment_terms])

  // Get selected client for preview
  const selectedClient = useMemo(() => {
    return clients.find((c) => c.id === formData.client_id) || null
  }, [clients, formData.client_id])

  // Derive currency from company's country as fallback
  const companyCurrency = useMemo(() => {
    const cc = companySettings?.country_code
    if (!cc) return 'SEK'
    return COUNTRY_CONFIGS[cc]?.currency || 'SEK'
  }, [companySettings])

  // Use gig currency if all selected gigs share the same currency, otherwise company default
  const invoiceCurrency = useMemo(() => {
    const selectedGigs = clientGigs.filter((g) => selectedGigIds.has(g.id))
    if (selectedGigs.length === 0) return companyCurrency
    const currencies = new Set(selectedGigs.map((g) => g.currency || companyCurrency))
    if (currencies.size === 1) return currencies.values().next().value!
    return companyCurrency
  }, [clientGigs, selectedGigIds, companyCurrency])

  const currencyLabel = invoiceCurrency === 'SEK' ? 'kr' : invoiceCurrency

  // Auto-detect reverse charge
  const isReverseCharge = useMemo(() => {
    if (!selectedClient?.country_code || !companySettings?.country_code) return false
    return shouldReverseCharge(companySettings.country_code, selectedClient.country_code)
  }, [selectedClient, companySettings])

  // Calculate totals for preview
  const { previewLines, subtotal, vatAmount, total, primaryVatRate } = useMemo(() => {
    const linesWithVat = lines.map((line) => {
      const amount = parseFloat(line.amount) || 0
      const gigType = gigTypes.find((t) => t.id === line.gig_type_id)
      const vatRate = gigType?.vat_rate || 0
      return {
        description: line.description,
        amount,
        vat_rate: vatRate,
      }
    })

    const subtotal = linesWithVat.reduce((sum, l) => sum + l.amount, 0)
    // If reverse charge, VAT is 0
    const vatAmount = isReverseCharge ? 0 : linesWithVat.reduce((sum, l) => sum + (l.amount * l.vat_rate) / 100, 0)
    const total = subtotal + vatAmount
    const primaryVatRate = isReverseCharge ? 0 : linesWithVat.find((l) => l.vat_rate > 0)?.vat_rate || 25

    return { previewLines: linesWithVat, subtotal, vatAmount, total, primaryVatRate }
  }, [lines, gigTypes, isReverseCharge])

  useEffect(() => {
    if (open) {
      initializedRef.current = false

      async function loadClients() {
        const { data } = await supabase
          .from('clients')
          .select(
            'id, name, org_number, address, payment_terms, reference_person, invoice_language, country_code, vat_number',
          )
          .order('name')
        setClients(data || [])
      }

      async function loadCompletedGigs() {
        const { data } = await supabase
          .from('gigs')
          .select(
            `
            id,
            date,
            fee,
            travel_expense,
            client:clients(name),
            gig_type:gig_types(vat_rate)
          `,
          )
          .in('status', ['accepted', 'completed'])
          .order('date', { ascending: false })
        setCompletedGigs((data || []) as unknown as Gig[])
      }

      async function loadGigTypes() {
        const { data } = await supabase.from('gig_types').select('id, name, name_en, vat_rate').order('name')
        setGigTypes(data || [])
      }

      async function loadCompanySettings() {
        const { data: membership } = await supabase.from('company_members').select('company_id').limit(1).single()
        if (membership) {
          const { data } = await supabase
            .from('companies')
            .select(
              'company_name, org_number, address, email, phone, bank_account, bankgiro, iban, bic, vat_registration_number, late_payment_interest_text, country_code',
            )
            .eq('id', membership.company_id)
            .single()
          setCompanySettings(data)
        }
      }

      async function loadNextInvoiceNumber() {
        const { data } = await supabase
          .from('invoices')
          .select('invoice_number')
          .order('invoice_number', { ascending: false })
          .limit(1)
          .single()

        const maxExisting = data?.invoice_number || 0
        setNextInvoiceNumber(maxExisting + 1)
      }

      loadClients()
      loadCompletedGigs()
      loadGigTypes()
      loadNextInvoiceNumber()
      loadCompanySettings()
    }
  }, [open, supabase])

  const buildLinesFromGigs = useCallback(
    (gigs: InitialGig[]): InvoiceLine[] => {
      const client = clients.find((c) => c.id === formData.client_id)
      const useEnglish = client?.invoice_language === 'en'
      const newLines: InvoiceLine[] = []
      for (const gig of gigs) {
        let dateDescription: string
        if (gig.total_days > 1 && gig.start_date && gig.end_date) {
          const startFormatted = new Date(gig.start_date).toLocaleDateString(formatLocale)
          const endFormatted = new Date(gig.end_date).toLocaleDateString(formatLocale)
          dateDescription = `${startFormatted} - ${endFormatted} (${gig.total_days} ${tc('days')})`
        } else {
          dateDescription = new Date(gig.date).toLocaleDateString(formatLocale)
        }

        const typeName = useEnglish && gig.gig_type_name_en ? gig.gig_type_name_en : gig.gig_type_name
        newLines.push({
          description: gig.project_name
            ? `${typeName} - ${gig.project_name} - ${dateDescription}`
            : `${typeName} - ${dateDescription}`,
          amount: gig.fee.toString(),
          gig_type_id: gig.gig_type_id,
        })

        if (gig.travel_expense && gig.travel_expense > 0) {
          const konsertType = findGigType(gigTypes, 'Konsert', 'Concert')
          newLines.push({
            description: `${tg('travelExpense')} - ${dateDescription}`,
            amount: gig.travel_expense.toString(),
            gig_type_id: konsertType?.id || gig.gig_type_id,
          })
        }
      }
      return newLines.length > 0 ? newLines : [{ description: '', amount: '', gig_type_id: '' }]
    },
    [clients, formData.client_id, formatLocale, tc, tg, gigTypes],
  )

  // Auto-populate form when initialGig or initialGigs are provided (once per dialog open)
  useEffect(() => {
    if (!open || gigTypes.length === 0 || initializedRef.current) return

    const gigs = initialGigs || (initialGig ? [initialGig] : null)
    if (!gigs || gigs.length === 0) return

    const firstGig = gigs[0]
    const client = clients.find((c) => c.id === firstGig.client_id)
    const combinedNotes = gigs
      .map((g) => g.invoice_notes)
      .filter(Boolean)
      .join('\n')

    setFormData({
      client_id: firstGig.client_id,
      invoice_date: new Date().toISOString().split('T')[0],
      payment_terms: firstGig.client_payment_terms.toString(),
      reference_person: client?.reference_person || '',
      notes: combinedNotes,
    })

    setSelectedGigIds(new Set(gigs.map((g) => g.id)))
    setClientGigs(gigs)
    setLines(buildLinesFromGigs(gigs))
    initializedRef.current = true
  }, [open, initialGig, initialGigs, gigTypes, clients, buildLinesFromGigs])

  async function loadClientGigs(clientId: string) {
    const { data: linkedGigs } = await supabase.from('invoice_gigs').select('gig_id')
    const linkedGigIds = new Set((linkedGigs || []).map((g: { gig_id: string }) => g.gig_id))

    const { data } = await supabase
      .from('gigs')
      .select(
        `
        id, fee, travel_expense, date, start_date, end_date, total_days,
        project_name, invoice_notes, client_id, currency,
        client:clients(name, payment_terms),
        gig_type:gig_types(id, name, name_en, vat_rate)
      `,
      )
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .not('fee', 'is', null)
      .order('date', { ascending: false })

    const gigs: InitialGig[] = (data || [])
      .filter((g) => !linkedGigIds.has(g.id))
      .map((g) => {
        const client = g.client as unknown as { name: string; payment_terms: number | null } | null
        const gigType = g.gig_type as unknown as {
          id: string
          name: string
          name_en: string | null
          vat_rate: number
        } | null
        return {
          id: g.id,
          fee: g.fee!,
          travel_expense: g.travel_expense,
          date: g.date,
          start_date: g.start_date,
          end_date: g.end_date,
          total_days: g.total_days || 1,
          project_name: g.project_name,
          invoice_notes: g.invoice_notes || null,
          client_id: g.client_id!,
          client_name: client?.name || '',
          gig_type_id: gigType?.id || '',
          gig_type_name: gigType?.name || '',
          gig_type_name_en: gigType?.name_en || null,
          gig_type_vat_rate: gigType?.vat_rate || 25,
          client_payment_terms: client?.payment_terms || 30,
          currency: g.currency || undefined,
        }
      })

    setClientGigs(gigs)
  }

  function toggleGig(gig: InitialGig) {
    const newIds = new Set(selectedGigIds)
    if (newIds.has(gig.id)) {
      newIds.delete(gig.id)
    } else {
      newIds.add(gig.id)
    }
    setSelectedGigIds(newIds)

    const selectedGigs = clientGigs.filter((g) => newIds.has(g.id))
    setLines(buildLinesFromGigs(selectedGigs))

    const combinedNotes = selectedGigs
      .map((g) => g.invoice_notes)
      .filter(Boolean)
      .join('\n')
    setFormData((prev) => ({ ...prev, notes: combinedNotes }))
  }

  function addLine() {
    const defaultType = findGigType(gigTypes, 'Undervisning', 'Teaching')
    setLines([...lines, { description: '', amount: '', gig_type_id: defaultType?.id || '' }])
  }

  function removeLine(index: number) {
    setLines(lines.filter((_, i) => i !== index))
  }

  function updateLine(index: number, field: keyof InvoiceLine, value: string) {
    const newLines = [...lines]
    newLines[index] = { ...newLines[index], [field]: value }
    setLines(newLines)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canCreateInvoice) return
    setLoading(true)

    // Save reference_person_override if different from client default
    const client = clients.find((c) => c.id === formData.client_id)
    const referencePersonOverride =
      formData.reference_person !== (client?.reference_person || '') ? formData.reference_person || null : null

    // Convert to base currency (SEK) if invoice is in foreign currency
    let exchangeRate = 1.0
    let totalBase = total
    if (invoiceCurrency !== 'SEK') {
      try {
        exchangeRate = await getRate(invoiceCurrency as SupportedCurrency, 'SEK', formData.invoice_date)
        totalBase = Math.round(total * exchangeRate * 100) / 100
      } catch (err) {
        console.error('Exchange rate fetch failed:', err)
        toast.error(t('exchangeRateError') || 'Could not fetch exchange rate')
        setLoading(false)
        return
      }
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert([
        {
          client_id: formData.client_id,
          gig_id: null,
          invoice_number: nextInvoiceNumber,
          invoice_date: formData.invoice_date,
          due_date: dueDate,
          subtotal,
          vat_rate: primaryVatRate,
          vat_amount: vatAmount,
          total,
          total_base: totalBase,
          currency: invoiceCurrency,
          exchange_rate: exchangeRate,
          status: 'draft',
          reference_person_override: referencePersonOverride,
          notes: formData.notes || null,
          reverse_charge: isReverseCharge,
          customer_vat_number: isReverseCharge ? client?.vat_number || null : null,
        },
      ])
      .select()
      .single()

    if (invoiceError) {
      console.error('Error creating invoice:', invoiceError)
      toast.error(t('couldNotCreateInvoice') + ': ' + invoiceError.message)
      setLoading(false)
      return
    }

    const linesData = previewLines.map((line, index) => ({
      invoice_id: invoice.id,
      description: line.description,
      amount: line.amount,
      vat_rate: line.vat_rate,
      sort_order: index,
    }))

    const { error: linesError } = await supabase.from('invoice_lines').insert(linesData)

    if (linesError) {
      console.error('Error creating invoice lines:', linesError)
      toast.error(t('couldNotCreateLines') + ': ' + linesError.message)
      setLoading(false)
      return
    }

    // Link gigs via junction table and update their status
    const gigIdsArray = Array.from(selectedGigIds)
    if (gigIdsArray.length > 0) {
      const { error: linkError } = await supabase.from('invoice_gigs').insert(
        gigIdsArray.map((gigId) => ({
          invoice_id: invoice.id,
          gig_id: gigId,
        })),
      )

      if (linkError) {
        console.error('Error linking gigs:', linkError)
        toast.warning(tToast('gigLinkError'))
      }

      await supabase.from('gigs').update({ status: 'invoiced' }).in('id', gigIdsArray)
    }

    // Track usage
    fetch('/api/usage/increment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'invoice' }),
    }).catch(() => {}) // Non-blocking

    setLoading(false)
    setFormData({
      client_id: '',
      invoice_date: new Date().toISOString().split('T')[0],
      payment_terms: '30',
      reference_person: '',
      notes: '',
    })
    setLines([{ description: '', amount: '', gig_type_id: '' }])
    setSelectedGigIds(new Set())
    setClientGigs([])
    onSuccess()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[1300px] max-h-[90vh] p-0 gap-0 overflow-hidden w-[calc(100vw-2rem)]"
        aria-describedby={undefined}
      >
        <VisuallyHidden.Root asChild>
          <DialogTitle>{t('newInvoice')}</DialogTitle>
        </VisuallyHidden.Root>
        <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row h-full">
          {/* Preview Section - Left (hidden on mobile) */}
          <div className="hidden lg:flex w-[450px] bg-muted/30 p-6 border-r flex-col">
            <div className="text-sm font-medium text-muted-foreground mb-3">{t('preview')}</div>
            <div className="flex-1 flex items-start justify-center">
              <div className="w-full">
                <InvoicePreview
                  company={companySettings ?? null}
                  client={
                    selectedClient
                      ? {
                          name: selectedClient.name,
                          org_number: selectedClient.org_number,
                          address: selectedClient.address,
                          payment_terms: selectedClient.payment_terms ?? undefined,
                        }
                      : null
                  }
                  invoiceNumber={nextInvoiceNumber}
                  invoiceDate={formData.invoice_date}
                  dueDate={dueDate}
                  lines={previewLines}
                  subtotal={subtotal}
                  vatAmount={vatAmount}
                  total={total}
                  primaryVatRate={primaryVatRate}
                  referencePerson={formData.reference_person}
                  notes={formData.notes}
                  reverseCharge={isReverseCharge}
                  locale={selectedClient?.invoice_language || undefined}
                  currency={invoiceCurrency}
                />
              </div>
            </div>
          </div>

          {/* Form Section - Right */}
          <div className="flex-1 flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{t('newInvoice')}</h2>
              <p className="text-sm text-muted-foreground">
                {t('invoiceNumber')} #{nextInvoiceNumber}
              </p>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="space-y-5">
                {/* Kund */}
                <div className="space-y-2">
                  <Label>
                    {t('customer')} <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={formData.client_id}
                    onValueChange={(value) => {
                      const client = clients.find((c) => c.id === value)
                      setFormData({
                        ...formData,
                        client_id: value,
                        payment_terms: client?.payment_terms?.toString() || '30',
                        reference_person: client?.reference_person || '',
                      })
                      if (!initialGig && !initialGigs) {
                        setSelectedGigIds(new Set())
                        setLines([{ description: '', amount: '', gig_type_id: '' }])
                        loadClientGigs(value)
                      }
                    }}
                    required
                  >
                    <SelectTrigger className="truncate">
                      <SelectValue placeholder={t('selectClient')} />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {isReverseCharge && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                      <span className="text-xs font-medium">{t('reverseChargeNotice')}</span>
                    </div>
                  )}
                </div>

                {/* Uppdrag att fakturera */}
                {clientGigs.length > 0 && (
                  <div className="space-y-2">
                    <Label>{t('gigsToInvoice')}</Label>
                    <div className="space-y-1.5 border rounded-lg p-3 bg-muted/30">
                      {clientGigs.map((gig) => {
                        const isSelected = selectedGigIds.has(gig.id)
                        const dateStr =
                          gig.total_days > 1 && gig.start_date && gig.end_date
                            ? `${new Date(gig.start_date).toLocaleDateString(formatLocale)} - ${new Date(gig.end_date).toLocaleDateString(formatLocale)}`
                            : new Date(gig.date).toLocaleDateString(formatLocale)
                        return (
                          <div
                            key={gig.id}
                            className={`flex items-center gap-2 p-2 rounded text-sm cursor-pointer transition-colors ${
                              isSelected ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted/50'
                            }`}
                            onClick={() => toggleGig(gig)}
                          >
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleGig(gig)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">
                                {gig.gig_type_name}
                                {gig.project_name && ` - ${gig.project_name}`}
                              </span>
                              <span className="text-muted-foreground ml-2">{dateStr}</span>
                            </div>
                            <span className="font-medium shrink-0">
                              {gig.fee.toLocaleString(formatLocale)} {currencyLabel}
                            </span>
                          </div>
                        )
                      })}
                      {selectedGigIds.size > 0 && (
                        <div className="pt-2 border-t mt-1 text-sm text-muted-foreground flex justify-between">
                          <span>{t('gigsSelected', { count: selectedGigIds.size })}</span>
                          <span className="font-medium">
                            {clientGigs
                              .filter((g) => selectedGigIds.has(g.id))
                              .reduce((sum, g) => sum + g.fee + (g.travel_expense || 0), 0)
                              .toLocaleString(formatLocale)}{' '}
                            {currencyLabel}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Datum */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t('invoiceDate')}</Label>
                    <Input
                      type="date"
                      value={formData.invoice_date}
                      onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('paymentTermsDays')}</Label>
                    <Input
                      type="number"
                      min="1"
                      value={formData.payment_terms}
                      onChange={(e) => setFormData({ ...formData, payment_terms: e.target.value })}
                      required
                    />
                  </div>
                </div>

                {/* Er referens */}
                <div className="space-y-2">
                  <Label>{t('yourReference')}</Label>
                  <Input
                    placeholder={t('contactPersonPlaceholder')}
                    value={formData.reference_person}
                    onChange={(e) => setFormData({ ...formData, reference_person: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{t('referencePrefilledHint')}</p>
                </div>

                {/* Fakturarader */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>{t('invoiceLines')}</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addLine}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      {t('row')}
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {lines.map((line, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Input
                          className="flex-1"
                          placeholder={t('description')}
                          value={line.description}
                          onChange={(e) => updateLine(index, 'description', e.target.value)}
                          required
                        />
                        <Input
                          className="w-24"
                          type="number"
                          step="0.01"
                          placeholder={t('amount')}
                          value={line.amount}
                          onChange={(e) => updateLine(index, 'amount', e.target.value)}
                          required
                        />
                        <Select
                          value={line.gig_type_id}
                          onValueChange={(value) => updateLine(index, 'gig_type_id', value)}
                        >
                          <SelectTrigger className="w-40 truncate">
                            <SelectValue placeholder={t('type')} />
                          </SelectTrigger>
                          <SelectContent>
                            {gigTypes.map((type) => (
                              <SelectItem key={type.id} value={type.id}>
                                {type.name} ({type.vat_rate}%)
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {lines.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0"
                            onClick={() => removeLine(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Meddelande / Anteckningar */}
                <div className="space-y-2">
                  <Label>{t('invoiceMessage')}</Label>
                  <Textarea
                    placeholder={t('optionalMessagePlaceholder')}
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                  />
                  <p className="text-xs text-muted-foreground">{t('prefilledFromNotes')}</p>
                </div>

                {/* Kopplade kvitton */}
                {(() => {
                  const allGigs = initialGigs || (initialGig ? [initialGig] : [])
                  const allExpenses = allGigs.filter((g) => selectedGigIds.has(g.id)).flatMap((g) => g.expenses || [])
                  if (allExpenses.length === 0) return null
                  return (
                    <div className="space-y-3 pt-3 border-t">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-2">
                          <Receipt className="h-4 w-4" />
                          {t('addReceiptsAsLines')}
                        </Label>
                        <span className="text-sm text-muted-foreground">
                          {allExpenses
                            .reduce((sum, e) => sum + (e.amount_base || e.amount), 0)
                            .toLocaleString(formatLocale)}{' '}
                          {currencyLabel}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {allExpenses.map((expense) => {
                          const isAdded = lines.some((line) => line.expenseId === expense.id)
                          return (
                            <div
                              key={expense.id}
                              className={`flex items-center gap-2 p-2 rounded text-sm ${isAdded ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'}`}
                            >
                              <Checkbox
                                id={`expense-${expense.id}`}
                                checked={isAdded}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    const expenseType = findGigType(gigTypes, 'Utgifter', 'Expenses')
                                    const category = expense.category || te('expense')
                                    const details = expense.notes
                                      ? `${expense.supplier} - ${expense.notes}`
                                      : expense.supplier
                                    const newLine: InvoiceLine = {
                                      description: `${category}: ${details}`,
                                      amount: (expense.amount_base || expense.amount).toString(),
                                      gig_type_id: expenseType?.id || '',
                                      expenseId: expense.id,
                                    }
                                    setLines([...lines, newLine])
                                  } else {
                                    setLines(lines.filter((line) => line.expenseId !== expense.id))
                                  }
                                }}
                              />
                              <label htmlFor={`expense-${expense.id}`} className="flex-1 cursor-pointer truncate">
                                {expense.supplier}
                                {expense.notes && <span className="text-muted-foreground"> - {expense.notes}</span>}
                              </label>
                              {expense.category && (
                                <Badge variant="outline" className="text-xs shrink-0">
                                  {expense.category}
                                </Badge>
                              )}
                              <span className="font-medium shrink-0">
                                {(expense.amount_base || expense.amount).toLocaleString(formatLocale)} {currencyLabel}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* Footer */}
            {!canCreateInvoice && (
              <div className="px-6 pb-2">
                <UpgradePrompt
                  type="invoice"
                  current={usage?.invoice_count || 0}
                  limit={limits.invoices === Infinity ? 0 : limits.invoices}
                  showTrial={!hasHadSubscription}
                />
              </div>
            )}
            <DialogFooter className="px-6 py-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={loading || !formData.client_id || !canCreateInvoice}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('createInvoice')}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
