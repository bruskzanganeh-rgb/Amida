import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

// New clients to create
const NEW_CLIENTS = [
  { name: 'Julius Och Nils Westerdahls Stiftelse', address: 'C/o Teoge, Box 19065, 167 19 Bromma', payment_terms: 30 },
  { name: 'Baggab Musik AB', address: 'Hökarvägen 35B, 12941 Hägersten', payment_terms: 30 },
  { name: 'Stockholm Studio Orchestra AB', address: 'Tellusborgsvägen 45B, 126 33 Hägersten', payment_terms: 30 },
]

// All 24 invoices extracted from PDFs
const INVOICES = [
  // #145 - Stockholm Studio Orchestra
  {
    invoice_number: 145,
    client_name: 'Stockholm Studio Orchestra AB',
    invoice_date: '2023-05-18',
    due_date: '2023-06-17',
    subtotal: 6950,
    vat_rate: 6,
    vat_amount: 417,
    total: 7367,
  },
  // #161 - Stockholm Studio Orchestra
  {
    invoice_number: 161,
    client_name: 'Stockholm Studio Orchestra AB',
    invoice_date: '2024-04-21',
    due_date: '2024-05-21',
    subtotal: 9800,
    vat_rate: 6,
    vat_amount: 588,
    total: 10388,
  },
  // #203 - Stockholm Studio Orchestra
  {
    invoice_number: 203,
    client_name: 'Stockholm Studio Orchestra AB',
    invoice_date: '2025-05-19',
    due_date: '2025-06-18',
    subtotal: 4500,
    vat_rate: 6,
    vat_amount: 270,
    total: 4770,
  },
  // #210 - Region Jönköping
  {
    invoice_number: 210,
    client_name: 'Region Jönköping',
    invoice_date: '2025-10-05',
    due_date: '2025-11-04',
    subtotal: 33940,
    vat_rate: 0,
    vat_amount: 0,
    total: 33940,
  },
  // #211 - Göteborgs Symfoniker AB
  {
    invoice_number: 211,
    client_name: 'Göteborgs Symfoniker AB',
    invoice_date: '2025-10-05',
    due_date: '2025-11-04',
    subtotal: 21296,
    vat_rate: 0,
    vat_amount: 0,
    total: 21296,
  },
  // #212 - Göteborgs Symfoniker AB
  {
    invoice_number: 212,
    client_name: 'Göteborgs Symfoniker AB',
    invoice_date: '2025-10-05',
    due_date: '2025-11-04',
    subtotal: 27877,
    vat_rate: 0,
    vat_amount: 0,
    total: 27877,
  },
  // #213 - Göteborgs Symfoniker AB
  {
    invoice_number: 213,
    client_name: 'Göteborgs Symfoniker AB',
    invoice_date: '2025-10-05',
    due_date: '2025-11-04',
    subtotal: 27365,
    vat_rate: 0,
    vat_amount: 0,
    total: 27365,
  },
  // #214 - Göteborgs Symfoniker AB
  {
    invoice_number: 214,
    client_name: 'Göteborgs Symfoniker AB',
    invoice_date: '2025-10-05',
    due_date: '2025-11-04',
    subtotal: 24935,
    vat_rate: 0,
    vat_amount: 0,
    total: 24935,
  },
  // #215 - Julius Och Nils Westerdahls Stiftelse (NEW CLIENT)
  {
    invoice_number: 215,
    client_name: 'Julius Och Nils Westerdahls Stiftelse',
    invoice_date: '2025-10-05',
    due_date: '2025-11-04',
    subtotal: 6000,
    vat_rate: 0,
    vat_amount: 0,
    total: 6000,
  },
  // #216 - Stockholms Konserthusstiftelse
  {
    invoice_number: 216,
    client_name: 'Stockholms Konserthusstiftelse',
    invoice_date: '2025-10-05',
    due_date: '2025-11-04',
    subtotal: 6331,
    vat_rate: 0,
    vat_amount: 0,
    total: 6331,
  },
  // #217 - Baggab Musik AB (NEW CLIENT)
  {
    invoice_number: 217,
    client_name: 'Baggab Musik AB',
    invoice_date: '2025-10-05',
    due_date: '2025-11-04',
    subtotal: 6400,
    vat_rate: 0,
    vat_amount: 0,
    total: 6400,
  },
  // #218 - Göteborgs Symfoniker AB
  {
    invoice_number: 218,
    client_name: 'Göteborgs Symfoniker AB',
    invoice_date: '2025-11-01',
    due_date: '2025-12-01',
    subtotal: 19948,
    vat_rate: 0,
    vat_amount: 0,
    total: 19948,
  },
  // #219 - Göteborgs Symfoniker AB
  {
    invoice_number: 219,
    client_name: 'Göteborgs Symfoniker AB',
    invoice_date: '2025-11-01',
    due_date: '2025-12-01',
    subtotal: 24935,
    vat_rate: 0,
    vat_amount: 0,
    total: 24935,
  },
  // #220 - Göteborgs Symfoniker AB
  {
    invoice_number: 220,
    client_name: 'Göteborgs Symfoniker AB',
    invoice_date: '2025-11-01',
    due_date: '2025-12-01',
    subtotal: 24935,
    vat_rate: 0,
    vat_amount: 0,
    total: 24935,
  },
  // #221 - Göteborgs Symfoniker AB
  {
    invoice_number: 221,
    client_name: 'Göteborgs Symfoniker AB',
    invoice_date: '2025-11-01',
    due_date: '2025-12-01',
    subtotal: 28239,
    vat_rate: 0,
    vat_amount: 0,
    total: 28239,
  },
  // #222 - Julius Och Nils Westerdahls Stiftelse
  {
    invoice_number: 222,
    client_name: 'Julius Och Nils Westerdahls Stiftelse',
    invoice_date: '2025-11-01',
    due_date: '2025-12-01',
    subtotal: 6000,
    vat_rate: 0,
    vat_amount: 0,
    total: 6000,
  },
  // #223 - Stockholms Konserthusstiftelse
  {
    invoice_number: 223,
    client_name: 'Stockholms Konserthusstiftelse',
    invoice_date: '2025-11-01',
    due_date: '2025-12-01',
    subtotal: 11633,
    vat_rate: 0,
    vat_amount: 0,
    total: 11633,
  },
  // #224 - Göteborgs Symfoniker AB
  {
    invoice_number: 224,
    client_name: 'Göteborgs Symfoniker AB',
    invoice_date: '2025-11-01',
    due_date: '2025-12-01',
    subtotal: 20528,
    vat_rate: 0,
    vat_amount: 0,
    total: 20528,
  },
  // #225 - SampleTekk Production HB (mixed VAT - using 6% on main amount)
  {
    invoice_number: 225,
    client_name: 'SampleTekk Production HB',
    invoice_date: '2025-11-01',
    due_date: '2025-12-01',
    subtotal: 27500,
    vat_rate: 6,
    vat_amount: 1500,
    total: 29000,
  },
  // #226 - Migdal & Nilsson Musik AB
  {
    invoice_number: 226,
    client_name: 'Migdal & Nilsson Musik AB',
    invoice_date: '2025-11-01',
    due_date: '2025-12-01',
    subtotal: 3000,
    vat_rate: 6,
    vat_amount: 180,
    total: 3180,
  },
  // #227 - Scenkonst Öst AB
  {
    invoice_number: 227,
    client_name: 'Scenkonst Öst AB',
    invoice_date: '2025-11-11',
    due_date: '2025-12-11',
    subtotal: 23036,
    vat_rate: 0,
    vat_amount: 0,
    total: 23036,
  },
  // #228 - Gröna Linjen Kammarmusik
  {
    invoice_number: 228,
    client_name: 'Gröna Linjen Kammarmusik',
    invoice_date: '2025-11-11',
    due_date: '2025-12-11',
    subtotal: 6500,
    vat_rate: 0,
    vat_amount: 0,
    total: 6500,
  },
  // #229 - Gageego!
  {
    invoice_number: 229,
    client_name: 'Gageego!',
    invoice_date: '2025-11-15',
    due_date: '2025-12-15',
    subtotal: 14290,
    vat_rate: 0,
    vat_amount: 0,
    total: 14290,
  },
  // #230 - Stockholms Konserthusstiftelse
  {
    invoice_number: 230,
    client_name: 'Stockholms Konserthusstiftelse',
    invoice_date: '2025-11-15',
    due_date: '2025-12-15',
    subtotal: 29405,
    vat_rate: 0,
    vat_amount: 0,
    total: 29405,
  },
]

