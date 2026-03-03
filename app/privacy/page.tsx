import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for Amida, a service by Babalisk AB.',
  alternates: { canonical: 'https://amida.babalisk.com/privacy' },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0B1E3A]">
      <header className="border-b border-[#1a3a5c] bg-[#0B1E3A]/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image src="/logo.png" alt="Amida" width={32} height={32} />
            <span className="text-lg font-semibold tracking-tight text-white">Amida</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-[#C7D2FE]/50 mb-10">Last updated: February 23, 2026</p>

        <div className="prose prose-invert prose-sm max-w-none text-[#C7D2FE]/80 space-y-8">
          <section>
            <h2 className="text-lg font-semibold text-white">1. Data Controller</h2>
            <p>
              Babalisk AB is responsible for the processing of your personal data in connection with the service Amida
              (amida.babalisk.com). Contact us with any questions:
            </p>
            <p>
              Email:{' '}
              <a href="mailto:support@babalisk.com" className="text-[#F59E0B] hover:underline">
                support@babalisk.com
              </a>
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">2. Data We Collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong className="text-white">Account information</strong> — email address and password (encrypted)
                upon registration.
              </li>
              <li>
                <strong className="text-white">Company information</strong> — company name, registration number,
                address, and bank details that you enter in settings.
              </li>
              <li>
                <strong className="text-white">Gigs and invoices</strong> — dates, fees, client names, and invoice data
                that you create in the service.
              </li>
              <li>
                <strong className="text-white">Receipts and attachments</strong> — images you upload for receipt
                scanning or as attachments to gigs.
              </li>
              <li>
                <strong className="text-white">Payment information</strong> — handled by Stripe (web) or Apple In-App
                Purchase (iOS app). We do not store card numbers.
              </li>
              <li>
                <strong className="text-white">Technical data</strong> — IP address, browser type, and device
                information for security and performance.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">3. Why We Process Your Data</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Deliver and improve the service (contractual basis).</li>
              <li>Manage your account and subscription.</li>
              <li>Send invoices and reminders via email at your request.</li>
              <li>AI processing of receipts to extract amounts and suppliers.</li>
              <li>Prevent abuse and maintain security (legitimate interest).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">4. Third Parties</h2>
            <p>We share data with the following services, all with adequate safeguards:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong className="text-white">Supabase</strong> (EU) — database and authentication.
              </li>
              <li>
                <strong className="text-white">Stripe</strong> (USA, EU SCC) — payment processing (web).
              </li>
              <li>
                <strong className="text-white">Apple</strong> (USA, EU SCC) — in-app purchase processing (iOS app).
              </li>
              <li>
                <strong className="text-white">Resend</strong> (USA, EU SCC) — email delivery of invoices.
              </li>
              <li>
                <strong className="text-white">Anthropic</strong> (USA, EU SCC) — AI analysis of receipts. Image data is
                not used for model training.
              </li>
              <li>
                <strong className="text-white">Vercel</strong> (USA, EU SCC) — hosting and CDN.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">5. Storage and Deletion</h2>
            <p>
              Your data is stored as long as you have an active account. If you delete your account, we will remove all
              personal data within 30 days, except for data we are required to retain under accounting regulations (7
              years for invoice data).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">6. Your Rights (GDPR)</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong className="text-white">Access</strong> your personal data.
              </li>
              <li>
                <strong className="text-white">Rectify</strong> inaccurate data.
              </li>
              <li>
                <strong className="text-white">Erase</strong> your data (&quot;right to be forgotten&quot;).
              </li>
              <li>
                <strong className="text-white">Export</strong> your data in a machine-readable format.
              </li>
              <li>
                <strong className="text-white">Object</strong> to processing based on legitimate interest.
              </li>
              <li>
                <strong className="text-white">Lodge a complaint</strong> with the Swedish Authority for Privacy
                Protection (IMY).
              </li>
            </ul>
            <p>
              Contact{' '}
              <a href="mailto:support@babalisk.com" className="text-[#F59E0B] hover:underline">
                support@babalisk.com
              </a>{' '}
              to exercise your rights.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">7. Cookies</h2>
            <p>
              Amida only uses essential cookies for authentication (Supabase session cookies) and language preferences.
              We do not use tracking cookies or third-party cookies for advertising. Vercel Analytics collects
              anonymized performance data without cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white">8. Changes</h2>
            <p>
              We may update this policy. Material changes will be communicated via email or within the service.
              Continued use after changes constitutes acceptance of the updated policy.
            </p>
          </section>
        </div>
      </main>

      <footer className="border-t border-[#1a3a5c] py-8">
        <div className="mx-auto max-w-3xl px-6 flex items-center justify-between text-sm text-[#C7D2FE]/50">
          <Link href="/" className="flex items-center gap-2 hover:text-[#C7D2FE]">
            <Image src="/logo.png" alt="Amida" width={24} height={24} />
            <span>Amida</span>
          </Link>
          <div className="flex gap-4">
            <Link href="/terms" className="hover:text-[#C7D2FE]">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
