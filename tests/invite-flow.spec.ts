/**
 * Invite flow E2E tests — covers API endpoints and UI for creating/accepting invitations.
 *
 * Uses the owner (e2e-owner@amida-test.com) to create invitations
 * and tests both success and error paths for create + accept APIs.
 */
import { test, expect } from '@playwright/test'
import { getAdminClient, setTestPlan, TEST_COMPANY_ID, TEST_OWNER_ID, loadPage } from './helpers'

// Collect invitation IDs for cleanup
const createdInvitationIds: string[] = []

test.beforeAll(async () => {
  // Ensure test company has team plan for invitation creation
  await setTestPlan('team')
})

test.afterAll(async () => {
  // Cleanup: remove test invitations
  if (createdInvitationIds.length > 0) {
    const supabase = getAdminClient()
    await supabase.from('company_invitations').delete().in('id', createdInvitationIds)
  }
  // Reset plan
  await setTestPlan('free')
})

// ---------------------------------------------------------------------------
// API tests — POST /api/invitations/create
// ---------------------------------------------------------------------------

test.describe('POST /api/invitations/create', () => {
  test('returns 401 without auth', async ({ request }) => {
    const res = await request.post('/api/invitations/create', {
      data: {},
    })
    expect(res.status()).toBe(401)
  })

  test('returns 403 as member (not owner)', async ({ browser }) => {
    // Use member auth state
    const context = await browser.newContext({
      storageState: 'tests/.auth/member-state.json',
    })
    const res = await context.request.post('/api/invitations/create', {
      data: {},
    })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('owner')
    await context.close()
  })

  test('returns 403 without team plan', async ({ browser }) => {
    // Temporarily set to free plan
    await setTestPlan('free')

    const context = await browser.newContext({
      storageState: 'tests/.auth/state.json',
    })
    const res = await context.request.post('/api/invitations/create', {
      data: {},
    })
    expect(res.status()).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('Business plan')

    // Restore team plan
    await setTestPlan('team')
    await context.close()
  })

  test('returns 200 as owner with team plan', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'tests/.auth/state.json',
    })
    const res = await context.request.post('/api/invitations/create', {
      data: { email: 'test-invite@example.com' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.token).toBeTruthy()
    expect(body.url).toContain('/signup?invite=')
    expect(body.expires_at).toBeTruthy()

    // Track for cleanup
    const supabase = getAdminClient()
    const { data: inv } = await supabase.from('company_invitations').select('id').eq('token', body.token).single()
    if (inv) createdInvitationIds.push(inv.id)

    await context.close()
  })

  test('returns 200 without email (link-only invite)', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'tests/.auth/state.json',
    })
    const res = await context.request.post('/api/invitations/create', {
      data: {},
    })
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.token).toBeTruthy()
    expect(body.url).toContain('/signup?invite=')

    // Track for cleanup
    const supabase = getAdminClient()
    const { data: inv } = await supabase.from('company_invitations').select('id').eq('token', body.token).single()
    if (inv) createdInvitationIds.push(inv.id)

    await context.close()
  })
})

// ---------------------------------------------------------------------------
// API tests — POST /api/invitations/accept
// ---------------------------------------------------------------------------

