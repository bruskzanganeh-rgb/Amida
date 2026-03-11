'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Settings,
  Building2,
  CreditCard,
  Loader2,
  Calendar,
  Copy,
  Check,
  Mail,
  Send,
  Crown,
  Globe,
  Key,
  Lock,
  Users,
  User,
  MessageSquare,
  AlertTriangle,
} from 'lucide-react'
import { SubscriptionSettings } from '@/components/settings/subscription-settings'
import { ApiKeysSettings } from '@/components/settings/api-keys-settings'
import { TeamSettings } from '@/components/settings/team-settings'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useTranslations, useLocale } from 'next-intl'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useSubscription } from '@/lib/hooks/use-subscription'
import { COUNTRY_CONFIGS, getCountryConfig } from '@/lib/country-config'
import { PageTransition } from '@/components/ui/page-transition'
import { Skeleton } from '@/components/ui/skeleton'

type CompanySettings = {
  id: string
  company_name: string
  org_number: string
  address: string
  postal_code: string
  city: string
  email: string
  phone: string
  bank_account: string
  bankgiro: string
  iban: string
  bic: string
  logo_url: string | null
  vat_registration_number: string | null
  late_payment_interest_text: string | null
  show_logo_on_invoice: boolean | null
  our_reference: string | null
  smtp_host: string | null
  smtp_port: number | null
  smtp_user: string | null
  smtp_password: string | null
  smtp_from_email: string | null
  smtp_from_name: string | null
  base_currency: string | null
  locale: string | null
  email_provider: string | null
  country_code: string | null
  calendar_token: string | null
  timezone: string | null
}

