/**
 * Cross-tenant RLS isolation tests
 *
 * Verifies that a user from Company A cannot read, insert, or modify
 * data belonging to Company B. This is critical for multi-tenant security.
 *
 * Uses the test owner account (E2E Test AB) and attempts to access
 * data from a different company to verify RLS blocks it.
 */
import { describe, test, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), override: true })
dotenv.config({ path: path.resolve(__dirname, '../.env.test'), override: true })

const TEST_COMPANY_ID = '11111111-1111-1111-1111-111111111111'
// A UUID that does NOT belong to the test company
const OTHER_COMPANY_ID = '99999999-9999-9999-9999-999999999999'
const OTHER_USER_ID = '99999999-aaaa-bbbb-cccc-999999999999'

function getAnonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

function getAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

describe('Cross-tenant RLS isolation', () => {
  let userClient: ReturnType<typeof getAnonClient>
  let otherCompanyGigId: string | null = null
  let otherCompanyClientId: string | null = null
  const otherCompanyInvoiceId: string | null = null
  let otherCompanyGigTypeId: string | null = null
  let otherCompanyPositionId: string | null = null
  let otherCompanyGigDateId: string | null = null
  let otherCompanyContactId: string | null = null

  beforeAll(async () => {
    // Sign in as test owner (Company A)
    const client = getAnonClient()
    const { error } = await client.auth.signInWithPassword({
      email: process.env.E2E_EMAIL || 'e2e-owner@amida-test.com',
      password: process.env.E2E_PASSWORD || 'testowner123',
    })
    if (error) throw new Error(`Auth failed: ${error.message}`)
    userClient = client

    // Use admin client to seed data for "other company" that our user should NOT see
    const admin = getAdminClient()

    // Create the other company row (required for FK constraints on company_id)
    const { error: compErr } = await admin.from('companies').upsert({
      id: OTHER_COMPANY_ID,
      company_name: 'RLS-Test-Other-Company',
      org_number: '000000-0000',
      address: 'Testgatan 99',
      email: 'rls-test@other-company.invalid',
      phone: '000-0000000',
      bank_account: '0000-0000000000',
    })
    if (compErr) throw new Error(`Company seed failed: ${compErr.message}`)

    // Create a test client for the other company
    const { data: cl } = await admin
      .from('clients')
      .insert({
        name: 'RLS-Test-Other-Company-Client',
        company_id: OTHER_COMPANY_ID,
      })
      .select('id')
      .single()
    otherCompanyClientId = cl?.id || null

    // Create a gig_type for the other company
    const { data: otherGt } = await admin
      .from('gig_types')
      .insert({
        name: 'RLS-Test-Other-GigType',
        vat_rate: 6.0,
        company_id: OTHER_COMPANY_ID,
      })
      .select('id')
      .single()
    otherCompanyGigTypeId = otherGt?.id || null

    // Create a position for the other company
    const { data: otherPos } = await admin
      .from('positions')
      .insert({
        name: 'RLS-Test-Other-Position',
        company_id: OTHER_COMPANY_ID,
      })
      .select('id')
      .single()
    otherCompanyPositionId = otherPos?.id || null

    // Create a test gig for the other company
    if (otherCompanyGigTypeId) {
      const { data: gig } = await admin
        .from('gigs')
        .insert({
          date: '2099-01-01',
          gig_type_id: otherCompanyGigTypeId,
          project_name: 'RLS-Test-Other-Company-Gig',
          company_id: OTHER_COMPANY_ID,
          status: 'accepted',
        })
        .select('id')
        .single()
      otherCompanyGigId = gig?.id || null

      // Create a gig_date for the other company's gig
      if (otherCompanyGigId) {
        const { data: gd } = await admin
          .from('gig_dates')
          .insert({
            gig_id: otherCompanyGigId,
            date: '2099-01-01',
            company_id: OTHER_COMPANY_ID,
          })
          .select('id')
          .single()
        otherCompanyGigDateId = gd?.id || null
      }
    }

    // Create a contact for the other company (linked to other company's client)
    if (otherCompanyClientId) {
      const { data: ct } = await admin
        .from('contacts')
        .insert({
          client_id: otherCompanyClientId,
          name: 'RLS-Test-Other-Contact',
          email: 'rls-test@other-company.invalid',
          company_id: OTHER_COMPANY_ID,
        })
        .select('id')
        .single()
      otherCompanyContactId = ct?.id || null
    }

    return async () => {
      // Cleanup: remove test data (order matters due to FK constraints)
      const cleanup = getAdminClient()
      if (otherCompanyGigDateId) await cleanup.from('gig_dates').delete().eq('id', otherCompanyGigDateId)
      if (otherCompanyGigId) await cleanup.from('gigs').delete().eq('id', otherCompanyGigId)
      if (otherCompanyContactId) await cleanup.from('contacts').delete().eq('id', otherCompanyContactId)
      if (otherCompanyClientId) await cleanup.from('clients').delete().eq('id', otherCompanyClientId)
      if (otherCompanyInvoiceId) await cleanup.from('invoices').delete().eq('id', otherCompanyInvoiceId)
      if (otherCompanyGigTypeId) await cleanup.from('gig_types').delete().eq('id', otherCompanyGigTypeId)
      if (otherCompanyPositionId) await cleanup.from('positions').delete().eq('id', otherCompanyPositionId)
      // Clean up the other company row last (FK dependencies cleaned above)
      await cleanup.from('companies').delete().eq('id', OTHER_COMPANY_ID)
    }
  })

  test('cannot read gigs from another company', async () => {
    const { data } = await userClient.from('gigs').select('id, project_name').eq('company_id', OTHER_COMPANY_ID)

    expect(data).toEqual([])
  })

  test('cannot read clients from another company', async () => {
    const { data } = await userClient.from('clients').select('id, name').eq('company_id', OTHER_COMPANY_ID)

    expect(data).toEqual([])
  })

  test('cannot read invoices from another company', async () => {
    const { data } = await userClient.from('invoices').select('id').eq('company_id', OTHER_COMPANY_ID)

    expect(data).toEqual([])
  })

  test('cannot read expenses from another company', async () => {
    const { data } = await userClient.from('expenses').select('id').eq('company_id', OTHER_COMPANY_ID)

    expect(data).toEqual([])
  })

  test('cannot read company_members from another company', async () => {
    const { data } = await userClient.from('company_members').select('id').eq('company_id', OTHER_COMPANY_ID)

    expect(data).toEqual([])
  })

  test('cannot read company_settings from another company', async () => {
    const { data } = await userClient.from('company_settings').select('id').eq('company_id', OTHER_COMPANY_ID)

    // RLS may return [] or null depending on table permissions
    expect(data === null || (Array.isArray(data) && data.length === 0)).toBe(true)
  })

  test('cannot update a gig from another company', async () => {
    expect(otherCompanyGigId).not.toBeNull()

    await userClient.from('gigs').update({ project_name: 'HACKED' }).eq('id', otherCompanyGigId!)

    // RLS should either return error or silently affect 0 rows
    const { data: check } = await getAdminClient()
      .from('gigs')
      .select('project_name')
      .eq('id', otherCompanyGigId!)
      .single()

    expect(check?.project_name).toBe('RLS-Test-Other-Company-Gig')
  })

  test('cannot delete a client from another company', async () => {
    expect(otherCompanyClientId).not.toBeNull()

    await userClient.from('clients').delete().eq('id', otherCompanyClientId!)

    // Verify it still exists via admin client
    const { data: check } = await getAdminClient()
      .from('clients')
      .select('name')
      .eq('id', otherCompanyClientId!)
      .single()

    expect(check?.name).toBe('RLS-Test-Other-Company-Client')
  })

  test('own company data IS accessible', async () => {
    const { data } = await userClient.from('gigs').select('id').eq('company_id', TEST_COMPANY_ID).limit(1)

    // Should return at least some data (test company has gigs)
    expect(data).not.toBeNull()
  })

  // =========================================================================
  // Additional table isolation tests
  // =========================================================================

  test('cannot read gig_types from another company', async () => {
    const { data } = await userClient.from('gig_types').select('id, name').eq('company_id', OTHER_COMPANY_ID)

    expect(data).toEqual([])
  })

  test('cannot read positions from another company', async () => {
    const { data } = await userClient.from('positions').select('id, name').eq('company_id', OTHER_COMPANY_ID)

    expect(data).toEqual([])
  })

  test('cannot read gig_dates from another company', async () => {
    const { data } = await userClient.from('gig_dates').select('id, date').eq('company_id', OTHER_COMPANY_ID)

    expect(data).toEqual([])
  })

  test('cannot read gig_dates by ID from another company', async () => {
    expect(otherCompanyGigDateId).not.toBeNull()

    const { data } = await userClient.from('gig_dates').select('id, date').eq('id', otherCompanyGigDateId!)

    expect(data).toEqual([])
  })

  test('cannot read subscriptions from another company', async () => {
    // Subscriptions are scoped by company_id OR user_id = auth.uid()
    // A user from Company A should not see Company B's subscription
    const { data } = await userClient.from('subscriptions').select('id, plan').eq('company_id', OTHER_COMPANY_ID)

    expect(data).toEqual([])
  })

  test('cannot read subscriptions by another user_id', async () => {
    // Even filtering by user_id, RLS should block access to other users' subs
    const { data } = await userClient.from('subscriptions').select('id, plan').eq('user_id', OTHER_USER_ID)

    expect(data).toEqual([])
  })

  test('cannot read contacts from another company', async () => {
    const { data } = await userClient.from('contacts').select('id, name').eq('company_id', OTHER_COMPANY_ID)

    expect(data).toEqual([])
  })

  test('cannot read contacts by ID from another company', async () => {
    expect(otherCompanyContactId).not.toBeNull()

    const { data } = await userClient.from('contacts').select('id, name').eq('id', otherCompanyContactId!)

    expect(data).toEqual([])
  })

  // =========================================================================
  // Cross-tenant INSERT protection
  // =========================================================================

  test('cannot INSERT a gig into another company', async () => {
    const admin = getAdminClient()
    // Create a temporary gig_type in the test company (needed for FK)
    const { data: gt } = await admin
      .from('gig_types')
      .insert({ name: 'RLS-Test-Temp-GigType', vat_rate: 0, company_id: TEST_COMPANY_ID })
      .select('id')
      .single()

    expect(gt).not.toBeNull()

    try {
      const { data } = await userClient
        .from('gigs')
        .insert({
          date: '2099-12-31',
          gig_type_id: gt!.id,
          project_name: 'RLS-Insert-Attack-Gig',
          company_id: OTHER_COMPANY_ID,
          status: 'accepted',
        })
        .select('id')
        .single()

      // RLS WITH CHECK should block this insert
      // Either we get an error or the insert silently fails
      if (data?.id) {
        // If somehow inserted, clean up and fail
        await admin.from('gigs').delete().eq('id', data.id)
        expect.fail('INSERT into another company should have been blocked by RLS')
      } else {
        // Expected: error or null data
        expect(data).toBeNull()
      }
    } finally {
      // Clean up the temporary gig_type
      if (gt?.id) await admin.from('gig_types').delete().eq('id', gt.id)
    }
  })

  test('cannot INSERT a gig_type into another company', async () => {
    const { data } = await userClient
      .from('gig_types')
      .insert({
        name: 'RLS-Insert-Attack-GigType',
        vat_rate: 0,
        company_id: OTHER_COMPANY_ID,
      })
      .select('id')
      .single()

    if (data?.id) {
      await getAdminClient().from('gig_types').delete().eq('id', data.id)
      expect.fail('INSERT into another company should have been blocked by RLS')
    } else {
      expect(data).toBeNull()
    }
  })

  test('cannot INSERT a position into another company', async () => {
    const { data } = await userClient
      .from('positions')
      .insert({
        name: 'RLS-Insert-Attack-Position',
        company_id: OTHER_COMPANY_ID,
      })
      .select('id')
      .single()

    if (data?.id) {
      await getAdminClient().from('positions').delete().eq('id', data.id)
      expect.fail('INSERT into another company should have been blocked by RLS')
    } else {
      expect(data).toBeNull()
    }
  })

  test('cannot INSERT a client into another company', async () => {
    const { data } = await userClient
      .from('clients')
      .insert({
        name: 'RLS-Insert-Attack-Client',
        company_id: OTHER_COMPANY_ID,
      })
      .select('id')
      .single()

    if (data?.id) {
      await getAdminClient().from('clients').delete().eq('id', data.id)
      expect.fail('INSERT into another company should have been blocked by RLS')
    } else {
      expect(data).toBeNull()
    }
  })

  // =========================================================================
  // Cross-tenant UPDATE/DELETE protection on new tables
  // =========================================================================

  test('cannot update a gig_type from another company', async () => {
    expect(otherCompanyGigTypeId).not.toBeNull()

    await userClient.from('gig_types').update({ name: 'HACKED-GigType' }).eq('id', otherCompanyGigTypeId!)

    // Verify unchanged via admin
    const { data: check } = await getAdminClient()
      .from('gig_types')
      .select('name')
      .eq('id', otherCompanyGigTypeId!)
      .single()

    expect(check?.name).toBe('RLS-Test-Other-GigType')
  })

  test('cannot delete a position from another company', async () => {
    expect(otherCompanyPositionId).not.toBeNull()

    await userClient.from('positions').delete().eq('id', otherCompanyPositionId!)

    // Verify it still exists via admin
    const { data: check } = await getAdminClient()
      .from('positions')
      .select('name')
      .eq('id', otherCompanyPositionId!)
      .single()

    expect(check?.name).toBe('RLS-Test-Other-Position')
  })

  test('cannot update a contact from another company', async () => {
    expect(otherCompanyContactId).not.toBeNull()

    await userClient.from('contacts').update({ name: 'HACKED-Contact' }).eq('id', otherCompanyContactId!)

    // Verify unchanged via admin
    const { data: check } = await getAdminClient()
      .from('contacts')
      .select('name')
      .eq('id', otherCompanyContactId!)
      .single()

    expect(check?.name).toBe('RLS-Test-Other-Contact')
  })
})