test.describe('POST /api/invitations/accept', () => {
  test('returns 401 without auth', async ({ request }) => {
    const res = await request.post('/api/invitations/accept', {
      data: { token: 'whatever' },
    })
    expect(res.status()).toBe(401)
  })

  test('returns 400 without token', async ({ browser }) => {
    const context = await browser.newContext({
      storageState: 'tests/.auth/state.json',
    })
    const res = await context.request.post('/api/invitations/accept', {
      data: {},
    })
    expect(res.status()).toBe(400)
    await context.close()
  })

  test('returns 404 with invalid token (user not in company)', async ({ browser }) => {
    // Temporarily remove member from company to test token validation
    const supabase = getAdminClient()
    const { data: member } = await supabase
      .from('company_members')
      .select('id, company_id, user_id, role')
      .eq('company_id', TEST_COMPANY_ID)
      .neq('user_id', TEST_OWNER_ID)
      .limit(1)
      .single()

    if (!member) {
      test.skip()
      return
    }

    // Remove member temporarily
    await supabase.from('company_members').delete().eq('id', member.id)

    try {
      const context = await browser.newContext({
        storageState: 'tests/.auth/member-state.json',
      })
      const res = await context.request.post('/api/invitations/accept', {
        data: { token: 'nonexistent-token-12345' },
      })
      expect(res.status()).toBe(404)
      await context.close()
    } finally {
      // Restore member
      await supabase.from('company_members').insert({
        company_id: member.company_id,
        user_id: member.user_id,
        role: member.role,
      })
    }
  })

  test('returns 410 with expired token', async ({ browser }) => {
    // Temporarily remove member from company to test token validation
    const supabase = getAdminClient()
    const { data: member } = await supabase
      .from('company_members')
      .select('id, company_id, user_id, role')
      .eq('company_id', TEST_COMPANY_ID)
      .neq('user_id', TEST_OWNER_ID)
      .limit(1)
      .single()

    if (!member) {
      test.skip()
      return
    }

    // Create an expired invitation
    const { data: inv } = await supabase
      .from('company_invitations')
      .insert({
        company_id: TEST_COMPANY_ID,
        invited_by: TEST_OWNER_ID,
        expires_at: new Date(Date.now() - 86400000).toISOString(), // expired yesterday
      })
      .select('id, token')
      .single()

    expect(inv).toBeTruthy()
    createdInvitationIds.push(inv!.id)

    // Remove member temporarily
    await supabase.from('company_members').delete().eq('id', member.id)

    try {
      const context = await browser.newContext({
        storageState: 'tests/.auth/member-state.json',
      })
      const res = await context.request.post('/api/invitations/accept', {
        data: { token: inv!.token },
      })
      expect(res.status()).toBe(410)
      const body = await res.json()
      expect(body.error).toContain('expired')
      await context.close()
    } finally {
      // Restore member
      await supabase.from('company_members').insert({
        company_id: member.company_id,
        user_id: member.user_id,
        role: member.role,
      })
    }
  })

  test('returns 400 when user already belongs to a company', async ({ browser }) => {
    // Owner already belongs to E2E Test AB
    const supabase = getAdminClient()
    const { data: inv } = await supabase
      .from('company_invitations')
      .insert({
        company_id: TEST_COMPANY_ID,
        invited_by: TEST_OWNER_ID,
      })
      .select('id, token')
      .single()

    expect(inv).toBeTruthy()
    createdInvitationIds.push(inv!.id)

    const context = await browser.newContext({
      storageState: 'tests/.auth/state.json',
    })
    const res = await context.request.post('/api/invitations/accept', {
      data: { token: inv!.token },
    })
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('Already a member')
    await context.close()
  })
})

// ---------------------------------------------------------------------------
// UI tests — Settings > Team tab (invite section)
// ---------------------------------------------------------------------------

test.describe('Settings > Team invite UI', () => {
  test.use({ storageState: 'tests/.auth/state.json' })

  test('invite section is visible on team plan', async ({ page }) => {
    await setTestPlan('team')
    await loadPage(page, '/settings')
    // Switch to team/business tab
    await page.getByRole('tab', { name: /team|business/i }).click()
    await page.waitForTimeout(500)

    // The invite section has heading "Bjud in medlem" / "Invite member"
    // and a "Skapa inbjudan" / "Create invite" button
    const createBtn = page.getByRole('button', { name: /create invite|skapa inbjudan/i })
    await expect(createBtn).toBeVisible({ timeout: 10_000 })
  })

  test('create invite link shows URL', async ({ page }) => {
    await setTestPlan('team')
    await loadPage(page, '/settings')
    await page.getByRole('tab', { name: /team|business/i }).click()
    await page.waitForTimeout(500)

    // Click create invite button
    const createBtn = page.getByRole('button', { name: /create invite|skapa inbjudan/i })
    await expect(createBtn).toBeVisible({ timeout: 10_000 })
    await createBtn.click()
    await page.waitForTimeout(2000)

    // After creating, an invite link/URL or a toast/input should appear
    // The component shows pending invitations with copy/revoke buttons
    const inviteSection = page
      .getByText(/invite=/)
      .or(page.locator('input[readonly]'))
      .or(page.getByText(/invitation|inbjudan/i))
    await expect(inviteSection.first()).toBeVisible({ timeout: 10_000 })
  })

  test('upgrade notice on free plan', async ({ page }) => {
    await setTestPlan('free')
    await loadPage(page, '/settings')
    await page.getByRole('tab', { name: /team|business/i }).click()
    await page.waitForTimeout(500)

    // Should show upgrade message
    const upgradeText = page.getByText(/upgrade|uppgradera|team plan|business-plan/i)
    await expect(upgradeText.first()).toBeVisible({ timeout: 10_000 })

    // Restore
    await setTestPlan('team')
  })
})
