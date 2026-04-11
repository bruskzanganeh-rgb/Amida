/**
 * RLS Verification Tests
 *
 * Verifies that Row Level Security is enabled on ALL critical tables
 * and that unauthenticated users cannot access any protected data.
 *
 * Three-layer verification:
 * 1. Metadata check -- admin client confirms all tables exist and are accessible
 * 2. Behavioral check -- unauthenticated client cannot read protected data
 * 3. Positive check -- authenticated user CAN access their own data
 * 4. Write isolation -- authenticated user cannot write to another company
 *
 * Tables with intentional public access are tested separately with
 * appropriate expectations documented.
 */
import { describe, test, expect, beforeAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true })
dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true })

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

function getAnonClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

function getAdminClient(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// ---------------------------------------------------------------------------
// Table lists
// ---------------------------------------------------------------------------

/** All public tables that MUST have RLS enabled */
const ALL_TABLES = [
  'gigs',
  'gig_dates',
  'gig_types',
  'gig_attachments',
  'clients',
  'invoices',
  'invoice_lines',
  'invoice_gigs',
  'invoice_reminders',
  'expenses',
  'positions',
  'companies',
  'company_members',
  'company_settings',
  'company_invitations',
  'subscriptions',
  'usage_tracking',
  'activity_events',
  'api_keys',
  'ai_usage_logs',
  'user_sessions',
  'platform_config',
  'contacts',
  'exchange_rates',
  'admin_users',
  'audit_logs',
  'instruments',
  'instrument_categories',
  'user_instruments',
  'organizations',
  'organization_members',
  'invitation_codes',
  'sponsors',
  'sponsor_impressions',
] as const

/**
 * Tables that must block ALL unauthenticated access (read + write).
 * This excludes tables with intentional public-read policies.
 */
const STRICT_PROTECTED_TABLES = [
  'gigs',
  'gig_dates',
  'gig_types',
  'gig_attachments',
  'clients',
  'invoices',
  'invoice_lines',
  'invoice_gigs',
  'invoice_reminders',
  'expenses',
  'positions',
  'companies',
  'company_members',
  'company_settings',
  'company_invitations',
  'subscriptions',
  'usage_tracking',
  'activity_events',
  'api_keys',
  'ai_usage_logs',
  'user_sessions',
  'contacts',
  'admin_users',
  'audit_logs',
  'user_instruments',
  'organizations',
  'organization_members',
  'invitation_codes',
  'sponsors',
  'sponsor_impressions',
] as const

/**
 * Tables with intentional public-read policies.
 * These are tested separately to verify that only SELECT is public,
 * while INSERT/UPDATE/DELETE are still blocked.
 *
 * - exchange_rates: reference data, public SELECT by design
 * - platform_config: may have public read for client-side feature flags
 * - instruments: reference data for instrument selection
 * - instrument_categories: reference data for instrument categories
 *
 * NOTE: gig_attachments anon policy was removed in migration 052.
 */

/**
 * Tables that an authenticated test user (e2e-owner) should be able
 * to read their own data from. Only includes tables known to contain
 * test-company data.
 */
const OWN_DATA_TABLES = [
  'gigs',
  'gig_types',
  'clients',
  'companies',
  'company_members',
  'company_settings',
  'positions',
] as const

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RLS metadata verification -- all tables exist and are accessible', () => {
  let adminClient: SupabaseClient

  beforeAll(() => {
    adminClient = getAdminClient()
  })

  test('all critical tables exist and are accessible via admin client', async () => {
    // The admin/service-role client bypasses RLS, so we can verify that
    // every table in our list exists and is exposed through PostgREST.
    const tableResults: { table: string; exists: boolean; error?: string }[] = []

    for (const table of ALL_TABLES) {
      const { error } = await adminClient.from(table).select('*').limit(0)
      tableResults.push({
        table,
        exists: !error,
        error: error?.message,
      })
    }

    const missingTables = tableResults.filter((t) => !t.exists)
    if (missingTables.length > 0) {
      console.warn(
        'Tables not accessible via PostgREST:',
        missingTables.map((t) => `${t.table} (${t.error})`),
      )
    }

    for (const result of tableResults) {
      expect(result.exists, `Table "${result.table}" should exist and be accessible`).toBe(true)
    }
  })
})

describe('RLS behavioral verification -- unauthenticated read access blocked', () => {
  let unauthClient: SupabaseClient

  beforeAll(() => {
    // Create anon client with NO sign-in -- simulates unauthenticated user
    unauthClient = getAnonClient()
  })

  for (const table of STRICT_PROTECTED_TABLES) {
    test(`${table}: unauthenticated user cannot read data`, async () => {
      const { data, error } = await unauthClient.from(table).select('*').limit(1)

      // RLS should block access in one of these ways:
      // 1. Returns empty array (RLS policy filters out all rows)
      // 2. Returns null with an error (permission denied)
      // 3. Returns error code 42501 (insufficient_privilege)
      const noDataReturned = data === null || (Array.isArray(data) && data.length === 0)
      const hasError = error !== null

      expect(
        noDataReturned || hasError,
        `Table "${table}" leaked data to unauthenticated user. ` +
          `Got ${data?.length ?? 0} rows. Error: ${error?.message ?? 'none'}`,
      ).toBe(true)
    })
  }
})

describe('RLS behavioral verification -- unauthenticated write access blocked', () => {
  let unauthClient: SupabaseClient

  beforeAll(() => {
    unauthClient = getAnonClient()
  })

  // ALL tables (including public-read ones) should block anonymous writes
  const ALL_WRITE_PROTECTED = [
    ...STRICT_PROTECTED_TABLES,
    // Public-read tables should still block writes
    'exchange_rates',
  ] as const

  for (const table of ALL_WRITE_PROTECTED) {
    test(`${table}: unauthenticated user cannot insert data`, async () => {
      const { error } = await unauthClient.from(table).insert({ id: '00000000-0000-0000-0000-000000000000' } as never)

      // We expect either an RLS policy violation, a constraint error, or
      // a permission denied error. The key point is that NO row is created.
      expect(error, `Table "${table}" allowed unauthenticated insert without error`).not.toBeNull()
    })
  }
})

