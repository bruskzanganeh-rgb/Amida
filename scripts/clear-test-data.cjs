const { createClient } = require('@supabase/supabase-js')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function clearTestData() {
  console.log('🧹 Clearing all test data...\n')

  // Delete in correct order (respecting foreign keys)

  console.log('1. Deleting invoice lines...')
  const { error: linesError } = await supabase
    .from('invoice_lines')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

  if (linesError) console.error('  ❌ Error:', linesError.message)
  else console.log('  ✅ Cleared invoice lines')

  console.log('2. Deleting invoices...')
  const { error: invoicesError } = await supabase
    .from('invoices')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (invoicesError) console.error('  ❌ Error:', invoicesError.message)
  else console.log('  ✅ Cleared invoices')

  console.log('3. Deleting gigs...')
  const { error: gigsError } = await supabase
    .from('gigs')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (gigsError) console.error('  ❌ Error:', gigsError.message)
  else console.log('  ✅ Cleared gigs')

  console.log('4. Deleting contacts...')
  const { error: contactsError } = await supabase
    .from('contacts')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (contactsError) console.error('  ❌ Error:', contactsError.message)
  else console.log('  ✅ Cleared contacts')

  console.log('5. Deleting clients...')
  const { error: clientsError } = await supabase
    .from('clients')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (clientsError) console.error('  ❌ Error:', clientsError.message)
  else console.log('  ✅ Cleared clients')

  console.log('6. Deleting expenses...')
  const { error: expensesError } = await supabase
    .from('expenses')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')

  if (expensesError) console.error('  ❌ Error:', expensesError.message)
  else console.log('  ✅ Cleared expenses')

  console.log('\n🎉 All test data cleared!')
  console.log('\nNow you can run: node scripts/import-old-data.js')
}

clearTestData().catch(console.error)
