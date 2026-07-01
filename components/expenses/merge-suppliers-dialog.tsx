'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Merge } from 'lucide-react'
import { toast } from 'sonner'
import { readJsonSafe } from '@/lib/http'
import { clusterSuppliers, type SupplierCount } from '@/lib/expenses/supplier-matching'

type MergeSuppliersDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  suppliers: SupplierCount[]
  onMerged: () => void
}

export function MergeSuppliersDialog({ open, onOpenChange, suppliers, onMerged }: MergeSuppliersDialogProps) {
  const t = useTranslations('expense')

  const groups = useMemo(() => clusterSuppliers(suppliers), [suppliers])

  // Per-group UI state keyed by canonical suggestion.
  const [targets, setTargets] = useState<Record<string, string>>({})
  const [excluded, setExcluded] = useState<Record<string, Set<string>>>({})
  const [mergingKey, setMergingKey] = useState<string | null>(null)

  function groupKey(canonical: string) {
    return canonical
  }

  function getTarget(canonical: string) {
    return targets[canonical] ?? canonical
  }

  function isIncluded(canonical: string, member: string) {
    return !excluded[canonical]?.has(member)
  }

  function toggleMember(canonical: string, member: string) {
    setExcluded((prev) => {
      const next = { ...prev }
      const set = new Set(next[canonical] ?? [])
      if (set.has(member)) set.delete(member)
      else set.add(member)
      next[canonical] = set
      return next
    })
  }

  async function handleMerge(canonical: string, members: SupplierCount[]) {
    const to = getTarget(canonical).trim()
    if (!to) {
      toast.error(t('supplierRequired'))
      return
    }
    const from = members.map((m) => m.supplier).filter((s) => isIncluded(canonical, s) && s !== to)
    if (from.length === 0) {
      toast.error(t('mergeSelectAtLeastOne'))
      return
    }

    setMergingKey(groupKey(canonical))
    try {
      const res = await fetch('/api/expenses/suppliers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
      })
      const data = await readJsonSafe<{ success?: boolean; updated?: number; error?: string }>(res)
      if (!res.ok || !data?.success) {
        toast.error(data?.error || t('mergeFailed'))
        return
      }
      toast.success(t('mergedSuppliers', { count: data.updated ?? 0 }))
      onMerged()
    } catch {
      toast.error(t('mergeFailed'))
    } finally {
      setMergingKey(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('mergeSuppliers')}</DialogTitle>
          <DialogDescription>{t('mergeSuppliersHint')}</DialogDescription>
        </DialogHeader>

        {groups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('noDuplicates')}</p>
        ) : (
          <div className="space-y-5">
            {groups.map((group) => {
              const key = groupKey(group.canonical)
              const merging = mergingKey === key
              return (
                <div key={key} className="rounded-lg border p-3 space-y-3">
                  <div className="space-y-2">
                    {group.members.map((m) => (
                      <label key={m.supplier} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={isIncluded(group.canonical, m.supplier)}
                          onCheckedChange={() => toggleMember(group.canonical, m.supplier)}
                        />
                        <span className="flex-1 truncate">{m.supplier}</span>
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          {m.count}
                        </Badge>
                      </label>
                    ))}
                  </div>

                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1">
                      <span className="text-xs text-muted-foreground">{t('canonicalName')}</span>
                      <Input
                        value={getTarget(group.canonical)}
                        onChange={(e) => setTargets((prev) => ({ ...prev, [group.canonical]: e.target.value }))}
                      />
                    </div>
                    <Button size="sm" onClick={() => handleMerge(group.canonical, group.members)} disabled={merging}>
                      {merging ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Merge className="h-4 w-4 mr-1" />
                          {t('merge')}
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
