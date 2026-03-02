'use client'

import { ExternalLink } from 'lucide-react'
import { useSponsor } from '@/lib/hooks/use-sponsor'

export function SponsorBanner() {
  const { sponsor, isFree } = useSponsor()

  if (!isFree || !sponsor) return null

  const url = sponsor.website_url
    ? sponsor.website_url.match(/^https?:\/\//)
      ? sponsor.website_url
      : `https://${sponsor.website_url}`
    : '#'

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        fetch('/api/sponsor-impression', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sponsor_id: sponsor.id, type: 'click' }),
        }).catch(() => {})
      }}
      className="flex items-center justify-center gap-2.5 px-4 py-3 transition-opacity hover:opacity-70"
    >
      {sponsor.logo_url && <img src={sponsor.logo_url} alt={sponsor.name} className="h-5 w-auto object-contain" />}
      <span className="text-xs text-muted-foreground/60">
        {sponsor.display_prefix || 'Sponsored by'}{' '}
        <span className="font-semibold" style={{ color: '#d4a843' }}>
          {sponsor.name}
        </span>
      </span>
      <ExternalLink className="h-3 w-3 text-muted-foreground/40" />
    </a>
  )
}
