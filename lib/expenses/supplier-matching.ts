import { isSimilarSupplier, normalizeSupplier } from './duplicate-checker'

export type SupplierCount = {
  supplier: string
  count: number
}

/**
 * Given a freshly extracted supplier name (e.g. from AI receipt scanning) and
 * the list of suppliers already used in the company, return the existing
 * canonical name that this candidate should snap to — or null if it's a new
 * supplier.
 *
 * Deliberately STRICT to avoid overriding a correct AI reading: only snaps when
 * the names are identical after normalizing away trailing legal suffixes
 * (e.g. "SJ AB" -> "SJ", "Anthropic, PBC" -> "Anthropic"). Looser "contains"
 * and fuzzy matching are NOT used here — those live in clusterSuppliers(), where
 * the user confirms the merge, and in user-defined aliases.
 *
 * When several existing suppliers match, the most frequently used one wins so
 * the dominant spelling becomes canonical.
 */
export function findCanonicalSupplier(candidate: string, existing: SupplierCount[]): string | null {
  if (!candidate?.trim() || existing.length === 0) return null

  const normCandidate = normalizeSupplier(candidate)
  if (!normCandidate) return null

  // Sort by usage so the most common variant is preferred on ties.
  const byUsage = [...existing].sort((a, b) => b.count - a.count)

  for (const { supplier } of byUsage) {
    if (!supplier) continue
    if (normalizeSupplier(supplier) === normCandidate) return supplier
  }

  return null
}

export type SupplierGroup = {
  /** Suggested canonical name (most used variant). */
  canonical: string
  /** All members of the group, most used first. */
  members: SupplierCount[]
}

/**
 * Cluster distinct supplier names into groups of likely duplicates using the
 * same similarity logic as duplicate detection. Only groups with 2+ members
 * are returned. Uses a simple union-find over normalized names.
 */
export function clusterSuppliers(suppliers: SupplierCount[]): SupplierGroup[] {
  const items = suppliers.filter((s) => s.supplier?.trim())
  const parent = items.map((_, i) => i)

  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  function union(a: number, b: number) {
    parent[find(a)] = find(b)
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const { isSimilar } = isSimilarSupplier(items[i].supplier, items[j].supplier)
      if (isSimilar) union(i, j)
    }
  }

  const groups = new Map<number, SupplierCount[]>()
  for (let i = 0; i < items.length; i++) {
    const root = find(i)
    const arr = groups.get(root) ?? []
    arr.push(items[i])
    groups.set(root, arr)
  }

  const result: SupplierGroup[] = []
  for (const members of groups.values()) {
    if (members.length < 2) continue
    const sorted = [...members].sort((a, b) => b.count - a.count || a.supplier.localeCompare(b.supplier))
    result.push({ canonical: sorted[0].supplier, members: sorted })
  }

  // Show the biggest / most impactful groups first.
  result.sort((a, b) => {
    const bTotal = b.members.reduce((n, m) => n + m.count, 0)
    const aTotal = a.members.reduce((n, m) => n + m.count, 0)
    return b.members.length - a.members.length || bTotal - aTotal
  })

  return result
}

// Re-export for convenience.
export { normalizeSupplier }
