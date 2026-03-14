import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Calendar, FileText, Receipt, CalendarDays, ArrowRight } from 'lucide-react'
import Image from 'next/image'
import type { Metadata } from 'next'
import { AnimatedSection, AnimatedDiv, AnimatedP, AnimatedH1, AnimatedH2 } from '@/components/landing/animated-wrapper'
import { PricingSection } from '@/components/landing/pricing-section'

export const metadata: Metadata = {
  title: 'Event & invoice management for freelance musicians',
  description:
    'Stop juggling spreadsheets. Track events, generate invoices and scan receipts — all in one place built for freelance musicians.',
  alternates: { canonical: 'https://amida.babalisk.com' },
}

const features = [
  {
    icon: Calendar,
    title: 'Event management',
    desc: 'Track every event, rehearsal and session — dates, fees and status at a glance.',
  },
  {
    icon: FileText,
    title: 'Invoicing',
    desc: 'Generate professional invoices with correct VAT in seconds. Send directly via email.',
  },
  {
    icon: Receipt,
    title: 'Receipt scanning',
    desc: 'Snap a photo and AI reads amounts, dates and suppliers automatically.',
  },
  {
    icon: CalendarDays,
    title: 'Calendar sync',
    desc: 'See all your events in a calendar. Syncs with Apple Calendar and Google Calendar.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0B1E3A]">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Amida',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            url: 'https://amida.babalisk.com',
            offers: {
              '@type': 'AggregateOffer',
              lowPrice: '0',
              highPrice: '19.99',
              priceCurrency: 'USD',
              offerCount: '3',
            },
            description:
              'Event and invoice management for freelance musicians. Track events, generate invoices and scan receipts.',
          }),
        }}
      />

      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[#1a3a5c] bg-[#0B1E3A]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Amida" width={32} height={32} />
            <span className="text-lg font-semibold tracking-tight text-white">Amida</span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" className="text-[#C7D2FE] hover:text-white hover:bg-white/10" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button size="sm" className="bg-[#F59E0B] text-[#0B1E3A] hover:bg-[#F59E0B]/90 font-medium" asChild>
              <Link href="/signup">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <AnimatedSection animate className="mx-auto max-w-5xl px-6 pt-24 pb-20 md:pt-36 md:pb-28">
        <AnimatedP className="text-sm font-medium text-[#F59E0B] tracking-wide uppercase mb-4">
          Built for freelance musicians
        </AnimatedP>
        <AnimatedH1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-white max-w-2xl leading-[1.1]">
          Events, invoices and finances — all in one place.
        </AnimatedH1>
        <AnimatedP className="mt-6 text-lg text-[#C7D2FE] max-w-xl leading-relaxed">
          Stop juggling spreadsheets. Amida gives you everything you need to manage your music career — so you can focus
          on playing.
        </AnimatedP>
        <AnimatedDiv className="mt-10 flex gap-3">
          <Button size="lg" className="bg-[#F59E0B] text-[#0B1E3A] hover:bg-[#F59E0B]/90 font-semibold" asChild>
            <Link href="/signup" className="gap-2">
              Start for free <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </AnimatedDiv>
      </AnimatedSection>

      {/* Features */}
      <AnimatedSection className="border-t border-[#1a3a5c] bg-[#102544]">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <AnimatedP className="text-sm font-medium text-[#F59E0B] tracking-wide uppercase mb-3">Features</AnimatedP>
          <AnimatedH2 className="text-3xl font-bold tracking-tight text-white mb-14">
            Everything you need, nothing you don&apos;t.
          </AnimatedH2>
          <div className="grid sm:grid-cols-2 gap-8">
            {features.map((feature) => (
              <AnimatedDiv key={feature.title} className="group">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-xl bg-[#F59E0B]/10 flex items-center justify-center shrink-0">
                    <feature.icon className="h-5 w-5 text-[#F59E0B]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white mb-1">{feature.title}</h3>
                    <p className="text-sm text-[#C7D2FE]/70 leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              </AnimatedDiv>
            ))}
          </div>
        </div>
      </AnimatedSection>

      {/* Pricing */}
      <section>
        <div className="mx-auto max-w-5xl px-6 py-24">
          <p className="text-sm font-medium text-[#F59E0B] tracking-wide uppercase mb-3">Pricing</p>
          <h2 className="text-3xl font-bold tracking-tight text-white mb-14">Simple, transparent pricing.</h2>
          <PricingSection />
        </div>
      </section>

      {/* CTA */}
      <AnimatedSection className="border-t border-[#1a3a5c] bg-[#102544]">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center">
          <AnimatedH2 className="text-3xl font-bold tracking-tight text-white mb-4">
            Ready to simplify your music business?
          </AnimatedH2>
          <AnimatedP className="text-[#C7D2FE] mb-8 max-w-md mx-auto">
            Join musicians who use Amida to spend less time on admin and more time making music.
          </AnimatedP>
          <AnimatedDiv>
            <Button size="lg" className="bg-[#F59E0B] text-[#0B1E3A] hover:bg-[#F59E0B]/90 font-semibold" asChild>
              <Link href="/signup" className="gap-2">
                Get started for free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </AnimatedDiv>
        </div>
      </AnimatedSection>

      {/* Footer */}
      <footer className="border-t border-[#1a3a5c] py-8">
        <div className="mx-auto max-w-5xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#C7D2FE]/50">
          <div className="flex items-center gap-2">
            <Image src="/logo.png" alt="Amida" width={24} height={24} />
            <span>&copy; {new Date().getFullYear()} Amida</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/blog" className="hover:text-[#C7D2FE] transition-colors">
              Blog
            </Link>
            <Link href="/founding-members" className="hover:text-[#C7D2FE] transition-colors">
              Founding Members
            </Link>
            <Link href="/privacy" className="hover:text-[#C7D2FE] transition-colors">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-[#C7D2FE] transition-colors">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
