import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/navigation/header'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages } from 'next-intl/server'
import { SessionTracker } from '@/components/session-tracker'
import { GlobalErrorHandler } from '@/components/global-error-handler'
import { createClient } from '@/lib/supabase/server'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { AuthHashHandler } from '@/components/auth-hash-handler'
import { BottomNav } from '@/components/navigation/bottom-nav'
import { SwRegister } from '@/components/sw-register'
import { NativeInit } from '@/components/native-init'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: {
    default: 'Amida — Event & invoice management for musicians',
    template: '%s — Amida',
  },
  description:
    'Event and invoice management for freelance musicians. Track events, generate invoices, scan receipts — all in one place.',
  metadataBase: new URL('https://amida.babalisk.com'),
  openGraph: {
    title: 'Amida',
    description: 'Event and invoice management for freelance musicians',
    url: 'https://amida.babalisk.com',
    siteName: 'Amida',
    locale: 'sv_SE',
    type: 'website',
    images: [
      { url: '/og-image.png', width: 1200, height: 630, alt: 'Amida — Event & invoice management for musicians' },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Amida',
    description: 'Event and invoice management for freelance musicians',
    images: ['/og-image.png'],
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Amida',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0B1E3A',
  viewportFit: 'cover',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body data-authed={user ? '' : undefined} className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            {user ? (
              <div className="h-full flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto overscroll-none bg-background">
                  <SessionTracker />
                  <GlobalErrorHandler />
                  <div className="p-4 pt-2 pb-4 md:px-6 md:pt-4 md:pb-6 max-w-[1600px] mx-auto w-full">{children}</div>
                </main>
                <BottomNav />
              </div>
            ) : (
              children
            )}
            <Toaster />
            <AuthHashHandler />
          </ThemeProvider>
        </NextIntlClientProvider>
        <SwRegister />
        <NativeInit />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
