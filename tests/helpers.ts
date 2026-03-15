/**
 * Shared test helpers — bilingual selectors, page loaders, cleanup.
 */
import { Page, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load .env.local for Supabase vars needed by cleanup
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

// ---------------------------------------------------------------------------
// Bilingual label patterns (EN | SV)
// ---------------------------------------------------------------------------
export const L = {
  // Buttons
  newGig: /new event|nytt event/i,
  createGig: /create event|skapa event/i,
  save: /save|spara/i,
  saveChanges: /save changes|spara ändringar/i,
  saveSettings: /save settings|spara inställningar/i,
  cancel: /cancel|avbryt/i,
  create: /create|skapa/i,
  delete: /delete|ta bort|radera/i,
  confirm: /confirm|bekräfta/i,
  next: /^next$|^nästa$/i,
  back: /^back$|^tillbaka$/i,
  add: /add|lägg till|^ny /i,
  edit: /edit|redigera/i,
  close: /close|stäng/i,
  yes: /yes|ja/i,

  // Finance
  newInvoice: /new invoice|ny faktura/i,
  createInvoice: /create invoice|skapa faktura/i,
  uploadReceipt: /upload|ladda upp/i,

  // Tabs
  invoicesTab: /invoices|fakturor/i,
  expensesTab: /expenses|utgifter/i,
  calendarTab: /calendar|kalender/i,
  availabilityTab: /availability|tillgänglighet/i,
  clientsTab: /clients|kunder/i,
  gigTypesTab: /types|typer/i,
  positionsTab: /positions|roller|roles/i,
  companyTab: /company|företag/i,
  emailTab: /^email$|^e-post$/i,
  teamTab: /team/i,
  apiTab: /api/i,
  subscriptionTab: /subscription|prenumeration/i,

  // Status
  accepted: /accepted|bekräftad/i,
  pending: /pending|väntande/i,
  completed: /completed|avslutad/i,
  declined: /declined|nekad/i,

  // Content
  upcoming: /upcoming|kommande/i,
  unpaid: /unpaid|obetalda/i,
  history: /history|historik/i,

  // Config
  newGigType: /new event type|ny eventtyp/i,
  newPosition: /new position|ny position/i,
}

// ---------------------------------------------------------------------------
// Unique test-data prefix (avoids collisions between parallel runs)
// ---------------------------------------------------------------------------
export const E2E = 'E2E-' + Date.now().toString(36).slice(-4)

// ---------------------------------------------------------------------------
// Page loader with console error capture
// ---------------------------------------------------------------------------
export async function loadPage(page: Page, path: string) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))

  await page.goto(path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  return errors
}

// ---------------------------------------------------------------------------
// Supabase admin client for cleanup (service role key)
// ---------------------------------------------------------------------------
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE env vars for cleanup')
  return createClient(url, key)
}

// ---------------------------------------------------------------------------
// Test data cleanup — removes all E2E- prefixed records
// ---------------------------------------------------------------------------
export async function cleanupTestData() {
  try {
    const supabase = getAdminClient()

    // Find E2E gigs and their IDs
    const { data: gigs } = await supabase.from('gigs').select('id').ilike('project_name', 'E2E-%')

    if (gigs?.length) {
      const ids = gigs.map((g) => g.id)
      await supabase.from('invoice_gigs').delete().in('gig_id', ids)
      await supabase.from('gig_dates').delete().in('gig_id', ids)
      await supabase.from('expenses').delete().in('gig_id', ids)
      await supabase.from('gigs').delete().in('id', ids)
    }

    // Find E2E invoices via notes
    const { data: invoices } = await supabase.from('invoices').select('id').ilike('notes', '%E2E%')

    if (invoices?.length) {
      const ids = invoices.map((i) => i.id)
      await supabase.from('invoice_lines').delete().in('invoice_id', ids)
      await supabase.from('invoice_gigs').delete().in('invoice_id', ids)
      await supabase.from('invoices').delete().in('id', ids)
    }

    // Clean up orphaned draft gigs (empty project_name, created by test failures)
    const { data: orphans } = await supabase
      .from('gigs')
      .select('id')
      .eq('status', 'draft')
      .or('project_name.is.null,project_name.eq.')

    if (orphans?.length) {
      const ids = orphans.map((g) => g.id)
      await supabase.from('invoice_gigs').delete().in('gig_id', ids)
      await supabase.from('gig_dates').delete().in('gig_id', ids)
      await supabase.from('expenses').delete().in('gig_id', ids)
      await supabase.from('gigs').delete().in('id', ids)
    }

    await supabase.from('expenses').delete().ilike('supplier', 'E2E%')
    await supabase.from('clients').delete().ilike('name', 'E2E%')
    await supabase.from('positions').delete().ilike('name', 'E2E%')
    await supabase.from('gig_types').delete().ilike('name', 'E2E%')
  } catch (err) {
    console.warn('Cleanup failed (non-critical):', err)
  }
}

// ---------------------------------------------------------------------------
// Dialog helpers
// ---------------------------------------------------------------------------

/** Wait for a dialog to appear and return its locator */
export async function waitForDialog(page: Page) {
  const dialog = page.locator('[role="dialog"]')
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  return dialog
}

/** Select an option from a Radix Select component by clicking trigger then option */
export async function selectOption(page: Page, trigger: ReturnType<Page['locator']>, optionPattern: RegExp) {
  await trigger.click()
  await page.waitForTimeout(300)
  const option = page.getByRole('option', { name: optionPattern }).first()
  await expect(option).toBeVisible({ timeout: 3000 })
  await option.click()
  await page.waitForTimeout(200)
}

// ---------------------------------------------------------------------------
// Subscription & usage helpers (for tier/subscription E2E tests)
// ---------------------------------------------------------------------------
const TEST_COMPANY_ID = '11111111-1111-1111-1111-111111111111'
const TEST_OWNER_ID = 'be0fbfb1-dc14-4512-9d46-90ac0ed69ea2'

export { TEST_COMPANY_ID, TEST_OWNER_ID }

/** Set test company subscription plan via service role */
export async function setTestPlan(plan: 'free' | 'pro' | 'team') {
  const supabase = getAdminClient()
  await supabase.from('subscriptions').update({ plan, status: 'active' }).eq('company_id', TEST_COMPANY_ID)
}

/** Reset usage_tracking for test owner */
export async function resetUsageTracking() {
  const supabase = getAdminClient()
  await supabase.from('usage_tracking').delete().eq('user_id', TEST_OWNER_ID)
}

/** Set gig visibility for test company */
export async function setGigVisibility(mode: 'personal' | 'shared') {
  const supabase = getAdminClient()
  await supabase.from('companies').update({ gig_visibility: mode }).eq('id', TEST_COMPANY_ID)
}
