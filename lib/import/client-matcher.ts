import { distance } from 'fastest-levenshtein'
import { createClient } from '@/lib/supabase/server'
import type { ClientMatchResult } from '@/lib/types/import'

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
 * Extract significant tokens from a name (ignore common words)
 */
function extractTokens(name: string): string[] {
  const ignore = ['ab', 'hb', 'kb', 'the', 'i', 'of', 'and', 'för', 'och']
  return name
    .toLowerCase()
    .replace(/[^a-zåäö0-9\s]/g, '')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !ignore.includes(token))
}

/**
 * Token-based matching: count how many significant words overlap
 */
function tokenBasedSimilarity(name1: string, name2: string): number {
  const tokens1 = extractTokens(name1)
  const tokens2 = extractTokens(name2)

  if (tokens1.length === 0 || tokens2.length === 0) return 0

  let matches = 0
  for (const token1 of tokens1) {
    for (const token2 of tokens2) {
      if (calculateSimilarity(token1, token2) > 0.8) {
        matches++
        break
      }
    }
  }

  return matches / Math.max(tokens1.length, tokens2.length)
}

/**
 * Match extracted client name to existing clients in database
 * Uses multi-level matching strategy
 */
export async function matchClient(extractedName: string): Promise<ClientMatchResult> {
  const supabase = await createClient()

  // Get all clients from database
  const { data: clients } = await supabase.from('clients').select('id, name, client_code').order('name')

  if (!clients || clients.length === 0) {
    return {
      clientId: null,
      confidence: 0,
      suggestions: [],
    }
  }

  const normalized = extractedName.trim()

  // Level 1: Exact match (case-insensitive)
  const exactMatch = clients.find((c) => c.name.toLowerCase() === normalized.toLowerCase())
  if (exactMatch) {
    return {
      clientId: exactMatch.id,
      confidence: 1.0,
      suggestions: [],
      matchMethod: 'exact',
    }
  }

  // Level 2: Fuzzy match using Levenshtein distance
  const fuzzyScores = clients.map((client) => ({
    ...client,
    similarity: calculateSimilarity(normalized, client.name),
  }))

  const bestFuzzyMatch = fuzzyScores.reduce((best, current) => (current.similarity > best.similarity ? current : best))

  if (bestFuzzyMatch.similarity >= 0.85) {
    return {
      clientId: bestFuzzyMatch.id,
      confidence: bestFuzzyMatch.similarity,
      suggestions: fuzzyScores
        .filter((s) => s.similarity > 0.7 && s.id !== bestFuzzyMatch.id)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3)
        .map((s) => ({
          id: s.id,
          name: s.name,
          similarity: s.similarity,
        })),
      matchMethod: 'fuzzy',
    }
  }

  // Level 3: Token-based match
  const tokenScores = clients.map((client) => ({
    ...client,
    similarity: tokenBasedSimilarity(normalized, client.name),
  }))

  const bestTokenMatch = tokenScores.reduce((best, current) => (current.similarity > best.similarity ? current : best))

  if (bestTokenMatch.similarity >= 0.7) {
    return {
      clientId: bestTokenMatch.id,
      confidence: bestTokenMatch.similarity,
      suggestions: tokenScores
        .filter((s) => s.similarity > 0.5 && s.id !== bestTokenMatch.id)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3)
        .map((s) => ({
          id: s.id,
          name: s.name,
          similarity: s.similarity,
        })),
      matchMethod: 'token',
    }
  }

  // Level 4-5: No automatic match, return suggestions for manual review
  const topSuggestions = fuzzyScores
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5)
    .map((s) => ({
      id: s.id,
      name: s.name,
      similarity: s.similarity,
    }))

  return {
    clientId: null,
    confidence: 0,
    suggestions: topSuggestions,
    matchMethod: 'manual',
  }
}

/**
 * Manually set client match (user selection)
 */
export async function setClientMatch(extractedName: string, clientId: string): Promise<void> {
  // In the future, we could store these manual mappings in a cache table
  // for faster matching of similar names
  // Manual match stored — could persist to a cache table in the future
}
