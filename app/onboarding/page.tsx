'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Music,
  Building2,
  Guitar,
  Users,
  ChevronRight,
  ChevronLeft,
  Check,
  Plus,
  X,
  Loader2,
  Sparkles,
  Globe,
  Copy,
  CalendarDays,
  PartyPopper,
  Star,
} from 'lucide-react'
import { useLocale } from 'next-intl'
import { toast } from 'sonner'
import { COUNTRY_CONFIGS, getCountryConfig } from '@/lib/country-config'
import { isNative } from '@/lib/capacitor'

type GigTypeLocal = {
  tempId: string
  name: string
  name_en: string
  vat_rate: number
  color: string
}

type PositionLocal = {
  tempId: string
  name: string
  sort_order: number
}

function getGigTypePresets(
  locale: string,
  countryCode: string,
): { name: string; name_en: string; vat_rate: number; color: string }[] {
  const config = getCountryConfig(countryCode)
  const vat = config.defaultVatRates
  if (locale === 'sv') {
    return [
      { name: 'Konsert', name_en: 'Concert', vat_rate: vat.concert, color: '#3b82f6' },
      { name: 'Inspelning', name_en: 'Recording', vat_rate: vat.recording, color: '#8b5cf6' },
      { name: 'Undervisning', name_en: 'Teaching', vat_rate: vat.teaching, color: '#10b981' },
      { name: 'Utgifter', name_en: 'Expenses', vat_rate: vat.expenses, color: '#6b7280' },
    ]
  }
  return [
    { name: 'Concert', name_en: 'Concert', vat_rate: vat.concert, color: '#3b82f6' },
    { name: 'Recording', name_en: 'Recording', vat_rate: vat.recording, color: '#8b5cf6' },
    { name: 'Teaching', name_en: 'Teaching', vat_rate: vat.teaching, color: '#10b981' },
    { name: 'Expenses', name_en: 'Expenses', vat_rate: vat.expenses, color: '#6b7280' },
  ]
}

const POSITION_PRESETS: Record<string, string[]> = {
  sv: ['1:a konsertmästare', 'Stämledare', 'Tutti'],
  en: ['1st concertmaster', 'Section leader', 'Tutti'],
}

let tempIdCounter = 0
function nextTempId() {
  return `temp_${++tempIdCounter}`
}