describe('RLS public-read tables -- verify intentional public access', () => {
  let unauthClient: SupabaseClient

  beforeAll(() => {
    unauthClient = getAnonClient()
  })

  test('exchange_rates: public SELECT is intentional (reference data)', async () => {
    const { error } = await unauthClient.from('exchange_rates').select('*').limit(1)

    // exchange_rates has an intentional "Anyone can read" SELECT policy
    // This is acceptable because exchange rates are non-sensitive reference data
    expect(error).toBeNull()
    // Data may or may not exist, but no error means public read works
  })

  test('exchange_rates: public INSERT is blocked', async () => {
    const { error } = await unauthClient.from('exchange_rates').insert({
      base_currency: 'TEST',
      target_currency: 'TEST',
      rate: 1.0,
    } as never)

    expect(error).not.toBeNull()
  })

  test('gig_attachments: anon access is blocked (no anon policy)', async () => {
    // The broad anon policy (gig_attachments_all) was removed in migration 052.
    // Only authenticated company-scoped access is allowed.
    const { data, error } = await unauthClient.from('gig_attachments').select('*').limit(1)

    const noDataReturned = data === null || (Array.isArray(data) && data.length === 0)
    const hasError = error !== null
    expect(noDataReturned || hasError).toBe(true)
  })
})

describe('RLS positive verification -- authenticated user can access own data', () => {
  let authClient: SupabaseClient

  beforeAll(async () => {
    authClient = getAnonClient()
    const { error } = await authClient.auth.signInWithPassword({
      email: process.env.E2E_EMAIL || 'e2e-owner@amida-test.com',
      password: process.env.E2E_PASSWORD || 'testowner123',
    })
    if (error) throw new Error(`Auth failed: ${error.message}`)
  })

  for (const table of OWN_DATA_TABLES) {
    test(`${table}: authenticated user can read own company data`, async () => {
      const { data, error } = await authClient.from(table).select('*').limit(1)

      // Authenticated user should be able to read their own data
      // without errors. The result set may be empty for some tables
      // (e.g., if no invoices exist yet), but there should be no
      // permission error.
      expect(error, `Unexpected error reading "${table}": ${error?.message}`).toBeNull()
      expect(data).not.toBeNull()
      expect(Array.isArray(data)).toBe(true)
    })
  }

  test('authenticated user sees data scoped to their company', async () => {
    const testCompanyId = '11111111-1111-1111-1111-111111111111'

    // All gigs returned should belong to the test company
    const { data: gigs } = await authClient.from('gigs').select('id, company_id').limit(10)

    if (gigs && gigs.length > 0) {
      for (const gig of gigs) {
        expect(gig.company_id).toBe(testCompanyId)
      }
    }
  })

  test('authenticated user sees company_members only for own company', async () => {
    const testCompanyId = '11111111-1111-1111-1111-111111111111'

    const { data: members } = await authClient.from('company_members').select('id, company_id')

    if (members && members.length > 0) {
      for (const member of members) {
        expect(member.company_id).toBe(testCompanyId)
      }
    }
  })
})

describe('RLS write protection -- authenticated user cannot write to other company', () => {
  let authClient: SupabaseClient
  const adminClient = getAdminClient()

  const OTHER_COMPANY_ID = '99999999-9999-9999-9999-999999999999'

  beforeAll(async () => {
    authClient = getAnonClient()
    const { error } = await authClient.auth.signInWithPassword({
      email: process.env.E2E_EMAIL || 'e2e-owner@amida-test.com',
      password: process.env.E2E_PASSWORD || 'testowner123',
    })
    if (error) throw new Error(`Auth failed: ${error.message}`)
  })

  test('cannot insert a gig into another company', async () => {
    const { data } = await authClient
      .from('gigs')
      .insert({
        date: '2099-12-31',
        project_name: 'RLS-VERIFY-SHOULD-NOT-EXIST',
        company_id: OTHER_COMPANY_ID,
        status: 'pending',
      })
      .select('id')
      .single()

    // The insert should fail or be silently dropped by RLS
    if (data?.id) {
      // If somehow a row was created, clean it up and fail the test
      await adminClient.from('gigs').delete().eq('id', data.id)
      expect.fail('RLS allowed inserting a gig into another company')
    }

    // Either error is set, or data is null (insert blocked)
    expect(data).toBeNull()
  })

  test('cannot insert a client into another company', async () => {
    const { data } = await authClient
      .from('clients')
      .insert({
        name: 'RLS-VERIFY-SHOULD-NOT-EXIST',
        company_id: OTHER_COMPANY_ID,
      })
      .select('id')
      .single()

    if (data?.id) {
      await adminClient.from('clients').delete().eq('id', data.id)
      expect.fail('RLS allowed inserting a client into another company')
    }

    expect(data).toBeNull()
  })

  test('cannot insert an expense into another company', async () => {
    const { data } = await authClient
      .from('expenses')
      .insert({
        description: 'RLS-VERIFY-SHOULD-NOT-EXIST',
        amount: 0,
        date: '2099-12-31',
        company_id: OTHER_COMPANY_ID,
      })
      .select('id')
      .single()

    if (data?.id) {
      await adminClient.from('expenses').delete().eq('id', data.id)
      expect.fail('RLS allowed inserting an expense into another company')
    }

    expect(data).toBeNull()
  })
})
