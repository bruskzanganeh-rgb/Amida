'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command'
import { LayoutDashboard, Calendar, CalendarDays, FileText, Receipt, Settings, Music, Building2 } from 'lucide-react'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type GigResult = {
  id: string
  project_name: string | null
  venue: string | null
  client: { name: string } | null
}

type ClientResult = { id: string; name: string }
type ExpenseResult = { id: string; supplier: string; category: string | null; amount: number }
type InvoiceResult = {
  id: string
  invoice_number: number
  client: { name: string } | null
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()
  const t = useTranslations('nav')
  const [query, setQuery] = useState('')
  const [gigs, setGigs] = useState<GigResult[]>([])
  const [clients, setClients] = useState<ClientResult[]>([])
  const [invoices, setInvoices] = useState<InvoiceResult[]>([])
  const [expenses, setExpenses] = useState<ExpenseResult[]>([])
  const supabase = createClient()
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)

  const navigate = useCallback(
    (href: string) => {
      onOpenChange(false)
      setQuery('')
      router.push(href)
    },
    [router, onOpenChange],
  )

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('')
      setGigs([])
      setClients([])
      setInvoices([])
      setExpenses([])
    }
  }, [open])

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    const q = query.trim()
    if (q.length < 2) {
      setGigs([])
      setClients([])
      setInvoices([])
      setExpenses([])
      return
    }

    debounceRef.current = setTimeout(async () => {
      const searchPattern = `%${q}%`

      // Escape commas in search pattern for .or() safety
      const safeQ = q.replace(/,/g, '')
      const safePattern = `%${safeQ}%`

      const [gigByName, gigByVenue, gigByClient, clientRes, invoiceByNum, invoiceByClient, expenseBySup, expenseByCat] =
        await Promise.all([
          supabase
            .from('gigs')
            .select('id, project_name, venue, client:clients(name)')
            .ilike('project_name', safePattern)
            .neq('status', 'draft')
            .limit(5),
          supabase
            .from('gigs')
            .select('id, project_name, venue, client:clients(name)')
            .ilike('venue', safePattern)
            .neq('status', 'draft')
            .limit(5),
          supabase
            .from('gigs')
            .select('id, project_name, venue, client:clients!inner(name)')
            .ilike('clients.name' as never, safePattern)
            .neq('status', 'draft')
            .limit(5),
          supabase.from('clients').select('id, name').ilike('name', searchPattern).limit(5),
          !isNaN(parseInt(q, 10))
            ? supabase
                .from('invoices')
                .select('id, invoice_number, client:clients(name)')
                .eq('invoice_number', parseInt(q, 10))
                .limit(5)
            : Promise.resolve({ data: [] }),
          supabase
            .from('invoices')
            .select('id, invoice_number, client:clients!inner(name)')
            .ilike('clients.name' as never, searchPattern)
            .limit(5),
          supabase.from('expenses').select('id, supplier, category, amount').ilike('supplier', searchPattern).limit(5),
          supabase.from('expenses').select('id, supplier, category, amount').ilike('category', searchPattern).limit(5),
        ])

      // Merge and deduplicate gig results
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const allGigs = [
        ...((gigByName.data as any) || []),
        ...((gigByVenue.data as any) || []),
        ...((gigByClient.data as any) || []),
      ]
      /* eslint-enable @typescript-eslint/no-explicit-any */
      const gigSeen = new Set<string>()
      const uniqueGigs = allGigs
        .filter((g: GigResult) => {
          if (gigSeen.has(g.id)) return false
          gigSeen.add(g.id)
          return true
        })
        .slice(0, 5)

      // Merge and deduplicate invoice results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allInvoices = [...((invoiceByNum.data as any) || []), ...((invoiceByClient.data as any) || [])]
      const invSeen = new Set<string>()
      const uniqueInvoices = allInvoices
        .filter((inv: InvoiceResult) => {
          if (invSeen.has(inv.id)) return false
          invSeen.add(inv.id)
          return true
        })
        .slice(0, 5)

      // Merge and deduplicate expense results
      const allExpenses = [...(expenseBySup.data || []), ...(expenseByCat.data || [])]
      const expSeen = new Set<string>()
      const uniqueExpenses = allExpenses
        .filter((e: ExpenseResult) => {
          if (expSeen.has(e.id)) return false
          expSeen.add(e.id)
          return true
        })
        .slice(0, 5)

      setGigs(uniqueGigs)
      setClients(clientRes.data || [])
      setInvoices(uniqueInvoices)
      setExpenses(uniqueExpenses)
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const hasResults = gigs.length > 0 || clients.length > 0 || invoices.length > 0 || expenses.length > 0
  const isSearching = query.trim().length >= 2

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('searchPlaceholder')}
      description={t('searchPlaceholder')}
      showCloseButton={false}
      shouldFilter={false}
    >
      <CommandInput placeholder={t('searchPlaceholder')} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{t('noResults')}</CommandEmpty>

        {/* Navigation — shown when no search query */}
        {!isSearching && (
          <CommandGroup heading={t('navigation')}>
            <CommandItem onSelect={() => navigate('/dashboard')}>
              <LayoutDashboard className="h-4 w-4" />
              {t('dashboard')}
            </CommandItem>
            <CommandItem onSelect={() => navigate('/gigs')}>
              <Calendar className="h-4 w-4" />
              {t('gigs')}
            </CommandItem>
            <CommandItem onSelect={() => navigate('/calendar')}>
              <CalendarDays className="h-4 w-4" />
              {t('calendar')}
            </CommandItem>
            <CommandItem onSelect={() => navigate('/finance')}>
              <FileText className="h-4 w-4" />
              {t('finance')}
            </CommandItem>
            <CommandItem onSelect={() => navigate('/expenses')}>
              <Receipt className="h-4 w-4" />
              {t('expenses')}
            </CommandItem>
            <CommandItem onSelect={() => navigate('/settings')}>
              <Settings className="h-4 w-4" />
              {t('settings')}
            </CommandItem>
          </CommandGroup>
        )}

        {/* Search results */}
        {isSearching && hasResults && (
          <>
            {gigs.length > 0 && (
              <CommandGroup heading={t('gigs')}>
                {gigs.map((g) => (
                  <CommandItem key={g.id} value={g.id} onSelect={() => navigate('/gigs')}>
                    <Music className="h-4 w-4" />
                    <span>{g.project_name || g.client?.name || '-'}</span>
                    {g.venue && <span className="ml-auto text-xs text-muted-foreground">{g.venue}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {clients.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t('clients')}>
                  {clients.map((c) => (
                    <CommandItem key={c.id} value={c.id} onSelect={() => navigate(`/clients/${c.id}`)}>
                      <Building2 className="h-4 w-4" />
                      {c.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {invoices.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t('finance')}>
                  {invoices.map((inv) => (
                    <CommandItem key={inv.id} value={inv.id} onSelect={() => navigate('/finance')}>
                      <FileText className="h-4 w-4" />
                      <span>#{inv.invoice_number}</span>
                      {inv.client?.name && (
                        <span className="ml-auto text-xs text-muted-foreground">{inv.client.name}</span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            {expenses.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={t('expenses')}>
                  {expenses.map((e) => (
                    <CommandItem key={e.id} value={e.id} onSelect={() => navigate('/expenses')}>
                      <Receipt className="h-4 w-4" />
                      <span>{e.supplier}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{e.amount} kr</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}