export default function OnboardingPage() {
  const t = useTranslations('onboarding')
  const tc = useTranslations('common')
  const tSettings = useTranslations('settings')
  const tToast = useTranslations('toast')
  const locale = useLocale()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [calendarUrl, setCalendarUrl] = useState('')
  const [calendarCopied, setCalendarCopied] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const tSub = useTranslations('subscription')
  const router = useRouter()
  const supabase = createClient()

  const STEPS = [
    { label: t('languageAndCountry'), icon: Globe },
    { label: t('companyInfo'), icon: Building2 },
    { label: t('categories'), icon: Guitar },
    { label: t('gigTypes'), icon: Music },
    { label: t('roles'), icon: Users },
  ]

  // Step 1: Country
  const [countryCode, setCountryCode] = useState('SE')
  const countryConfig = getCountryConfig(countryCode)

  // Step 2: Personal name + Company info (reduced — bank/VAT filled in Settings)
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [orgNumber, setOrgNumber] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [email, setEmail] = useState('')

  // Step 3: Categories + free text
  const [instrumentsText, setInstrumentsText] = useState('')
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set())
  const [allCategories, setAllCategories] = useState<
    { id: string; name: string; name_en: string | null; sort_order: number }[]
  >([])

  // Step 4: Gig types (local state only — saved on complete)
  const [gigTypes, setGigTypes] = useState<GigTypeLocal[]>([])
  const [newGigTypeName, setNewGigTypeName] = useState('')
  const [newGigTypeVat, setNewGigTypeVat] = useState('')

  // Step 5: Positions (local state only — saved on complete)
  const [positions, setPositions] = useState<PositionLocal[]>([])
  const [newPositionName, setNewPositionName] = useState('')

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: loads initial onboarding data
  }, [])

  async function loadData() {
    // Pre-fill name from user_metadata (set by admin when creating user)
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user?.user_metadata?.full_name && !fullName) {
      setFullName(user.user_metadata.full_name)
    }

    // Load company settings (pre-filled from signup)
    const { data: settings } = await supabase
      .from('company_settings')
      .select('company_name, org_number, address, email, phone, bank_account, country_code, instruments_text')
      .limit(1)
      .single()

    if (settings) {
      setCompanyName(settings.company_name || '')
      setOrgNumber(settings.org_number || '')
      setAddress(settings.address || '')
      setEmail(settings.email || '')
      if (settings.country_code) setCountryCode(settings.country_code)
      setInstrumentsText(settings.instruments_text || '')
    }

    // Load categories catalog
    const { data: cats } = await supabase
      .from('instrument_categories')
      .select('id, name, sort_order')
      .order('sort_order')
    if (cats) {
      const { data: enData } = await supabase.from('instrument_categories').select('id, name_en')
      const enMap = new Map<string, string | null>()
      if (enData) for (const r of enData) enMap.set(r.id, r.name_en)
      setAllCategories(cats.map((c) => ({ ...c, name_en: enMap.get(c.id) || null })))
    }

    // Load existing user_categories
    const { data: userCats } = await supabase.from('user_categories').select('category_id')
    if (userCats && userCats.length > 0) {
      setSelectedCategoryIds(new Set(userCats.map((uc) => uc.category_id)))
    }
  }

  function addGigType() {
    if (!newGigTypeName.trim()) return
    setGigTypes((prev) => [
      ...prev,
      {
        tempId: nextTempId(),
        name: newGigTypeName.trim(),
        name_en: '',
        vat_rate: parseFloat(newGigTypeVat) || 0,
        color: '#6b7280',
      },
    ])
    setNewGigTypeName('')
    setNewGigTypeVat('')
  }

  function removeGigType(tempId: string) {
    setGigTypes((prev) => prev.filter((t) => t.tempId !== tempId))
  }

  function addPosition() {
    if (!newPositionName.trim()) return
    const sortOrder = positions.length + 1
    setPositions((prev) => [
      ...prev,
      {
        tempId: nextTempId(),
        name: newPositionName.trim(),
        sort_order: sortOrder,
      },
    ])
    setNewPositionName('')
  }

  function removePosition(tempId: string) {
    setPositions((prev) => prev.filter((p) => p.tempId !== tempId))
  }

  function quickAddGigType(preset: { name: string; name_en: string; vat_rate: number; color: string }) {
    setGigTypes((prev) => [
      ...prev,
      {
        tempId: nextTempId(),
        ...preset,
      },
    ])
  }

  function quickAddPosition(name: string) {
    const sortOrder = positions.length + 1
    setPositions((prev) => [
      ...prev,
      {
        tempId: nextTempId(),
        name,
        sort_order: sortOrder,
      },
    ])
  }

  const gigTypePresets = getGigTypePresets(locale, countryCode).filter(
    (p) => !gigTypes.some((gt) => gt.name.toLowerCase() === p.name.toLowerCase()),
  )

  const positionPresets = (POSITION_PRESETS[locale] || POSITION_PRESETS.en).filter(
    (p) => !positions.some((pos) => pos.name.toLowerCase() === p.toLowerCase()),
  )

  async function handleComplete() {
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName || undefined,
          locale,
          company_info: {
            company_name: companyName,
            org_number: orgNumber,
            address,
            city,
            email,
            country_code: countryCode,
            base_currency: countryConfig.currency,
          },
          instruments_text: instrumentsText,
          category_ids: Array.from(selectedCategoryIds),
          gig_types: gigTypes.map((gt) => ({
            name: gt.name,
            name_en: gt.name_en,
            vat_rate: gt.vat_rate,
            color: gt.color,
          })),
          positions: positions.map((p) => ({
            name: p.name,
            sort_order: p.sort_order,
          })),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || tToast('onboardingSaveError'))
      }

      // Fetch calendar token to build URL
      const { data: settingsData } = await supabase.from('company_settings').select('calendar_token').limit(1).single()
      const {
        data: { user: currentUser },
      } = await supabase.auth.getUser()

      if (settingsData?.calendar_token && currentUser) {
        setCalendarUrl(
          `${window.location.origin}/api/calendar/feed?user=${currentUser.id}&token=${settingsData.calendar_token}`,
        )
      }

      setCompleted(true)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : tToast('onboardingCompleteError'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        {!completed && (
          <div className="text-center mb-8">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Music className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold">{t('welcome')}</h1>
            <p className="text-muted-foreground mt-1">{t('setupDescription')}</p>
          </div>
        )}

        {/* Completion screen */}
        {completed && (
          <div className="space-y-6">
            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <PartyPopper className="h-7 w-7 text-green-600 dark:text-green-400" />
                </div>
                <CardTitle className="text-xl">{t('allDone')}</CardTitle>
                <CardDescription>{t('allDoneDesc')}</CardDescription>
              </CardHeader>
            </Card>

            {/* Upgrade CTA */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold">{tSub('upgradeToPro')}</h3>
                </div>
                <ul className="space-y-2 mb-6 text-sm">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    {tSub('proFeature1')}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    {tSub('proFeature2')}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    {tSub('proFeature3')}
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary shrink-0" />
                    {tSub('proFeature4')}
                  </li>
                </ul>
                <Button
                  className="w-full"
                  disabled={upgrading}
                  onClick={async () => {
                    if (isNative()) {
                      setUpgrading(true)
                      try {
                        const { NativePurchases } = await import('@capgo/native-purchases')
                        await NativePurchases.purchaseProduct({ productIdentifier: 'amida_pro_monthly' })
                        router.push('/dashboard')
                        router.refresh()
                      } catch {
                        toast.error(tToast('checkoutError'))
                      } finally {
                        setUpgrading(false)
                      }
                    } else {
                      setUpgrading(true)
                      try {
                        const res = await fetch('/api/stripe/create-checkout', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_MONTHLY_PRICE_ID || '',
                            plan: 'pro',
                          }),
                        })
                        const data = await res.json()
                        if (data.url) {
                          window.location.href = data.url
                        } else {
                          throw new Error(data.error)
                        }
                      } catch {
                        toast.error(tToast('checkoutError'))
                        setUpgrading(false)
                      }
                    }
                  }}
                >
                  {upgrading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {tSub('tryProFree')}
                </Button>
              </CardContent>
            </Card>

            {/* Calendar URL */}
            {calendarUrl && (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 font-medium text-sm">
                      <CalendarDays className="h-4 w-4" />
                      {tSettings('calendarSubscription')}
                    </div>
                    <p className="text-xs text-muted-foreground">{tSettings('calendarSubscriptionDesc')}</p>
                    <div className="flex gap-2">
                      <Input value={calendarUrl} readOnly className="text-xs" />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          await navigator.clipboard.writeText(calendarUrl)
                          setCalendarCopied(true)
                          setTimeout(() => setCalendarCopied(false), 2000)
                        }}
                      >
                        {calendarCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Continue with Free */}
            <Button
              variant="ghost"
              size="lg"
              className="w-full text-muted-foreground"
              onClick={() => {
                router.push('/dashboard')
                router.refresh()
              }}
            >
              {t('continueWithFree')}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Step indicator */}
        {!completed && (
          <>
            <div className="flex items-center justify-center gap-2 mb-8">
              {STEPS.map((s, i) => {
                const Icon = s.icon
                return (
                  <div key={i} className="flex items-center gap-2">
                    <button
                      onClick={() => i < step && setStep(i)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        i === step
                          ? 'bg-primary text-primary-foreground'
                          : i < step
                            ? 'bg-primary/20 text-primary cursor-pointer'
                            : 'bg-secondary text-muted-foreground'
                      }`}
                    >
                      {i < step ? <Check className="h-3 w-3" /> : <Icon className="h-3 w-3" />}
                      <span className="hidden sm:inline">{s.label}</span>
                      <span className="sm:hidden">{i + 1}</span>
                    </button>
                    {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                )
              })}
            </div>

            {/* Step 0: Language & Country */}
            {step === 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" />
                    {t('languageAndCountry')}
                  </CardTitle>
                  <CardDescription>{t('languageAndCountryDesc')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Language selection */}
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { value: 'sv', label: 'Svenska', flag: '🇸🇪' },
                      { value: 'en', label: 'English', flag: '🇬🇧' },
                    ].map((lang) => (
                      <button
                        key={lang.value}
                        onClick={() => {
                          if (lang.value !== locale) {
                            document.cookie = `NEXT_LOCALE=${lang.value};path=/;max-age=${60 * 60 * 24 * 365}`
                            window.location.reload()
                          }
                        }}
                        className={`flex flex-col items-center gap-2 p-4 rounded-lg border-2 text-base font-medium transition-colors ${
                          locale === lang.value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border hover:border-primary/50 hover:bg-muted'
                        }`}
                      >
                        <span className="text-2xl">{lang.flag}</span>
                        {lang.label}
                      </button>
                    ))}
                  </div>

                  {/* Country selection */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">{t('country')}</Label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {Object.entries(COUNTRY_CONFIGS).map(([code, config]) => (
                        <button
                          key={code}
                          onClick={() => setCountryCode(code)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                            countryCode === code
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border hover:border-primary/50 hover:bg-muted'
                          }`}
                        >
                          <span className="text-lg">{config.flag}</span>
                          {locale === 'sv' ? config.name.sv : config.name.en}
                        </button>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 1: Company Info (reduced) */}
            {step === 1 && (
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
                    <Label htmlFor="fullName">{t('yourName')}</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('yourNamePlaceholder')}
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="companyName">{tSettings('companyName')}</Label>
                      <Input id="companyName" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="orgNumber">
                        {locale === 'sv' ? countryConfig.orgLabel.sv : countryConfig.orgLabel.en}
                      </Label>
                      <Input
                        id="orgNumber"
                        value={orgNumber}
                        onChange={(e) => setOrgNumber(e.target.value)}
                        placeholder={countryConfig.orgPlaceholder}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">{tSettings('address')}</Label>
                    <Textarea
                      id="address"
                      rows={2}
                      className="resize-none"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="city">{t('city')}</Label>
                      <Input
                        id="city"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder={countryCode === 'SE' ? 'Stockholm' : 'Berlin'}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">{tSettings('email')}</Label>
                      <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Categories + free text */}
            {step === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Guitar className="h-5 w-5" />
                    {t('yourCategories')}
                  </CardTitle>
                  <CardDescription>{t('selectYourCategories')}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Category chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {allCategories.map((cat) => {
                      const selected = selectedCategoryIds.has(cat.id)
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => {
                            setSelectedCategoryIds((prev) => {
                              const next = new Set(prev)
                              if (next.has(cat.id)) next.delete(cat.id)
                              else next.add(cat.id)
                              return next
                            })
                          }}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                            selected
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                          }`}
                        >
                          {selected && <Check className="h-3 w-3" />}
                          {locale === 'en' && cat.name_en ? cat.name_en : cat.name}
                        </button>
                      )
                    })}
                  </div>

                  {/* Free text for unlisted skills */}
                  <div className="space-y-2">
                    <Label>{t('otherSkills')}</Label>
                    <Textarea
                      rows={2}
                      value={instrumentsText}
                      onChange={(e) => setInstrumentsText(e.target.value)}
                      placeholder={
                        locale === 'sv'
                          ? 'T.ex. Barockviolin, Fotografi, Ljudteknik'
                          : 'E.g. Baroque violin, Photography, Sound engineering'
                      }
                    />
                    <p className="text-xs text-muted-foreground">{t('otherSkillsHint')}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Gig Types */}
            {step === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Music className="h-5 w-5" />
                    {t('gigTypes')}
                  </CardTitle>
                  <CardDescription>{t('gigTypesDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    {gigTypes.map((type) => (
                      <div
                        key={type.tempId}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: type.color }} />
                          <span className="text-sm font-medium">{type.name}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {type.vat_rate}% {t('vat')}
                          </Badge>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeGigType(type.tempId)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {gigTypePresets.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                        <Sparkles className="h-3 w-3" />
                        {t('quickAdd')}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {gigTypePresets.map((preset) => (
                          <button
                            key={preset.name}
                            onClick={() => quickAddGigType(preset)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                          >
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: preset.color }} />
                            {preset.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={newGigTypeName}
                      onChange={(e) => setNewGigTypeName(e.target.value)}
                      placeholder={t('newGigTypePlaceholder')}
                      onKeyDown={(e) => e.key === 'Enter' && addGigType()}
                      className="flex-1"
                    />
                    <div className="relative w-20">
                      <Input
                        type="number"
                        value={newGigTypeVat}
                        onChange={(e) => setNewGigTypeVat(e.target.value)}
                        placeholder={t('vat')}
                        onKeyDown={(e) => e.key === 'Enter' && addGigType()}
                        className="pr-6"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                    </div>
                    <Button onClick={addGigType} size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-1" />
                      {tc('add')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Positions */}
            {step === 4 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    {t('rolesPositions')}
                  </CardTitle>
                  <CardDescription>{t('rolesDesc')}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    {positions.map((pos) => (
                      <div
                        key={pos.tempId}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/50"
                      >
                        <span className="text-sm font-medium">{pos.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePosition(pos.tempId)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {positionPresets.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                        <Sparkles className="h-3 w-3" />
                        {t('quickAdd')}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {positionPresets.map((name) => (
                          <button
                            key={name}
                            onClick={() => quickAddPosition(name)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-dashed border-muted-foreground/30 text-xs text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-colors"
                          >
                            <Plus className="h-2.5 w-2.5" />
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      value={newPositionName}
                      onChange={(e) => setNewPositionName(e.target.value)}
                      placeholder={t('newRolePlaceholder')}
                      onKeyDown={(e) => e.key === 'Enter' && addPosition()}
                    />
                    <Button onClick={addPosition} size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-1" />
                      {tc('add')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {tc('back')}
              </Button>

              {step < STEPS.length - 1 ? (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={step === 2 && selectedCategoryIds.size === 0 && !instrumentsText.trim()}
                >
                  {tc('next')}
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button onClick={handleComplete} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {t('finish')}
                  <Check className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
