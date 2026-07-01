'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { readJsonSafe } from '@/lib/http'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Music, Loader2, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'

export default function SetupMemberPage() {
  const t = useTranslations('auth')
  const supabase = createClient()

  const [step, setStep] = useState(0) // 0 = password, 1 = info
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handlePasswordStep(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError(t('passwordsNoMatch'))
      return
    }

    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setStep(1)
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const res = await fetch('/api/auth/setup-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: fullName, phone }),
    })

    if (!res.ok) {
      const data = await readJsonSafe<{ error?: string }>(res)
      setError(data?.error || 'Failed to save')
      setSaving(false)
      return
    }

    toast.success(t('setupComplete'))
    window.location.href = '/dashboard'
  }

  const steps = [t('setPassword'), t('yourInfo')]

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-950 dark:to-gray-900 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Music className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">{t('welcomeMember')}</CardTitle>
          <CardDescription>{t('welcomeMemberDesc')}</CardDescription>

          {/* Step indicator */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {steps.map((label, i) => (
              <div key={i} className="flex items-center gap-1">
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    i < step
                      ? 'bg-primary text-primary-foreground'
                      : i === step
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i < step ? <Check className="h-3 w-3" /> : i + 1}
                </div>
                <span className={`text-xs ${i === step ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
                {i < steps.length - 1 && <div className="w-8 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>
        </CardHeader>

        <CardContent>
          {error && <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg mb-4">{error}</div>}

          {step === 0 && (
            <form onSubmit={handlePasswordStep} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t('newPassword')}</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t('minChars')}
                  required
                  minLength={6}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t('repeatPassword')}
                  required
                  minLength={6}
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('setPassword')}
              </Button>
            </form>
          )}

          {step === 1 && (
            <form onSubmit={handleComplete} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">{t('fullName')}</Label>
                <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">{t('phone')}</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('completeSetup')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
