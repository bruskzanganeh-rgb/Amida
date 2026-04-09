import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'

// Load environment variables
loadEnv({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Data extracted from PDFs by Claude
const CLIENT_DATA = {
  name: 'Arvinder Musik AB',
  address: 'Tellusborgsvägen 45B, 126 33 Hägersten',
  payment_terms: 30,
}

const INVOICES = [
  {
    invoice_number: 105,
    invoice_date: '2021-12-20',
    due_date: '2022-01-19',
    subtotal: 1500,
    vat_rate: 6,
    vat_amount: 90,
    total: 1590,
  },
  {
    invoice_number: 114,
    invoice_date: '2022-04-28',
    due_date: '2022-05-28',
    subtotal: 4500,
    vat_rate: 6,
    vat_amount: 270,
    total: 4770,
  },
  {
    invoice_number: 128,
    invoice_date: '2022-10-22',
    due_date: '2022-11-21',
    subtotal: 13400,
    vat_rate: 6,
    vat_amount: 804,
    total: 14204,
  },
]

async function main() {
  console.log('🚀 Importing 3 missing invoices...\n')

  // Step 1: Create or find client
  console.log('👤 Creating client: Arvinder Musik AB')

  let clientId: string

  // Check if client already exists
  const { data: existingClient } = await supabase.from('clients').select('id').eq('name', CLIENT_DATA.name).single()

  if (existingClient) {
    clientId = existingClient.id
    console.log('   Client already exists, using existing ID')
  } else {
    const { data: newClient, error: clientError } = await supabase
      .from('clients')
      .insert([CLIENT_DATA])
      .select()
      .single()

    if (clientError) {
      console.error('❌ Failed to create client:', clientError.message)
      process.exit(1)
    }

    clientId = newClient.id
    console.log('   ✅ Client created')
  }

  // Step 2: Import invoices
  console.log('\n📄 Importing invoices...')

  for (const invoice of INVOICES) {
    // Check if invoice already exists
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_number', invoice.invoice_number)
      .single()

    if (existing) {
      console.log(`   ⏭️  Invoice #${invoice.invoice_number} already exists, skipping`)
      continue
    }

    const { error: insertError } = await supabase.from('invoices').insert({
      ...invoice,
      client_id: clientId,
      status: 'paid',
      imported_from_pdf: true,
    })

    if (insertError) {
      console.error(`   ❌ Invoice #${invoice.invoice_number}: ${insertError.message}`)
    } else {
      console.log(`   ✅ Invoice #${invoice.invoice_number}: ${invoice.total.toLocaleString('sv-SE')} kr`)
    }
  }

  console.log('\n🎉 Import complete!')
}

main()
