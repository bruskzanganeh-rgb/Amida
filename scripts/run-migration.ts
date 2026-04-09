import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  console.log('Running gig attachments migration...\n')

  // Step 1: Create storage bucket
  console.log('1. Creating storage bucket...')
  const { error: bucketError } = await supabase.storage.createBucket('gig-attachments', {
    public: false,
    fileSizeLimit: 10 * 1024 * 1024, // 10 MB
    allowedMimeTypes: ['application/pdf'],
  })

  if (bucketError) {
    if (bucketError.message.includes('already exists')) {
      console.log('   Bucket already exists, skipping.')
    } else {
      console.error('   Error creating bucket:', bucketError.message)
    }
  } else {
    console.log('   Bucket created successfully!')
  }

  // Step 2: Create gig_attachments table using RPC or direct SQL
  // Since we can't run arbitrary SQL via the JS client, we need to check if table exists
  // and create it via the dashboard or use a Postgres function

  console.log('\n2. Checking gig_attachments table...')
  const { error: tableError } = await supabase.from('gig_attachments').select('id').limit(1)

  if (tableError && tableError.code === '42P01') {
    // Table doesn't exist - need to create via SQL Editor
    console.log('   Table does not exist!')
    console.log('\n   Please run this SQL in Supabase Dashboard > SQL Editor:\n')
    console.log(`   CREATE TABLE IF NOT EXISTS gig_attachments (
     id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
     gig_id UUID NOT NULL REFERENCES gigs(id) ON DELETE CASCADE,
     file_name TEXT NOT NULL,
     file_path TEXT NOT NULL,
     file_size INTEGER,
     file_type TEXT,
     uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );

   CREATE INDEX IF NOT EXISTS idx_gig_attachments_gig_id ON gig_attachments(gig_id);`)
  } else if (tableError) {
    console.error('   Error checking table:', tableError.message)
  } else {
    console.log('   Table already exists!')
  }

  console.log('\nMigration check complete!')
}

runMigration().catch(console.error)
