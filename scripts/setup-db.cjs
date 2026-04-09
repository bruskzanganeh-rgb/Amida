const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

// Load environment variables
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function setupDatabase() {
  console.log('🚀 Setting up Amida database...\n')

  // Read SQL schema
  const schemaPath = path.join(__dirname, '..', 'supabase', 'schema.sql')
  const schema = fs.readFileSync(schemaPath, 'utf-8')

  console.log('📄 Loaded schema.sql')
  console.log(`📊 Executing ${schema.split('\n').length} lines of SQL...\n`)

  // Split into individual statements and execute
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  let successCount = 0
  let errorCount = 0

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';'

    try {
      const { error } = await supabase.rpc('exec_sql', { sql: statement })

      if (error) {
        // Some errors are expected (like "already exists")
        if (error.message && (
          error.message.includes('already exists') ||
          error.message.includes('duplicate')
        )) {
          console.log(`⚠️  Skipping (already exists): Statement ${i + 1}`)
        } else {
          console.error(`❌ Error in statement ${i + 1}:`, error.message)
          errorCount++
        }
      } else {
        successCount++
      }
    } catch (err) {
      console.error(`❌ Exception in statement ${i + 1}:`, err.message)
      errorCount++
    }
  }

  console.log(`\n✅ Executed ${successCount} statements successfully`)
  if (errorCount > 0) {
    console.log(`⚠️  ${errorCount} statements had errors (might be OK if tables already exist)`)
  }

  console.log('\n📋 Verifying tables...\n')

  // Verify tables
  const tables = ['clients', 'contacts', 'gig_types', 'gigs', 'invoices', 'invoice_lines', 'expenses', 'company_settings']

  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('*').limit(1)

      if (error) {
        console.log(`❌ Table '${table}': ${error.message}`)
      } else {
        console.log(`✅ Table '${table}' is accessible`)
      }
    } catch (err) {
      console.log(`❌ Table '${table}': ${err.message}`)
    }
  }

  console.log('\n🎉 Database setup complete!')
  console.log('\n📝 You can now:')
  console.log('  1. Run: npm run dev')
  console.log('  2. Open: http://localhost:3000')
  console.log('  3. Start using Amida!\n')
}

setupDatabase().catch(err => {
  console.error('\n❌ Fatal error:', err)
  process.exit(1)
})