async function main() {
  console.log('🚀 Importing 24 missing invoices...\n')

  // Step 1: Create missing clients
  console.log('👥 Creating missing clients...')
  for (const client of NEW_CLIENTS) {
    const { data: existing } = await supabase.from('clients').select('id').eq('name', client.name).single()

    if (!existing) {
      const { error } = await supabase.from('clients').insert([client])
      if (error) {
        console.log(`   ⚠️  Could not create ${client.name}: ${error.message}`)
      } else {
        console.log(`   ✅ Created: ${client.name}`)
      }
    } else {
      console.log(`   ⏭️  Exists: ${client.name}`)
    }
  }

  // Step 2: Get all clients for matching
  const { data: clients } = await supabase.from('clients').select('id, name')
  const clientMap = new Map<string, string>()
  clients?.forEach((c) => clientMap.set(c.name.toLowerCase(), c.id))

  console.log(`\n📋 Loaded ${clients?.length || 0} clients`)

  // Step 3: Import invoices
  console.log('\n📄 Importing invoices...')
  let imported = 0
  let skipped = 0
  let failed = 0

  for (const inv of INVOICES) {
    // Check if exists
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_number', inv.invoice_number)
      .single()

    if (existing) {
      console.log(`   ⏭️  #${inv.invoice_number} already exists`)
      skipped++
      continue
    }

    // Find client
    const clientId = clientMap.get(inv.client_name.toLowerCase())
    if (!clientId) {
      console.log(`   ⚠️  #${inv.invoice_number}: Client not found: ${inv.client_name}`)
      failed++
      continue
    }

    // Insert invoice
    const { error } = await supabase.from('invoices').insert({
      invoice_number: inv.invoice_number,
      client_id: clientId,
      invoice_date: inv.invoice_date,
      due_date: inv.due_date,
      subtotal: inv.subtotal,
      vat_rate: inv.vat_rate,
      vat_amount: inv.vat_amount,
      total: inv.total,
      status: 'paid',
      imported_from_pdf: true,
    })

    if (error) {
      console.log(`   ❌ #${inv.invoice_number}: ${error.message}`)
      failed++
    } else {
      console.log(`   ✅ #${inv.invoice_number}: ${inv.client_name} - ${inv.total.toLocaleString('sv-SE')} kr`)
      imported++
    }
  }

  console.log('\n' + '='.repeat(50))
  console.log('🎉 Import complete!')
  console.log(`   ✅ Imported: ${imported}`)
  console.log(`   ⏭️  Skipped: ${skipped}`)
  console.log(`   ❌ Failed: ${failed}`)
}

main()
