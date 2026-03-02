'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Plus, X } from 'lucide-react'
import { useTranslations } from 'next-intl'

type Props = {
  configValues: Record<string, string>
  setConfigValues: React.Dispatch<React.SetStateAction<Record<string, string>>>
  savingConfig: boolean
  onSave: () => void
}

function FeatureListEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const t = useTranslations('admin')
  const [newKey, setNewKey] = useState('')

  let items: string[] = []
  try {
    const parsed = JSON.parse(value || '[]')
    items = Array.isArray(parsed) ? parsed : []
  } catch {
    items = []
  }

  function addItem() {
    const key = newKey.trim()
    if (!key || items.includes(key)) return
    onChange(JSON.stringify([...items, key]))
    setNewKey('')
  }

  function removeItem(index: number) {
    onChange(JSON.stringify(items.filter((_, i) => i !== index)))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-secondary text-xs font-mono">
            {item}
            <button
              type="button"
              onClick={() => removeItem(i)}
              className="text-muted-foreground hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="unlimitedInvoices"
          className="font-mono text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addItem()
            }
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={addItem} disabled={!newKey.trim()}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          {t('addFeatureKey')}
        </Button>
      </div>
    </div>
  )
}

function TierSection({
  title,
  description,
  prefix,
  configValues,
  setConfigValues,
  showPricing,
  showFeatures,
}: {
  title: string
  description?: string
  prefix: string
  configValues: Record<string, string>
  setConfigValues: React.Dispatch<React.SetStateAction<Record<string, string>>>
  showPricing: boolean
  showFeatures: boolean
}) {
  const t = useTranslations('admin')

  const update = (key: string, value: string) => {
    setConfigValues((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('invoiceLimitLabel')}</Label>
            <Input
              type="number"
              min={0}
              value={configValues[`${prefix}_invoice_limit`] || '0'}
              onChange={(e) => update(`${prefix}_invoice_limit`, e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">{t('unlimitedHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('receiptScanLimitLabel')}</Label>
            <Input
              type="number"
              min={0}
              value={configValues[`${prefix}_receipt_scan_limit`] || '0'}
              onChange={(e) => update(`${prefix}_receipt_scan_limit`, e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">{t('unlimitedHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('emailSendLimitLabel')}</Label>
            <Input
              type="number"
              min={0}
              value={configValues[`${prefix}_email_send_limit`] || '0'}
              onChange={(e) => update(`${prefix}_email_send_limit`, e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">{t('unlimitedHint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('storageMbLabel')}</Label>
            <Input
              type="number"
              min={0}
              value={configValues[`${prefix}_storage_mb`] || '0'}
              onChange={(e) => update(`${prefix}_storage_mb`, e.target.value)}
            />
          </div>
        </div>

        {showPricing && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('displayPriceMonthly')}</Label>
              <Input
                type="number"
                min={0}
                value={configValues[`${prefix}_price_monthly`] || '0'}
                onChange={(e) => update(`${prefix}_price_monthly`, e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('displayPriceYearly')}</Label>
              <Input
                type="number"
                min={0}
                value={configValues[`${prefix}_price_yearly`] || '0'}
                onChange={(e) => update(`${prefix}_price_yearly`, e.target.value)}
              />
            </div>
            <p className="text-[10px] text-muted-foreground sm:col-span-2">{t('displayPriceHint')}</p>
          </div>
        )}

        {showFeatures && (
          <div className="pt-2 border-t space-y-1.5">
            <Label className="text-xs">{t('featuresLabel')}</Label>
            <FeatureListEditor
              value={configValues[`${prefix}_features`] || '[]'}
              onChange={(v) => update(`${prefix}_features`, v)}
            />
            <p className="text-[10px] text-muted-foreground">{t('featuresHint')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ConfigTab({ configValues, setConfigValues, savingConfig, onSave }: Props) {
  const t = useTranslations('admin')
  const tc = useTranslations('common')

  return (
    <div className="space-y-4">
      <TierSection
        title={t('tierFree')}
        prefix="free"
        configValues={configValues}
        setConfigValues={setConfigValues}
        showPricing={false}
        showFeatures={true}
      />

      <TierSection
        title={t('tierPro')}
        prefix="pro"
        configValues={configValues}
        setConfigValues={setConfigValues}
        showPricing={true}
        showFeatures={true}
      />

      <TierSection
        title={t('tierTeam')}
        prefix="team"
        configValues={configValues}
        setConfigValues={setConfigValues}
        showPricing={true}
        showFeatures={true}
      />

      {/* Branding & Email */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('brandingAndEmail')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t('brandingName')}</Label>
            <Input
              value={configValues['branding_name'] || 'Amida'}
              onChange={(e) => setConfigValues((prev) => ({ ...prev, branding_name: e.target.value }))}
              placeholder="Amida"
            />
            <p className="text-xs text-muted-foreground">{t('brandingNameHint')}</p>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-sm font-semibold">{t('resendEmail')}</h3>
            <div className="space-y-2">
              <Label>{t('resendApiKey')}</Label>
              <Input
                type="password"
                value={configValues['resend_api_key'] || ''}
                onChange={(e) => setConfigValues((prev) => ({ ...prev, resend_api_key: e.target.value }))}
                placeholder="re_..."
              />
            </div>
            <div className="space-y-2">
              <Label>{t('resendFromEmail')}</Label>
              <Input
                type="email"
                value={configValues['resend_from_email'] || ''}
                onChange={(e) => setConfigValues((prev) => ({ ...prev, resend_from_email: e.target.value }))}
                placeholder="faktura@example.com"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={onSave} disabled={savingConfig}>
        {savingConfig && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        {tc('save')}
      </Button>
    </div>
  )
}
