import { distance } from 'fastest-levenshtein'

export type DuplicateExpense = {
  id: string
  date: string
  supplier: string
  amount: number
  category: string | null
}

export type DuplicateCheckResult = {
  isDuplicate: boolean
  existingExpense: DuplicateExpense | null
  matchType?: 'exact' | 'contains' | 'fuzzy'
}

/**
 * Normalize supplier name for comparison
 * Removes common suffixes like ", PBC", "AB", "Inc", etc.
 */
export function normalizeSupplier(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      // Remove common company suffixes
      .replace(/,?\s*(pbc|ab|hb|kb|inc|llc|ltd|gmbh|as|oy|a\/s)\.?$/i, '')
      .trim()
  )
}

/**
 * Calculate similarity between two strings (0-1 scale)
 */
function calculateSimilarity(str1: string, str2: string): number {
  const maxLen = Math.max(str1.length, str2.length)
  if (maxLen === 0) return 1
  const dist = distance(str1.toLowerCase(), str2.toLowerCase())
  return 1 - dist / maxLen
}

/**
 * Check if two supplier names are similar enough to be considered the same
 */
export function isSimilarSupplier(
  supplierA: string,
  supplierB: string,
  threshold: number = 0.7,
): { isSimilar: boolean; matchType: 'exact' | 'contains' | 'fuzzy' | null } {
  const normalizedA = normalizeSupplier(supplierA)
  const normalizedB = normalizeSupplier(supplierB)

  // 1. Exact match (case-insensitive, after normalization)
  if (normalizedA === normalizedB) {
    return { isSimilar: true, matchType: 'exact' }
  }

  // 2. One contains the other
  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    return { isSimilar: true, matchType: 'contains' }
  }

  // 3. Fuzzy match using Levenshtein distance
  const similarity = calculateSimilarity(normalizedA, normalizedB)
  if (similarity >= threshold) {
    return { isSimilar: true, matchType: 'fuzzy' }
  }

  return { isSimilar: false, matchType: null }
}

/**
 * Find duplicate expense from a list of existing expenses
 */
export function findDuplicateExpense(
  expense: { date: string; supplier: string; amount: number },
  existingExpenses: DuplicateExpense[],
): DuplicateCheckResult {
  // Only check expenses with the same date
  const sameDateExpenses = existingExpenses.filter((e) => e.date === expense.date)

  for (const existing of sameDateExpenses) {
    // Check if amounts match (within 0.01 tolerance)
    const amountMatches = Math.abs(existing.amount - expense.amount) < 0.01
    if (!amountMatches) continue

    // Check if suppliers are similar
    const supplierMatch = isSimilarSupplier(expense.supplier, existing.supplier)
    if (supplierMatch.isSimilar) {
      return {
        isDuplicate: true,
        existingExpense: existing,
        matchType: supplierMatch.matchType!,
      }
    }
  }

  return {
    isDuplicate: false,
    existingExpense: null,
  }
}

/**
 * Batch check duplicates for multiple expenses
 */
export function findDuplicateExpenses(
  expenses: Array<{ date: string; supplier: string; amount: number }>,
  existingExpenses: DuplicateExpense[],
): Array<{ index: number } & DuplicateCheckResult> {
  return expenses.map((expense, index) => ({
    index,
    ...findDuplicateExpense(expense, existingExpenses),
  }))
}
