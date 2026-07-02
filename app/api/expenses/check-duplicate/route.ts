import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { findDuplicateExpense, findDuplicateExpenses, type DuplicateExpense } from '@/lib/expenses/duplicate-checker'
import { checkDuplicateSchema, batchCheckDuplicateSchema } from '@/lib/schemas/expense'

// POST - Kontrollera om en utgift redan finns (dublett) med fuzzy matching
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = checkDuplicateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { date, supplier, amount } = parsed.data

    // Hämta alla utgifter för samma datum (bolagsscopat via RLS — utgifter delas)
    const { data: existingExpenses, error } = await supabase
      .from('expenses')
      .select('id, date, supplier, amount, category')
      .eq('date', date)

    if (error) {
      console.error('Duplicate check error:', error)
      return NextResponse.json({ error: 'Could not check for duplicate' }, { status: 500 })
    }

    // Använd fuzzy matching för att hitta dublett
    const result = findDuplicateExpense({ date, supplier, amount }, (existingExpenses || []) as DuplicateExpense[])

    return NextResponse.json({
      isDuplicate: result.isDuplicate,
      existingExpense: result.existingExpense,
      matchType: result.matchType,
    })
  } catch (error) {
    console.error('Check duplicate error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}

// Batch-kontroll av flera utgifter med fuzzy matching
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = batchCheckDuplicateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    const { expenses } = parsed.data

    // Hämta alla befintliga utgifter för relevanta datum (bolagsscopat via RLS)
    const uniqueDates = [...new Set(expenses.map((e) => e.date))]

    const { data: existingExpenses, error } = await supabase
      .from('expenses')
      .select('id, date, supplier, amount, category')
      .in('date', uniqueDates)

    if (error) {
      console.error('Batch duplicate check error:', error)
      return NextResponse.json({ error: 'Could not check for duplicates' }, { status: 500 })
    }

    // Also fetch invoices for cross-type duplicate check
    const { data: existingInvoices } = await supabase
      .from('invoices')
      .select('id, invoice_date, total, client:clients(name)')

    // Använd fuzzy matching för batch-kontroll
    const results = findDuplicateExpenses(expenses, (existingExpenses || []) as DuplicateExpense[])

    // Cross-check: if not found in expenses, check invoices
    for (let i = 0; i < results.length; i++) {
      if (!results[i].isDuplicate && existingInvoices) {
        const exp = expenses[i]
        const invoiceMatch = existingInvoices.find((inv) => {
          const client = inv.client
          const dateAmountMatch = inv.invoice_date === exp.date && Math.abs(Number(inv.total) - exp.amount) < 0.01
          const nameAmountMatch =
            client?.name?.toLowerCase() === exp.supplier?.toLowerCase() &&
            Math.abs(Number(inv.total) - exp.amount) < 0.01
          return dateAmountMatch || nameAmountMatch
        })
        if (invoiceMatch) {
          results[i] = {
            ...results[i],
            isDuplicate: true,
            existingExpense: {
              id: invoiceMatch.id,
              date: exp.date,
              supplier: exp.supplier,
              amount: exp.amount,
              category: null,
            },
            matchType: 'exact' as const,
          }
        }
      }
    }

    return NextResponse.json({
      results,
      duplicateCount: results.filter((r) => r.isDuplicate).length,
    })
  } catch (error) {
    console.error('Batch check duplicate error:', error)
    return NextResponse.json({ error: 'An error occurred' }, { status: 500 })
  }
}
