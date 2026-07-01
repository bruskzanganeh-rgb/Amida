import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type SupplierData = {
  category: string
  currency: string
  count: number
}

type SupplierMapping = Record<string, SupplierData>

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Hämta alla utgifter med leverantör, kategori och valuta (bolagsscopat via
    // RLS) så auto-kategoriseringen blir konsekvent för hela teamet.
    const { data: expenses, error } = await supabase
      .from('expenses')
      .select('supplier, category, currency')
      .not('category', 'is', null)
      .not('supplier', 'is', null)

    if (error) {
      console.error('Failed to fetch supplier data:', error)
      return NextResponse.json({ error: 'Could not fetch supplier data' }, { status: 500 })
    }

    // Bygg mappning med frekvensräkning
    const supplierStats: Record<
      string,
      {
        categories: Record<string, number>
        currencies: Record<string, number>
        total: number
      }
    > = {}

    for (const expense of expenses || []) {
      const supplier = normalizeSupplier(expense.supplier)
      const category = expense.category
      const currency = expense.currency || 'SEK'

      if (!supplierStats[supplier]) {
        supplierStats[supplier] = { categories: {}, currencies: {}, total: 0 }
      }

      const catKey = category || 'uncategorized'
      supplierStats[supplier].categories[catKey] = (supplierStats[supplier].categories[catKey] || 0) + 1
      supplierStats[supplier].currencies[currency] = (supplierStats[supplier].currencies[currency] || 0) + 1
      supplierStats[supplier].total++
    }

    // Välj den vanligaste kategorin och valutan för varje leverantör
    const mapping: SupplierMapping = {}

    for (const [supplier, stats] of Object.entries(supplierStats)) {
      const topCategory = Object.entries(stats.categories).sort((a, b) => b[1] - a[1])[0]
      const topCurrency = Object.entries(stats.currencies).sort((a, b) => b[1] - a[1])[0]

      if (topCategory && topCurrency) {
        mapping[supplier] = {
          category: topCategory[0],
          currency: topCurrency[0],
          count: stats.total,
        }
      }
    }

    return NextResponse.json({
      mapping,
      totalSuppliers: Object.keys(mapping).length,
    })
  } catch (error) {
    console.error('Supplier mapping API error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}

// Normalisera leverantörsnamn för bättre matchning
function normalizeSupplier(supplier: string): string {
  return (
    supplier
      .toLowerCase()
      .trim()
      // Ta bort vanliga suffix
      .replace(/,?\s*(pbc|inc|ab|ltd|gmbh|as|oy|corp|llc)\.?$/i, '')
      .replace(/\s+/g, ' ')
      .trim()
  )
}

// Exportera för användning i import-sidan
export function findBestMatch(supplierName: string, mapping: SupplierMapping): SupplierData | null {
  const normalized = normalizeSupplier(supplierName)

  // Exakt match
  if (mapping[normalized]) {
    return mapping[normalized]
  }

  // Partiell match (leverantörsnamnet innehåller eller ingår i känd leverantör)
  for (const [knownSupplier, data] of Object.entries(mapping)) {
    if (normalized.includes(knownSupplier) || knownSupplier.includes(normalized)) {
      return data
    }
  }

  return null
}
