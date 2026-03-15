'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createClientSchema, type CreateClientFormData } from '@/lib/schemas/client'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Globe, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { useLocale } from 'next-intl'
import { COUNTRY_CONFIGS } from '@/lib/country-config'

type CreateClientDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  onCreated?: (id: string) => void
}

export function CreateClientDialog({ open, onOpenChange, onSuccess, onCreated }: CreateClientDialogProps) {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const t = useTranslations('client')
  const tc = useTranslations('common')
  const tt = useTranslations('toast')
  const locale = useLocale()

  const form = useForm<CreateClientFormData>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: '',
      client_code: '',
      org_number: '',
      email: '',
      address: '',
      payment_terms: '30',
      reference_person: '',
      notes: '',
      invoice_language: locale,
      country_code: '',
      vat_number: '',
    },
  })

  async function onSubmit(data: CreateClientFormData) {
    setLoading(true)

    const { data: created, error } = await supabase
      .from('clients')
      .insert([
        {
          name: data.name,
          client_code: data.client_code || null,
          org_number: data.org_number || null,
          email: data.email || null,
          address: data.address || null,
          payment_terms: parseInt(data.payment_terms || '30'),
          reference_person: data.reference_person || null,
          notes: data.notes || null,
          invoice_language: data.invoice_language || locale,
          country_code: data.country_code || null,
          vat_number: data.vat_number || null,
        },
      ])
      .select('id')
      .single()

    setLoading(false)

    if (error) {
      console.error('Error creating client:', error)
      toast.error(tt('createClientError', { error: error.message }))
    } else {
      form.reset()
      onSuccess()
      if (created) onCreated?.(created.id)
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] flex flex-col">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col overflow-hidden">
            <DialogHeader>
              <DialogTitle>{t('newClient')}</DialogTitle>
              <DialogDescription>{t('newClientDescription')}</DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto flex-1 -mx-6 px-6">
              <div className="grid gap-4 py-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('name')} <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input placeholder={t('namePlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                  <FormField
                    control={form.control}
                    name="client_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('clientCode')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('clientCodePlaceholder')} {...field} />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">{t('clientCodeHint')}</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="org_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('orgNumber')}</FormLabel>
                        <FormControl>
                          <Input placeholder="123456-7890" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="country_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5" />
                          {t('country')}
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ''}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t('selectCountry')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {Object.entries(COUNTRY_CONFIGS).map(([code, config]) => (
                              <SelectItem key={code} value={code}>
                                {config.flag} {locale === 'sv' ? config.name.sv : config.name.en}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vat_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('vatNumber')}</FormLabel>
                        <FormControl>
                          <Input placeholder={t('vatNumberPlaceholder')} {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('email')}</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder={t('emailPlaceholder')} {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">{t('emailHint')}</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('address')}</FormLabel>
                      <FormControl>
                        <Textarea placeholder={t('addressPlaceholder')} rows={3} className="resize-none" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="payment_terms"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('paymentTerms')}</FormLabel>
                      <FormControl>
                        <Input type="number" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reference_person"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('referencePerson')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('referencePersonPlaceholder')} {...field} />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">{t('referencePersonHint')}</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('notes')}</FormLabel>
                      <FormControl>
                        <Input placeholder={t('notesPlaceholder')} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="invoice_language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" />
                        {t('invoiceLanguage')}
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || locale}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {locale !== 'en' && (
                            <SelectItem value={locale}>
                              {locale === 'sv'
                                ? 'Svenska'
                                : locale === 'no'
                                  ? 'Norsk'
                                  : locale === 'da'
                                    ? 'Dansk'
                                    : locale.toUpperCase()}
                            </SelectItem>
                          )}
                          <SelectItem value="en">English</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">{t('invoiceLanguageHint')}</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <DialogFooter className="pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                {tc('cancel')}
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {tc('create')}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
