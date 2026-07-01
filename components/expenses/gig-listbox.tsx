'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Calendar, ChevronDown, Search } from 'lucide-react'
import { format } from 'date-fns'
import { parseLocalDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

type Gig = {
  id: string
  date: string
  project_name: string | null
  venue: string | null
  status: string
  client: { name: string } | null
}

type GigListBoxProps = {
  gigs: Gig[]
  value: string
  onValueChange: (value: string) => void
}

const INITIAL_LIMIT = 10
const LOAD_MORE_COUNT = 10

export function GigListBox({ gigs, value, onValueChange }: GigListBoxProps) {
  const t = useTranslations('expense')
  const tg = useTranslations('gig')
  const [search, setSearch] = useState('')
  const [kommandeLimitExtra, setKommandeLimitExtra] = useState(0)
  const [historiskaLimitExtra, setHistoriskaLimitExtra] = useState(0)

  const formatGigLabel = (gig: Gig): string => {
    const date = format(parseLocalDate(gig.date), 'yyyy-MM-dd')
    const name = gig.project_name || gig.venue || t('unknownGig')
    const client = gig.client?.name
    return client ? `${date} ${name} - ${client}` : `${date} ${name}`
  }

  const { kommande, historiska } = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const upcomingStatuses = ['pending', 'tentative', 'accepted']
    const completedStatuses = ['completed', 'invoiced', 'paid']

    const kommandeGigs = gigs
      .filter((g) => {
        const gigDate = parseLocalDate(g.date)
        return gigDate >= today || upcomingStatuses.includes(g.status)
      })
      .sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime())

    const historiskaGigs = gigs
      .filter((g) => {
        const gigDate = parseLocalDate(g.date)
        return gigDate < today && completedStatuses.includes(g.status)
      })
      .sort((a, b) => parseLocalDate(b.date).getTime() - parseLocalDate(a.date).getTime())

    return { kommande: kommandeGigs, historiska: historiskaGigs }
  }, [gigs])

  // Filter by search
  const q = search.toLowerCase().trim()
  const filterGig = (gig: Gig) => {
    if (!q) return true
    return formatGigLabel(gig).toLowerCase().includes(q)
  }

  const filteredKommande = kommande.filter(filterGig)
  const filteredHistoriska = historiska.filter(filterGig)

  const visibleKommande = filteredKommande.slice(0, INITIAL_LIMIT + kommandeLimitExtra)
  const visibleHistoriska = filteredHistoriska.slice(0, INITIAL_LIMIT + historiskaLimitExtra)

  const noResults = filteredKommande.length === 0 && filteredHistoriska.length === 0 && q

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Search */}
      <div className="relative border-b">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('searchGig')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setKommandeLimitExtra(0)
            setHistoriskaLimitExtra(0)
          }}
          className="pl-9 border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>

      {/* List */}
      <div className="max-h-[50vh] md:max-h-[300px] overflow-y-auto">
        {/* Inget uppdrag */}
        {!q && (
          <button
            type="button"
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left min-w-0',
              value === 'none' && 'bg-muted',
            )}
            onClick={() => onValueChange('none')}
          >
            <Check className={cn('h-4 w-4 shrink-0', value === 'none' ? 'opacity-100' : 'opacity-0')} />
            <span>{t('noGig')}</span>
          </button>
        )}

        {/* Kommande */}
        {filteredKommande.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30">
              {tg('upcoming')} ({filteredKommande.length})
            </div>
            {visibleKommande.map((gig) => (
              <button
                type="button"
                key={gig.id}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left min-w-0',
                  value === gig.id && 'bg-muted',
                )}
                onClick={() => onValueChange(gig.id)}
              >
                <Check className={cn('h-4 w-4 shrink-0', value === gig.id ? 'opacity-100' : 'opacity-0')} />
                <Calendar className="h-4 w-4 shrink-0 text-blue-500" />
                <span className="truncate">{formatGigLabel(gig)}</span>
              </button>
            ))}
            {filteredKommande.length > visibleKommande.length && (
              <button
                type="button"
                className="w-full flex items-center justify-center gap-1 px-3 py-2 text-sm text-blue-600 hover:bg-muted/50 transition-colors"
                onClick={() => setKommandeLimitExtra((prev) => prev + LOAD_MORE_COUNT)}
              >
                <ChevronDown className="h-4 w-4" />
                {t('showMore', { count: Math.min(LOAD_MORE_COUNT, filteredKommande.length - visibleKommande.length) })}
              </button>
            )}
          </div>
        )}

        {/* Historiska */}
        {filteredHistoriska.length > 0 && (
          <div>
            <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/30">
              {tg('history')} ({filteredHistoriska.length})
            </div>
            {visibleHistoriska.map((gig) => (
              <button
                type="button"
                key={gig.id}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-left min-w-0',
                  value === gig.id && 'bg-muted',
                )}
                onClick={() => onValueChange(gig.id)}
              >
                <Check className={cn('h-4 w-4 shrink-0', value === gig.id ? 'opacity-100' : 'opacity-0')} />
                <Calendar className="h-4 w-4 shrink-0 text-green-500" />
                <span className="truncate">{formatGigLabel(gig)}</span>
              </button>
            ))}
            {filteredHistoriska.length > visibleHistoriska.length && (
              <button
                type="button"
                className="w-full flex items-center justify-center gap-1 px-3 py-2 text-sm text-blue-600 hover:bg-muted/50 transition-colors"
                onClick={() => setHistoriskaLimitExtra((prev) => prev + LOAD_MORE_COUNT)}
              >
                <ChevronDown className="h-4 w-4" />
                {t('showMore', {
                  count: Math.min(LOAD_MORE_COUNT, filteredHistoriska.length - visibleHistoriska.length),
                })}
              </button>
            )}
          </div>
        )}

        {noResults && <div className="px-3 py-4 text-sm text-muted-foreground text-center">{t('noGigsFound')}</div>}
      </div>
    </div>
  )
}
