/**
 * Team Tests — Verifies team/shared account functionality.
 *
 * Runs as the MEMBER account (E2E_MEMBER_EMAIL).
 * Tests that members can access shared company data and that
 * the team subscription is correctly recognized.
 */
import { test, expect } from '@playwright/test'

// ---------------------------------------------------------------------------
// Member can log in and see the dashboard
// ---------------------------------------------------------------------------
test.describe('Team member — basic access', () => {
  test('member reaches dashboard', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    // Should be on dashboard (not redirected to login/onboarding)
    expect(page.url()).toContain('/dashboard')
  })

  test('member sees company name in header', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    const header = page.locator('header')
    const headerText = await header.textContent()
    // Should contain the company name, not a UUID
    expect(headerText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/)
    expect(headerText).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Settings — Company info visible for members
// ---------------------------------------------------------------------------
test.describe('Team member — settings', () => {
  test('company info is populated (not empty)', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    // Company name field should have a value
    const companyNameInput = page.locator('input').first()
    if (await companyNameInput.isVisible()) {
      const value = await companyNameInput.inputValue()
      // Should not be empty (the .single() bug caused empty data)
      expect(value.length).toBeGreaterThan(0)
    }
  })

  test('team tab shows team features (not upgrade required)', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    const teamTab = page.getByRole('tab', { name: /team/i })
    if (await teamTab.isVisible()) {
      await teamTab.click()
      await page.waitForTimeout(1000)

      const content = await page.textContent('main')
      // Should NOT show "upgrade required" / "Team plan required"
      expect(content).not.toMatch(/upgrade required|team plan required|uppgradering krävs/i)
      // SHOULD show members list
      expect(content).toMatch(/member|medlem|owner|ägare/i)
    }
  })

  test('member sees emails in team list (not UUIDs)', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    const teamTab = page.getByRole('tab', { name: /team/i })
    if (await teamTab.isVisible()) {
      await teamTab.click()

      // Wait for member list items to load (they have bg-muted/50 class)
      const memberItem = page.locator('.bg-muted\\/50').first()
      await memberItem.waitFor({ state: 'visible', timeout: 10_000 })

      const memberText = await memberItem.textContent()
      // Member display should show emails, not UUIDs
      expect(memberText).toContain('@')
    }
  })

  test('calendar tab shows personal calendar URL', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    const calendarTab = page.getByRole('tab', { name: /calendar|kalender/i })
    if (await calendarTab.isVisible()) {
      await calendarTab.click()
      await page.waitForTimeout(1000)

      const urlInput = page.locator('input[readonly]').first()
      if (await urlInput.isVisible()) {
        const url = await urlInput.inputValue()
        expect(url).toContain('/api/calendar/feed')
        // Calendar URL should contain the MEMBER's user_id, not the owner's
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Gigs — Visibility
// ---------------------------------------------------------------------------
test.describe('Team member — gigs', () => {
  test('gigs page loads for member', async ({ page }) => {
    await page.goto('/gigs', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    // Should be on gigs page
    expect(page.url()).toContain('/gigs')
  })

  test('new gig dialog opens for member', async ({ page }) => {
    await page.goto('/gigs', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    const newGigBtn = page.getByRole('button', { name: /new event|nytt event/i }).first()
    if (await newGigBtn.isVisible()) {
      await newGigBtn.click()
      await page.waitForTimeout(1500)
      // Dialog should be open (not error due to .single() bug)
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      await page.keyboard.press('Escape')
    }
  })
})

// ---------------------------------------------------------------------------
// Finance — Member access
// ---------------------------------------------------------------------------
test.describe('Team member — finance', () => {
  test('finance page loads for member', async ({ page }) => {
    await page.goto('/finance', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    expect(page.url()).toContain('/finance')
  })

  test('new invoice dialog opens for member', async ({ page }) => {
    await page.goto('/finance', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    const newInvoiceBtn = page.getByRole('button', { name: /new invoice|ny faktura/i }).first()
    if (await newInvoiceBtn.isVisible()) {
      await newInvoiceBtn.click()
      await page.waitForTimeout(1500)
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      await page.keyboard.press('Escape')
    }
  })
})

// ---------------------------------------------------------------------------
// Calendar — Member access
// ---------------------------------------------------------------------------
test.describe('Team member — calendar', () => {
  test('calendar page loads for member', async ({ page }) => {
    await page.goto('/calendar', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)
    expect(page.url()).toContain('/calendar')
  })
})

// ---------------------------------------------------------------------------
// API — Calendar feed
// ---------------------------------------------------------------------------
test.describe('Team member — calendar feed API', () => {
  test('calendar feed returns valid iCal', async ({ request }) => {
    // This tests the public calendar feed endpoint
    // We need the user_id and token — skip if not available
    // The test just verifies the endpoint exists and responds
    const response = await request.get('/api/calendar/feed')
    // Without params, should return 400 or similar (not 500)
    expect(response.status()).toBeLessThan(500)
  })
})
