const { createClient } = require('@supabase/supabase-js')
const XLSX = require('xlsx')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const EXCEL_PATH = '/Users/bruskzanganeh/Downloads/Fakturera_Complete.xlsx'

// Helper to convert Apple timestamp to date
function appleTimestampToDate(timestamp) {
  if (!timestamp || timestamp === 'NaN' || isNaN(timestamp)) return null
  // Apple Core Data timestamp: seconds since 2001-01-01
  const appleEpoch = new Date('2001-01-01T00:00:00Z')
  const date = new Date(appleEpoch.getTime() + (parseInt(timestamp) * 1000))
  return date.toISOString().split('T')[0]
}

async function importCustomers() {
  console.log('\n📋 Importing customers...')

  // Read Excel file
  const workbook = XLSX.readFile(EXCEL_PATH)
  const customers = XLSX.utils.sheet_to_json(workbook.Sheets['ZASCUSTOMER'])
  console.log(`Found ${customers.length} customers`)

  let imported = 0
  let skipped = 0

  for (const customer of customers) {
    const name = customer.ZCUSTOMERNAME?.trim()
    if (!name) {
      skipped++
      continue
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('name', name)
      .single()

    if (existing) {
      console.log(`  ⏭️  Skipping (exists): ${name}`)
      skipped++
      continue
    }

    const clientData = {
      name,
      org_number: customer.ZCUSTOMERORGNO || null,
      client_code: customer.ZCUSTOMERNUMBER || null,
      address: [
        customer.ZCUSTOMERADDRESS1,
        customer.ZCUSTOMERADDRESS2,
        customer.ZCUSTOMERZIPCODE,
        customer.ZCUSTOMERCITY,
      ].filter(Boolean).join(', ') || null,
      payment_terms: parseInt(customer.ZCUSTOMERTERMOFCREDIT) || 30,
      notes: customer.ZCUSTOMERYOURREFERENCE || null,
    }

    const { error } = await supabase
      .from('clients')
      .insert([clientData])

    if (error) {
      console.error(`  ❌ Error importing ${name}:`, error.message)
    } else {
      console.log(`  ✅ Imported: ${name}`)
      imported++
    }
  }

  console.log(`\n✅ Imported ${imported} customers, skipped ${skipped}`)
}

async function importInvoices() {
  console.log('\n📄 Importing invoices...')

  // Read Excel file
  const workbook = XLSX.readFile(EXCEL_PATH)
  const invoices = XLSX.utils.sheet_to_json(workbook.Sheets['ZASINVOICE'])
  console.log(`Found ${invoices.length} invoices`)

  // Get all clients for mapping
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, client_code')

  const clientMap = new Map()
  clients?.forEach(c => {
    clientMap.set(c.name, c.id)
    if (c.client_code) clientMap.set(c.client_code, c.id)
  })

  let imported = 0
  let skipped = 0

  for (const invoice of invoices) {
    const invoiceNumber = parseInt(invoice.ZINVOICEINVOICENUMBER)
    if (!invoiceNumber || invoiceNumber < 45) {
      skipped++
      continue
    }

    // Check if already exists
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('invoice_number', invoiceNumber)
      .single()

    if (existing) {
      console.log(`  ⏭️  Skipping (exists): Invoice #${invoiceNumber}`)
      skipped++
      continue
    }

    // Find client
    const customerName = invoice.ZINVOICECUSTOMERNAME?.trim()
    const customerCode = invoice.ZINVOICECUSTOMERNUMBER?.trim()
    const clientId = clientMap.get(customerName) || clientMap.get(customerCode)

    if (!clientId) {
      console.log(`  ⚠️  Skipping invoice #${invoiceNumber}: Client not found (${customerName})`)
      skipped++
      continue
    }

    const invoiceDate = appleTimestampToDate(invoice.ZINVOICEDATE)
    const dueDate = appleTimestampToDate(invoice.ZINVOICEDATEDUE)

    if (!invoiceDate) {
      console.log(`  ⚠️  Skipping invoice #${invoiceNumber}: Invalid date`)
      skipped++
      continue
    }

    const netSum = parseFloat(invoice.ZINVOICENETSUM) || 0
    const totalVat = parseFloat(invoice.ZINVOICETOTALVAT) || 0
    const total = parseFloat(invoice.ZINVOICETOTALAMOUNT) || 0
    const vatRate = netSum > 0 ? (totalVat / netSum) * 100 : 0

    // Determine status
    let status = 'sent'
    const invoiceStatus = parseInt(invoice.ZINVOICESTATUS)
    if (invoiceStatus === 30) status = 'paid'
    else if (invoiceStatus === 20) status = 'sent'
    else if (invoiceStatus === 10) status = 'draft'
    else if (invoiceStatus === 0) status = 'draft'

    const invoiceData = {
      client_id: clientId,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      due_date: dueDate || invoiceDate,
      subtotal: netSum,
      vat_rate: Math.round(vatRate * 100) / 100,
      vat_amount: totalVat,
      total: total,
      status: status,
      imported_from_pdf: true,
    }

    const { error } = await supabase
      .from('invoices')
      .insert([invoiceData])

    if (error) {
      console.error(`  ❌ Error importing invoice #${invoiceNumber}:`, error.message)
    } else {
      console.log(`  ✅ Imported: Invoice #${invoiceNumber} - ${customerName} - ${total.toLocaleString('sv-SE')} kr`)
      imported++
    }
  }

  console.log(`\n✅ Imported ${imported} invoices, skipped ${skipped}`)
}

async function main() {
  console.log('🚀 Starting import from Fakturera Excel export...\n')

  try {
    await importCustomers()
    await importInvoices()

    console.log('\n🎉 Import completed successfully!')
    console.log('\n📊 Next steps:')
    console.log('  1. Refresh your browser at http://localhost:3000')
    console.log('  2. Check Dashboard to see your imported data')
    console.log('  3. Go to Clients to verify customers')
    console.log('  4. Go to Invoices to see all your old invoices!\n')
  } catch (error) {
    console.error('\n❌ Import failed:', error)
    process.exit(1)
  }
}

main()