export default function SettingsPage() {
  const t = useTranslations('settings')
  const tToast = useTranslations('toast')
  const tc = useTranslations('common')
  const locale = useLocale()

  const [settings, setSettings] = useState<CompanySettings | null>(null)
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [calendarCopied, setCalendarCopied] = useState(false)
  const [testingEmail, setTestingEmail] = useState(false)
  const [emailProvider, setEmailProvider] = useState<string>('platform')
  const [userId, setUserId] = useState<string>('')
  const [companyId, setCompanyId] = useState<string>('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const supabase = createClient()
  const { isPro, isTeam } = useSubscription()
  const searchParams = useSearchParams()
  const countryConfig = getCountryConfig(settings?.country_code || 'SE')

  // Default to subscription tab if coming from Stripe checkout or upgrade link
  const defaultTab = searchParams.get('tab') || (searchParams.get('upgrade') ? 'subscription' : 'company')
  const [activeTab, setActiveTab] = useState(defaultTab)

  // Generate calendar URLs with user parameter and auth token
  const calendarToken = settings?.calendar_token || ''
  const calendarBaseUrl =
    typeof window !== 'undefined' && userId && calendarToken
      ? `${window.location.origin}/api/calendar/feed?user=${userId}&token=${calendarToken}`
      : ''
  const calendarUrl = calendarBaseUrl
  const sharedCalendarUrl = calendarBaseUrl ? `${calendarBaseUrl}&scope=shared` : ''

  const [sharedCalendarCopied, setSharedCalendarCopied] = useState(false)

  async function copyCalendarUrl() {
    try {
      await navigator.clipboard.writeText(calendarUrl)
      setCalendarCopied(true)
      setTimeout(() => setCalendarCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error(tToast('copyError'))
    }
  }

  async function copySharedCalendarUrl() {
    try {
      await navigator.clipboard.writeText(sharedCalendarUrl)
      setSharedCalendarCopied(true)
      setTimeout(() => setSharedCalendarCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
      toast.error(tToast('copyError'))
    }
  }

  useEffect(() => {
    async function loadSettings() {
      setLoading(true)

      // Get current user first
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }
      setUserId(user.id)

      // Load personal prefs from company_settings
      const { data: personalSettings, error: psError } = await supabase
        .from('company_settings')
        .select('id, locale, calendar_token, instruments_text, timezone')
        .limit(1)
        .single()

      if (psError) {
        console.error('Error loading personal settings:', psError)
        setLoading(false)
        return
      }

      // Load company info from companies table
      const { data: membership } = await supabase
        .from('company_members')
        .select('company_id, full_name')
        .eq('user_id', user.id)
        .single()
      if (membership?.full_name) setFullName(membership.full_name)

      if (membership) {
        const { data: company, error: compError } = await supabase
          .from('companies')
          .select('*')
          .eq('id', membership.company_id)
          .single()

        if (!compError && company) {
          // Merge company info + personal prefs into settings state
          setSettings({
            id: personalSettings.id,
            company_name: company.company_name,
            org_number: company.org_number,
            address: company.address,
            postal_code: company.postal_code || '',
            city: company.city || '',
            email: company.email,
            phone: company.phone,
            bank_account: company.bank_account,
            bankgiro: company.bankgiro || '',
            iban: company.iban || '',
            bic: company.bic || '',
            logo_url: company.logo_url,
            vat_registration_number: company.vat_registration_number,
            late_payment_interest_text: company.late_payment_interest_text,
            show_logo_on_invoice: company.show_logo_on_invoice,
            our_reference: company.our_reference,
            smtp_host: company.smtp_host,
            smtp_port: company.smtp_port,
            smtp_user: company.smtp_user,
            smtp_password: company.smtp_password,
            smtp_from_email: company.smtp_from_email,
            smtp_from_name: company.smtp_from_name,
            base_currency: company.base_currency,
            locale: personalSettings.locale || 'sv',
            email_provider: company.email_provider,
            country_code: company.country_code,
            calendar_token: personalSettings.calendar_token,
            timezone: personalSettings.timezone || 'Europe/Stockholm',
          })
          setEmailProvider(company.email_provider || 'platform')
          setCompanyId(membership.company_id)
        }
      }

      setLoading(false)
    }
    loadSettings()
  }, [supabase])

  async function handleSave() {
    if (!settings) return

    setSaving(true)

    // Save company info to companies table
    if (companyId) {
      const { error: compError } = await supabase
        .from('companies')
        .update({
          company_name: settings.company_name,
          org_number: settings.org_number,
          address: settings.address,
          postal_code: settings.postal_code,
          city: settings.city,
          email: settings.email,
          phone: settings.phone,
          bank_account: settings.bank_account,
          bankgiro: settings.bankgiro,
          iban: settings.iban,
          bic: settings.bic,
          vat_registration_number: settings.vat_registration_number,
          late_payment_interest_text: settings.late_payment_interest_text,
          our_reference: settings.our_reference,
          smtp_host: settings.smtp_host,
          smtp_port: settings.smtp_port,
          smtp_user: settings.smtp_user,
          smtp_password: settings.smtp_password,
          smtp_from_email: settings.smtp_from_email,
          smtp_from_name: settings.smtp_from_name,
          base_currency: settings.base_currency,
          email_provider: emailProvider,
          country_code: settings.country_code,
        })
        .eq('id', companyId)

      if (compError) {
        console.error('Error saving company settings:', compError)
        toast.error(tToast('settingsError', { error: compError.message }))
        setSaving(false)
        return
      }
    }

    // Save personal name to company_members
    await supabase
      .from('company_members')
      .update({ full_name: fullName || null })
      .eq('company_id', companyId)
      .eq('user_id', userId)

    // Save personal prefs to company_settings
    const { error } = await supabase
      .from('company_settings')
      .update({
        locale: settings.locale,
        timezone: settings.timezone,
      })
      .eq('id', settings.id)

    setSaving(false)

    if (error) {
      console.error('Error saving settings:', error)
      toast.error(tToast('settingsError', { error: error.message }))
    } else {
      toast.success(tToast('settingsSaved'))
    }
  }

  async function handleTestEmail() {
    if (emailProvider === 'smtp' && (!settings?.smtp_host || !settings?.smtp_from_email)) {
      toast.error(t('fillSmtpFirst'))
      return
    }

    setTestingEmail(true)
    try {
      // Send test email to the logged-in user's own email, not the company email
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const toEmail = user?.email || settings?.email

      const body =
        emailProvider === 'platform'
          ? {
              provider: 'platform',
              to_email: toEmail,
            }
          : {
              provider: 'smtp',
              smtp_host: settings?.smtp_host,
              smtp_port: settings?.smtp_port || 587,
              smtp_user: settings?.smtp_user,
              smtp_password: settings?.smtp_password,
              smtp_from_email: settings?.smtp_from_email,
              smtp_from_name: settings?.smtp_from_name || settings?.company_name,
              to_email: toEmail,
            }

      const response = await fetch('/api/settings/test-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await response.json()
      if (response.ok) {
        toast.success(tToast('testEmailSent', { email: toEmail || '' }))
      } else {
        toast.error(tToast('testEmailError', { error: result.error || 'Unknown error' }))
      }
    } catch {
      toast.error(tToast('testEmailGenericError'))
    }
    setTestingEmail(false)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 rounded-md" />
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-6 space-y-4">
              <Skeleton className="h-5 w-32" />
              <div className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <PageTransition>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="w-full overflow-x-auto justify-start">
          <TabsTrigger value="company" className="gap-2" title={t('tabCompany')}>
            <Building2 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('tabCompany')}</span>
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-2" title={t('tabEmail')}>
            <Mail className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('tabEmail')}</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2" title={t('tabCalendar')}>
            <Calendar className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('tabCalendar')}</span>
          </TabsTrigger>
          <TabsTrigger value="team" className="gap-2" title={t('tabTeam')}>
            <Users className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('tabTeam')}</span>
          </TabsTrigger>
          <TabsTrigger value="api" className="gap-2" title="API">
            <Key className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">API</span>
          </TabsTrigger>
          <TabsTrigger value="subscription" className="gap-2" title={t('tabSubscription')}>
            <Crown className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('tabSubscription')}</span>
          </TabsTrigger>
          <TabsTrigger value="account" className="gap-2" title={t('tabAccount')}>
            <User className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('tabAccount')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Company Tab */}
        <TabsContent value="company" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Company Info */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {t('companyInfo')}
                </CardTitle>
                <CardDescription>{t('companyInfoDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">{t('yourName')}</Label>
                  <Input
                    id="full_name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder={t('yourNamePlaceholder')}
                  />
                  <p className="text-xs text-muted-foreground">{t('yourNameHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="company_name">{t('companyName')}</Label>
                  <Input
                    id="company_name"
                    value={settings?.company_name || ''}
                    onChange={(e) => setSettings((s) => (s ? { ...s, company_name: e.target.value } : null))}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('country')}</Label>
                  <Select
                    value={settings?.country_code || 'SE'}
                    onValueChange={(value) => setSettings((s) => (s ? { ...s, country_code: value } : null))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(COUNTRY_CONFIGS).map(([code, config]) => (
                        <SelectItem key={code} value={code}>
                          {config.flag} {locale === 'sv' ? config.name.sv : config.name.en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="org_number">
                    {locale === 'sv' ? countryConfig.orgLabel.sv : countryConfig.orgLabel.en}
                  </Label>
                  <Input
                    id="org_number"
                    value={settings?.org_number || ''}
                    onChange={(e) => setSettings((s) => (s ? { ...s, org_number: e.target.value } : null))}
                    placeholder={countryConfig.orgPlaceholder}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="address">{t('address')}</Label>
                  <Textarea
                    id="address"
                    rows={3}
                    value={settings?.address || ''}
                    onChange={(e) => setSettings((s) => (s ? { ...s, address: e.target.value } : null))}
                    className="resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="postal_code">{t('postalCode')}</Label>
                    <Input
                      id="postal_code"
                      value={settings?.postal_code || ''}
                      onChange={(e) => setSettings((s) => (s ? { ...s, postal_code: e.target.value } : null))}
                      placeholder={settings?.country_code === 'SE' ? '123 45' : '10115'}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="city">{t('city')}</Label>
                    <Input
                      id="city"
                      value={settings?.city || ''}
                      onChange={(e) => setSettings((s) => (s ? { ...s, city: e.target.value } : null))}
                      placeholder={settings?.country_code === 'SE' ? 'Stockholm' : 'Berlin'}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">{t('email')}</Label>
                    <Input
                      id="email"
                      type="email"
                      value={settings?.email || ''}
                      onChange={(e) => setSettings((s) => (s ? { ...s, email: e.target.value } : null))}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">{t('phone')}</Label>
                    <Input
                      id="phone"
                      value={settings?.phone || ''}
                      onChange={(e) => setSettings((s) => (s ? { ...s, phone: e.target.value } : null))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="our_reference">{t('ourReference')}</Label>
                  <Input
                    id="our_reference"
                    value={settings?.our_reference || ''}
                    onChange={(e) => setSettings((s) => (s ? { ...s, our_reference: e.target.value } : null))}
                    placeholder={t('referenceExample')}
                  />
                  <p className="text-xs text-muted-foreground">{t('ourReferenceHint')}</p>
                </div>
              </CardContent>
            </Card>

            {/* Bank & Payment */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  {t('paymentInfo')}
                </CardTitle>
                <CardDescription>{t('paymentInfoDesc')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bankgiro">{t('bankgiro')}</Label>
                    <Input
                      id="bankgiro"
                      value={settings?.bankgiro || ''}
                      onChange={(e) => setSettings((s) => (s ? { ...s, bankgiro: e.target.value } : null))}
                      placeholder="XXXX-XXXX"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bank_account">
                      {locale === 'sv' ? countryConfig.bankLabel.sv : countryConfig.bankLabel.en}
                    </Label>
                    <Input
                      id="bank_account"
                      value={settings?.bank_account || ''}
                      onChange={(e) => setSettings((s) => (s ? { ...s, bank_account: e.target.value } : null))}
                      placeholder={countryConfig.bankPlaceholder}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="iban">IBAN</Label>
                    <Input
                      id="iban"
                      value={settings?.iban || ''}
                      onChange={(e) => setSettings((s) => (s ? { ...s, iban: e.target.value } : null))}
                      placeholder="SE00 0000 0000 0000 0000 0000"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bic">BIC / SWIFT</Label>
                    <Input
                      id="bic"
                      value={settings?.bic || ''}
                      onChange={(e) => setSettings((s) => (s ? { ...s, bic: e.target.value } : null))}
                      placeholder="XXXXSESS"
                    />
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">{t('bankAccountHint')}</p>

                <div className="space-y-2">
                  <Label htmlFor="vat_registration_number">{t('vatRegNumber')}</Label>
                  <Input
                    id="vat_registration_number"
                    value={settings?.vat_registration_number || ''}
                    onChange={(e) => setSettings((s) => (s ? { ...s, vat_registration_number: e.target.value } : null))}
                    placeholder="SE559087745101"
                  />
                  <p className="text-xs text-muted-foreground">{t('vatRegNumberHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="late_payment_interest_text">{t('latePaymentInterest')}</Label>
                  <Textarea
                    id="late_payment_interest_text"
                    rows={2}
                    value={settings?.late_payment_interest_text || ''}
                    onChange={(e) =>
                      setSettings((s) => (s ? { ...s, late_payment_interest_text: e.target.value } : null))
                    }
                    placeholder={t('latePaymentExample')}
                    className="resize-none"
                  />
                  <p className="text-xs text-muted-foreground">{t('latePaymentInterestHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="base_currency">{t('baseCurrency')}</Label>
                  <Select
                    value={settings?.base_currency || 'SEK'}
                    onValueChange={(value) => setSettings((s) => (s ? { ...s, base_currency: value } : null))}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SEK">SEK — Svenska kronor</SelectItem>
                      <SelectItem value="NOK">NOK — Norska kronor</SelectItem>
                      <SelectItem value="DKK">DKK — Danska kronor</SelectItem>
                      <SelectItem value="EUR">EUR — Euro</SelectItem>
                      <SelectItem value="USD">USD — US Dollar</SelectItem>
                      <SelectItem value="GBP">GBP — Brittiskt pund</SelectItem>
                      <SelectItem value="CHF">CHF — Schweizisk franc</SelectItem>
                      <SelectItem value="CZK">CZK — Tjeckisk krona</SelectItem>
                      <SelectItem value="PLN">PLN — Polsk zloty</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('baseCurrencyHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="locale">{t('language')}</Label>
                  <Select
                    value={settings?.locale || 'sv'}
                    onValueChange={async (value) => {
                      setSettings((s) => (s ? { ...s, locale: value } : null))
                      // Save locale to DB immediately
                      if (settings?.id) {
                        await supabase.from('company_settings').update({ locale: value }).eq('id', settings.id)
                      }
                      // Set cookie and reload for the new locale to take effect
                      document.cookie = `NEXT_LOCALE=${value};path=/;max-age=${60 * 60 * 24 * 365}`
                      window.location.reload()
                    }}
                  >
                    <SelectTrigger className="w-[200px]">
                      <Globe className="h-4 w-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sv">Svenska</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('languageHint')}</p>
                </div>
              </CardContent>
            </Card>

            {/* Logo */}
          </div>

          {/* Change password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                {t('changePassword')}
              </CardTitle>
              <CardDescription>{t('changePasswordDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="newPassword">{t('newPassword')}</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('passwordMinLength')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-destructive">{t('passwordMismatch')}</p>
              )}
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  disabled={
                    changingPassword || !newPassword || newPassword.length < 6 || newPassword !== confirmPassword
                  }
                  onClick={async () => {
                    setChangingPassword(true)
                    const { error } = await supabase.auth.updateUser({ password: newPassword })
                    setChangingPassword(false)
                    if (error) {
                      toast.error(tToast('passwordChangeError'))
                    } else {
                      toast.success(tToast('passwordChanged'))
                      setNewPassword('')
                      setConfirmPassword('')
                    }
                  }}
                >
                  {changingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('changePassword')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc('saveSettings')}
            </Button>
          </div>
        </TabsContent>

        {/* Email Tab */}
        <TabsContent value="email" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                {t('emailSettings')}
              </CardTitle>
              <CardDescription>{t('emailSettingsDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isPro ? (
                <div className="p-4 rounded-lg bg-muted/50 text-center space-y-2">
                  <Crown className="h-8 w-8 mx-auto text-yellow-500" />
                  <p className="text-sm font-medium">{t('emailRequiresPro')}</p>
                  <button onClick={() => setActiveTab('subscription')} className="text-sm text-primary underline">
                    {t('subscription')}
                  </button>
                </div>
              ) : (
                <>
                  {/* Provider selector */}
                  <div className="space-y-2">
                    <Label>{t('emailProvider')}</Label>
                    <div className="flex gap-2">
                      <Button
                        variant={emailProvider === 'platform' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setEmailProvider('platform')}
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        {t('platformEmail')}
                      </Button>
                      <Button
                        variant={emailProvider === 'smtp' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setEmailProvider('smtp')}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        {t('ownSmtp')}
                      </Button>
                    </div>
                  </div>

                  {emailProvider === 'platform' ? (
                    <>
                      <div className="p-4 rounded-lg bg-muted/50 flex items-start gap-3">
                        <Mail className="h-5 w-5 mt-0.5 text-primary shrink-0" />
                        <p className="text-sm text-muted-foreground">{t('platformEmailInfo')}</p>
                      </div>

                      <div className="pt-4 border-t flex items-center justify-between">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{t('testConnection')}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('testConnectionHint', { email: settings?.email || '' })}
                          </p>
                        </div>
                        <Button variant="outline" onClick={handleTestEmail} disabled={testingEmail}>
                          {testingEmail ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          {t('sendTestEmail')}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="smtp_host">{t('smtpHost')}</Label>
                          <Input
                            id="smtp_host"
                            value={settings?.smtp_host || ''}
                            onChange={(e) => setSettings((s) => (s ? { ...s, smtp_host: e.target.value } : null))}
                            placeholder="smtp.gmail.com"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="smtp_port">{t('smtpPort')}</Label>
                          <Input
                            id="smtp_port"
                            type="number"
                            value={settings?.smtp_port || 587}
                            onChange={(e) =>
                              setSettings((s) => (s ? { ...s, smtp_port: parseInt(e.target.value) || 587 } : null))
                            }
                            placeholder="587"
                          />
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="smtp_user">{t('smtpUser')}</Label>
                          <Input
                            id="smtp_user"
                            value={settings?.smtp_user || ''}
                            onChange={(e) => setSettings((s) => (s ? { ...s, smtp_user: e.target.value } : null))}
                            placeholder={t('smtpUserPlaceholder')}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="smtp_password">{t('smtpPassword')}</Label>
                          <Input
                            id="smtp_password"
                            type="password"
                            value={settings?.smtp_password || ''}
                            onChange={(e) => setSettings((s) => (s ? { ...s, smtp_password: e.target.value } : null))}
                            placeholder="••••••••"
                          />
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="smtp_from_email">{t('smtpFromEmail')}</Label>
                          <Input
                            id="smtp_from_email"
                            type="email"
                            value={settings?.smtp_from_email || ''}
                            onChange={(e) => setSettings((s) => (s ? { ...s, smtp_from_email: e.target.value } : null))}
                            placeholder={t('smtpFromPlaceholder')}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="smtp_from_name">{t('smtpFromName')}</Label>
                          <Input
                            id="smtp_from_name"
                            value={settings?.smtp_from_name || ''}
                            onChange={(e) => setSettings((s) => (s ? { ...s, smtp_from_name: e.target.value } : null))}
                            placeholder={t('smtpFromNamePlaceholder')}
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t flex items-center justify-between">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">{t('testConnection')}</p>
                          <p className="text-xs text-muted-foreground">
                            {t('testConnectionHint', { email: settings?.email || '' })}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={handleTestEmail}
                          disabled={testingEmail || !settings?.smtp_host}
                        >
                          {testingEmail ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4 mr-2" />
                          )}
                          {t('sendTestEmail')}
                        </Button>
                      </div>

                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">
                          <strong>Gmail:</strong> {t('smtpGmail')}
                          <br />
                          <strong>Outlook:</strong> {t('smtpOutlook')}
                          <br />
                          <strong>{t('smtpCustom')}</strong>
                        </p>
                      </div>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Save button for email */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="lg">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tc('saveSettings')}
            </Button>
          </div>
        </TabsContent>

        {/* Calendar Tab */}
        <TabsContent value="calendar">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {t('calendarSubscription')}
              </CardTitle>
              <CardDescription>{t('calendarSubscriptionDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {calendarUrl.includes('localhost') ? (
                <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                  <p className="font-medium text-sm">{t('localDevTitle')}</p>
                  <p className="text-xs mt-1">{t('localDevWarning')}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{isTeam ? t('personalCalendar') : t('subscriptionUrl')}</Label>
                    {isTeam && <p className="text-xs text-muted-foreground">{t('personalCalendarDesc')}</p>}
                    <div className="flex gap-2">
                      <Input value={calendarUrl} readOnly className="font-mono text-sm" />
                      <Button variant="outline" onClick={copyCalendarUrl} className="shrink-0">
                        {calendarCopied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>

                  {isTeam && (
                    <div className="space-y-2">
                      <Label>{t('sharedCalendar')}</Label>
                      <p className="text-xs text-muted-foreground">{t('sharedCalendarDesc')}</p>
                      <div className="flex gap-2">
                        <Input value={sharedCalendarUrl} readOnly className="font-mono text-sm" />
                        <Button variant="outline" onClick={copySharedCalendarUrl} className="shrink-0">
                          {sharedCalendarCopied ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <h4 className="font-medium text-sm">{t('googleCalendar')}</h4>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>{t('googleCalendarStep1')}</li>
                    <li>{t('googleCalendarStep2')}</li>
                    <li>{t('googleCalendarStep3')}</li>
                    <li>{t('googleCalendarStep4')}</li>
                  </ol>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <h4 className="font-medium text-sm">{t('appleCalendar')}</h4>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>{t('appleCalendarStep1')}</li>
                    <li>{t('appleCalendarStep2')}</li>
                    <li>{t('appleCalendarStep3')}</li>
                    <li>{t('appleCalendarStep4')}</li>
                  </ol>
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t">
                <Label htmlFor="calendar_timezone">{t('calendarTimezone')}</Label>
                <Select
                  value={settings?.timezone || 'Europe/Stockholm'}
                  onValueChange={(value) => setSettings((s) => (s ? { ...s, timezone: value } : null))}
                >
                  <SelectTrigger className="w-full sm:w-[300px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Europe/Stockholm">Europe/Stockholm (CET/CEST)</SelectItem>
                    <SelectItem value="Europe/London">Europe/London (GMT/BST)</SelectItem>
                    <SelectItem value="Europe/Berlin">Europe/Berlin (CET/CEST)</SelectItem>
                    <SelectItem value="Europe/Paris">Europe/Paris (CET/CEST)</SelectItem>
                    <SelectItem value="America/New_York">America/New_York (ET)</SelectItem>
                    <SelectItem value="America/Chicago">America/Chicago (CT)</SelectItem>
                    <SelectItem value="America/Denver">America/Denver (MT)</SelectItem>
                    <SelectItem value="America/Los_Angeles">America/Los_Angeles (PT)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                    <SelectItem value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('calendarTimezoneHint')}</p>
              </div>

              <p className="text-xs text-muted-foreground">{t('calendarAutoUpdate')}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team Tab */}
        <TabsContent value="team">
          <TeamSettings />
        </TabsContent>

        {/* API Tab */}
        <TabsContent value="api">
          <ApiKeysSettings />
        </TabsContent>

        {/* Subscription Tab */}
        <TabsContent value="subscription">
          <SubscriptionSettings />
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6">
          {/* Feedback */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                {t('feedbackTitle')}
              </CardTitle>
              <CardDescription>{t('feedbackDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <a href="mailto:support@babalisk.com" className="inline-block">
                <Button variant="outline">
                  <Send className="h-4 w-4 mr-2" />
                  {t('sendFeedback')}
                </Button>
              </a>
            </CardContent>
          </Card>

          {/* Delete account */}
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                {t('deleteAccountTitle')}
              </CardTitle>
              <CardDescription>{t('deleteAccountDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
                {t('deleteAccountButton')}
              </Button>
            </CardContent>
          </Card>

          {/* Delete confirmation dialog */}
          <AlertDialog
            open={deleteDialogOpen}
            onOpenChange={(open) => {
              setDeleteDialogOpen(open)
              if (!open) setDeleteConfirmText('')
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('deleteAccountTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('deleteAccountDesc')}</AlertDialogDescription>
              </AlertDialogHeader>
              <div className="py-4">
                <Label htmlFor="delete-confirm">{t('deleteAccountConfirm')}</Label>
                <Input
                  id="delete-confirm"
                  className="mt-2"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  autoComplete="off"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>{tc('cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteConfirmText !== 'DELETE' || deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={async (e) => {
                    e.preventDefault()
                    setDeleting(true)
                    try {
                      const res = await fetch('/api/account', { method: 'DELETE' })
                      if (!res.ok) {
                        const data = await res.json()
                        toast.error(data.error || 'Failed to delete account')
                        setDeleting(false)
                        return
                      }
                      await supabase.auth.signOut()
                      window.location.href = '/login'
                    } catch {
                      toast.error('Failed to delete account')
                      setDeleting(false)
                    }
                  }}
                >
                  {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('deleteAccountButton')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>
      </Tabs>
    </PageTransition>
  )
}
