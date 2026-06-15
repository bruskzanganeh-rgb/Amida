import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateExpenseSchema } from '@/lib/schemas/expense'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()

    const parsed = updateExpenseSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    }

    // Bygg uppdateringsobjekt med endast definierade fält
    const updateData: Record<string, unknown> = {}
    const {
      date,
      supplier,
      amount,
      currency,
      amount_base,
      category,
      notes,
      gig_id,
      is_private,
      sent_to_accountant_at,
    } = parsed.data

    if (date !== undefined) updateData.date = date
    if (supplier !== undefined) updateData.supplier = supplier
    if (amount !== undefined) updateData.amount = amount
    if (currency !== undefined) updateData.currency = currency
    if (amount_base !== undefined) updateData.amount_base = amount_base
    if (category !== undefined) updateData.category = category
    if (notes !== undefined) updateData.notes = notes || null
    if (gig_id !== undefined) updateData.gig_id = gig_id || null
    if (is_private !== undefined) updateData.is_private = is_private
    if (sent_to_accountant_at !== undefined) updateData.sent_to_accountant_at = sent_to_accountant_at

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data: expense, error } = await supabase
      .from('expenses')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*, gig:gigs(id, project_name, date, client:clients(name))')
      .single()

    if (error) {
      console.error('Update expense error:', error)
      return NextResponse.json({ error: 'Could not update expense' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      expense,
    })
  } catch (error) {
    console.error('Expense PATCH error:', error)
    return NextResponse.json({ error: 'Could not update expense' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const { error } = await supabase.from('expenses').delete().eq('id', id).eq('user_id', user.id)

    if (error) {
      console.error('Delete expense error:', error)
      return NextResponse.json({ error: 'Could not delete expense' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error) {
    console.error('Expense DELETE error:', error)
    return NextResponse.json({ error: 'Could not delete expense' }, { status: 500 })
  }
}
