'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Check, ChevronsUpDown, Calendar, ChevronDown } from 'lucide-react'
import { format } from 'date-fns'
import { parseLocalDate } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

type Gig = {
  id: string
  date: string
  project_name: string | null
  venue: string | null
  status: string
  client: { name: string } | null
}

type GigComboboxProps = {
  gigs: Gig[]
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

const INITIAL_LIMIT = 10
const LOAD_MORE_COUNT = 10

export function GigCombobox({ gigs, value, onValueChange, disabled = false }: GigComboboxProps) {
  const t = useTranslations('expense')
  const tg = useTranslations('gig')
  const [open, setOpen] = useState(false)
  const [kommandeLimitExtra, setKommandeLimitExtra] = useState(0)
  const [historiskaLimitExtra, setHistoriskaLimitExtra] = useState(0)
  const [showScrollHint, setShowScrollHint] = useState(true)

  // Gruppera uppdrag i Kommande och Historiska
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

  // Begränsa visning med inkrementell laddning
  const visibleKommande = kommande.slice(0, INITIAL_LIMIT + kommandeLimitExtra)
  const visibleHistoriska = historiska.slice(0, INITIAL_LIMIT + historiskaLimitExtra)

  // Format: "2025-12-25 Projektnamn - Klient"
  const formatGigLabel = (gig: Gig): string => {
    const date = format(parseLocalDate(gig.date), 'yyyy-MM-dd')
    const name = gig.project_name || gig.venue || t('unknownGig')
    const client = gig.client?.name
    return client ? `${date} ${name} - ${client}` : `${date} ${name}`
  }

  // Hitta valt uppdrag
  const selectedGig = gigs.find((g) => g.id === value)
  const displayValue = selectedGig ? formatGigLabel(selectedGig) : t('selectGig')

  // Kolla om listan har mer innehåll än vad som syns
  const hasScrollableContent = kommande.length + historiska.length + 1 > INITIAL_LIMIT

  // Reset limits when popover closes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)
    if (!newOpen) {
      setKommandeLimitExtra(0)
      setHistoriskaLimitExtra(0)
      setShowScrollHint(true)
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{value === 'none' ? t('noGig') : displayValue}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandInput placeholder={t('searchGig')} />
          <div className="relative">
            <CommandList
              style={{ maxHeight: 250, height: 'auto', overflowY: 'auto' }}
              onTouchMove={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
              onScroll={() => setShowScrollHint(false)}
            >
              <CommandEmpty>{t('noGigsFound')}</CommandEmpty>

              {/* Inget uppdrag */}
              <CommandGroup>
                <CommandItem
                  value="none"
                  onSelect={() => {
                    onValueChange('none')
                    setOpen(false)
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === 'none' ? 'opacity-100' : 'opacity-0')} />
                  {t('noGig')}
                </CommandItem>
              </CommandGroup>

              {/* Kommande uppdrag */}
              {kommande.length > 0 && (
                <CommandGroup heading={`${tg('upcoming')} (${kommande.length})`}>
                  {visibleKommande.map((gig) => (
                    <CommandItem
                      key={gig.id}
                      value={`${formatGigLabel(gig)} ${gig.client?.name || ''}`}
                      onSelect={() => {
                        onValueChange(gig.id)
                        setOpen(false)
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4 shrink-0', value === gig.id ? 'opacity-100' : 'opacity-0')} />
                      <Calendar className="mr-2 h-4 w-4 shrink-0 text-blue-500" />
                      <span className="truncate">{formatGigLabel(gig)}</span>
                    </CommandItem>
                  ))}
                  {kommande.length > visibleKommande.length && (
                    <CommandItem
                      onSelect={() => setKommandeLimitExtra((prev) => prev + LOAD_MORE_COUNT)}
                      className="justify-center text-blue-600"
                    >
                      <ChevronDown className="mr-1 h-4 w-4" />
                      {t('showMore', { count: Math.min(LOAD_MORE_COUNT, kommande.length - visibleKommande.length) })}
                    </CommandItem>
                  )}
                </CommandGroup>
              )}

              {/* Historiska uppdrag */}
              {historiska.length > 0 && (
                <CommandGroup heading={`${tg('history')} (${historiska.length})`}>
                  {visibleHistoriska.map((gig) => (
                    <CommandItem
                      key={gig.id}
                      value={`${formatGigLabel(gig)} ${gig.client?.name || ''}`}
                      onSelect={() => {
                        onValueChange(gig.id)
                        setOpen(false)
                      }}
                    >
                      <Check className={cn('mr-2 h-4 w-4 shrink-0', value === gig.id ? 'opacity-100' : 'opacity-0')} />
                      <Calendar className="mr-2 h-4 w-4 shrink-0 text-green-500" />
                      <span className="truncate">{formatGigLabel(gig)}</span>
                    </CommandItem>
                  ))}
                  {historiska.length > visibleHistoriska.length && (
                    <CommandItem
                      onSelect={() => setHistoriskaLimitExtra((prev) => prev + LOAD_MORE_COUNT)}
                      className="justify-center text-blue-600"
                    >
                      <ChevronDown className="mr-1 h-4 w-4" />
                      {t('showMore', {
                        count: Math.min(LOAD_MORE_COUNT, historiska.length - visibleHistoriska.length),
                      })}
                    </CommandItem>
                  )}
                </CommandGroup>
              )}
            </CommandList>
            {showScrollHint && hasScrollableContent && (
              <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-1 pointer-events-none bg-gradient-to-t from-popover to-transparent h-8">
                <ChevronDown className="h-4 w-4 text-muted-foreground animate-bounce" />
              </div>
            )}
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
