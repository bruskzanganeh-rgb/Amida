'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Loader2, Building2 } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

export default function SignupPage() {
  const t = useTranslations('auth')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [invitationCode, setInvitationCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  // Company invite token from URL
  const inviteToken = searchParams.get('invite') || ''
  const [inviteCompanyName, setInviteCompanyName] = useState<string | null>(null)
  const [inviteValid, setInviteValid] = useState<boolean | null>(null)
  const [inviteLoading, setInviteLoading] = useState(!!inviteToken)
  const [inviteError, setInviteError] = useState('')

  // Validate invite token on mount
  useEffect(() => {
    if (!inviteToken) return

    async function validateToken() {
      try {
        const res = await fetch('/api/invitations/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: inviteToken }),
        })
        const data = await res.json()

        if (data.valid) {
          setInviteValid(true)
          setInviteCompanyName(data.company_name)
        } else {
          setInviteValid(false)
          if (data.reason === 'expired') {
            setInviteError(t('inviteExpired'))
          } else {
            setInviteError(t('inviteInvalid'))
          }
        }
      } catch {
        setInviteValid(false)
        setInviteError(t('inviteInvalid'))
      } finally {
        setInviteLoading(false)
      }
    }

    validateToken()
  }, [inviteToken, t])

  const isInviteFlow = inviteToken && inviteValid === true

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    // For normal signup (not invite), validate invitation code
    if (!isInviteFlow) {
      if (!invitationCode.trim()) {
        setError(t('invitationCodeRequired'))
        setLoading(false)
        return
      }

      const codeRes = await fetch('/api/auth/validate-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: invitationCode }),
      })
      const codeData = await codeRes.json()

      if (!codeData.valid) {
        setError(codeData.reason === 'expired' ? t('codeExpired') : t('invalidCode'))
        setLoading(false)
        return
      }
    }

    const { data, error: signupError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (signupError) {
      setError(signupError.message)
      setLoading(false)
      return
    }

    // Set up user via server-side API (uses service_role key to bypass RLS,
    // since there's no session yet before email confirmation)
    if (data.user) {
      await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: data.user.id,
          company_name: isInviteFlow ? '' : companyName,
          invitation_code: isInviteFlow ? undefined : invitationCode,
          invitation_token: isInviteFlow ? inviteToken : undefined,
        }),
      })
    }

    // If email confirmation is required
    if (data.user && !data.session) {
      setSuccess(true)
    } else {
      router.push('/dashboard')
      router.refresh()
    }

    setLoading(false)
  }

  if (success) {
    return (
      <div className="dark min-h-screen flex items-center justify-center bg-[#0B1E3A] p-4">
        <Card className="w-full max-w-md bg-[#102544] border-[#1a3a5c]">
          <CardHeader className="text-center">
            <Image src="/logo.png" alt="Amida" width={64} height={64} className="mx-auto mb-4 rounded-xl" />
            <CardTitle>{t('checkEmail')}</CardTitle>
            <CardDescription>
              {t.rich('confirmationSent', {
                email,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button variant="outline" className="w-full">
                {t('backToLogin')}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show loading while validating invite token
  if (inviteLoading) {
    return (
      <div className="dark min-h-screen flex items-center justify-center bg-[#0B1E3A] p-4">
        <Card className="w-full max-w-md bg-[#102544] border-[#1a3a5c]">
          <CardHeader className="text-center">
            <Image src="/logo.png" alt="Amida" width={64} height={64} className="mx-auto mb-4" />
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="dark min-h-screen flex items-center justify-center bg-[#0B1E3A] p-4">
      <Card className="w-full max-w-md bg-[#102544] border-[#1a3a5c]">
        <CardHeader className="text-center">
          <Image src="/logo.png" alt="Amida" width={64} height={64} className="mx-auto mb-4" />
          <CardTitle className="text-2xl">{t('signup')}</CardTitle>
          {isInviteFlow ? (
            <div className="flex items-center justify-center gap-2 mt-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <Building2 className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-primary">
                {t('joiningCompany', { company: inviteCompanyName || '' })}
              </span>
            </div>
          ) : (
            <CardDescription>{t('signupFree')}</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {/* Invalid invite warning */}
          {inviteToken && inviteValid === false && (
            <div className="p-3 text-sm text-red-400 bg-red-950/50 rounded-lg mb-4">{inviteError}</div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            {error && <div className="p-3 text-sm text-red-400 bg-red-950/50 rounded-lg">{error}</div>}

            {/* Invitation code — only for normal signup */}
            {!isInviteFlow && (
              <div className="space-y-2">
                <Label htmlFor="invitationCode">{t('invitationCode')}</Label>
                <Input
                  id="invitationCode"
                  value={invitationCode}
                  onChange={(e) => setInvitationCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  required={!isInviteFlow}
                  className="uppercase tracking-widest font-mono"
                />
              </div>
            )}

            {/* Company name — only for normal signup */}
            {!isInviteFlow && (
              <div className="space-y-2">
                <Label htmlFor="companyName">{t('companyName')}</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Your Company AB"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('minChars')}
                required
                minLength={6}
              />
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm text-muted-foreground">
                {t.rich('acceptTerms', {
                  terms: (chunks) => (
                    <Link href="/terms" target="_blank" className="text-primary hover:underline">
                      {chunks}
                    </Link>
                  ),
                  privacy: (chunks) => (
                    <Link href="/privacy" target="_blank" className="text-primary hover:underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </label>
            <Button type="submit" className="w-full" disabled={loading || !termsAccepted}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('createAccount')}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            {t('hasAccount')}{' '}
            <Link href="/login" className="text-primary hover:underline">
              {t('login')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
