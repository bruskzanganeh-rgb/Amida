'use client'

import { useState, useEffect } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Bell, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useSubscription } from '@/lib/hooks/use-subscription'
import Link from 'next/link'
import { format, differenceInDays } from 'date-fns'
import { useDateLocale } from '@/lib/hooks/use-date-locale'
import { useFormatLocale } from '@/lib/hooks/use-format-locale'

type Invoice = {
  id: string
  invoice_number: number
  invoice_date: string
  due_date: string
  total: number
  currency?: string | null
  client: { name: string; email?: string | null; invoice_language?: string | null }
}

type SendReminderDialogProps = {
  invoice: Invoice | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  reminderCount: number
}

export function SendReminderDialog({ invoice, open, onOpenChange, onSuccess, reminderCount }: SendReminderDialogProps) {
  const t = useTranslations('invoice')
  const tr = useTranslations('invoice.reminder')
  const tc = useTranslations('common')
  const { isPro } = useSubscription()
  const dateLocale = useDateLocale()
  const formatLocale = useFormatLocale()
  const [sending, setSending] = useState(false)
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const supabase = createClient()

  const daysOverdue = invoice ? differenceInDays(new Date(), new Date(invoice.due_date)) : 0

  useEffect(() => {
    if (open && invoice) {
      loadCompanyAndPrefill()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadCompanyAndPrefill uses invoice (already in deps); only re-run when dialog opens
  }, [open, invoice])

  async function loadCompanyAndPrefill() {
    if (!invoice) return

    const { data: membership } = await supabase.from('company_members').select('company_id').limit(1).single()

    let companyName = ''
    let bankAccount = ''
    if (membership) {
      const { data: comp } = await supabase
        .from('companies')
        .select('company_name, bank_account')
        .eq('id', membership.company_id)
        .single()
      companyName = comp?.company_name || ''
      bankAccount = comp?.bank_account || ''
    }
    const clientLang = invoice.client.invoice_language || 'sv'
    const isEnglish = clientLang === 'en'

    setEmail(invoice.client.email || '')

    if (isEnglish) {
      setSubject(tr('emailDefaultSubjectEn', { number: invoice.invoice_number }))
      setMessage(
        tr('emailDefaultBodyEn', {
          number: invoice.invoice_number,
          total: invoice.total.toLocaleString(formatLocale),
          dueDate: format(new Date(invoice.due_date), 'PPP', { locale: dateLocale }),
          daysOverdue: String(daysOverdue),
          bankAccount,
          company: companyName,
        }),
      )
    } else {
      setSubject(tr('emailDefaultSubject', { number: invoice.invoice_number }))
      setMessage(
        tr('emailDefaultBodySv', {
          number: invoice.invoice_number,
          total: invoice.total.toLocaleString(formatLocale),
          dueDate: format(new Date(invoice.due_date), 'PPP', { locale: dateLocale }),
          daysOverdue: String(daysOverdue),
          bankAccount,
          company: companyName,
        }),
      )
    }
  }

  async function handleSend() {
    if (!invoice || !email) {
      toast.warning(t('enterEmail'))
      return
    }

    setSending(true)
    try {
      const response = await fetch('/api/invoices/send-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoice.id,
          to: email,
          subject,
          message,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || tr('couldNotSend'))
      }

      toast.success(tr('reminderSent'))
      onSuccess()
      onOpenChange(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errorOccurred'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            {tr('sendReminderTitle')} - {t('invoice')} #{invoice?.invoice_number}
          </DialogTitle>
          <DialogDescription>
            {tr('reminderNumber', { count: reminderCount + 1 })} · {tr('daysOverdue', { days: daysOverdue })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Email address */}
          <div className="space-y-2">
            <Label htmlFor="reminder-email">{t('to')}</Label>
            <Input
              id="reminder-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
            />
          </div>

          {/* Subject */}
          <div className="space-y-2">
            <Label htmlFor="reminder-subject">{t('subject')}</Label>
            <Input id="reminder-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label htmlFor="reminder-message">{t('message')}</Label>
            <Textarea id="reminder-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={8} />
          </div>

          {/* Invoice PDF attachment indicator */}
          <div className="p-3 rounded-lg border bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">
                {t('invoice')} #{invoice?.invoice_number}.pdf
              </span>
              <span className="text-xs text-muted-foreground">{t('attachedAutomatically')}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col">
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleSend} disabled={sending || !email}>
              {sending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {tr('sendingReminder')}
                </>
              ) : (
                <>
                  <Bell className="mr-2 h-4 w-4" />
                  {tr('sendReminder')}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
