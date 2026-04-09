/**
 * Onboarding Wizard E2E Tests
 *
 * Tests the 6-step onboarding wizard for new owners.
 * Temporarily sets onboarding_completed to false, then restores it.
 *
 * Uses serial mode — navigates through wizard steps sequentially.
 * Runs as OWNER (E2E_EMAIL).
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(__dirname, '../.env.local') })
dotenv.config({ path: path.resolve(__dirname, '.env.test'), override: true })

const TEST_OWNER_ID = 'be0fbfb1-dc14-4512-9d46-90ac0ed69ea2'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing SUPABASE env vars')
  return createClient(url, key)
}

test.describe('Onboarding wizard', () => {
  test.describe.configure({ mode: 'serial' })

  // Temporarily set onboarding_completed to false
  test.beforeAll(async () => {
    const supabase = getAdminClient()
    await supabase.from('company_settings').update({ onboarding_completed: false }).eq('user_id', TEST_OWNER_ID)
  })

  // ALWAYS restore onboarding_completed to true
  test.afterAll(async () => {
    const supabase = getAdminClient()
    await supabase.from('company_settings').update({ onboarding_completed: true }).eq('user_id', TEST_OWNER_ID)
  })

  test('redirects to /onboarding when not completed', async ({ page }) => {
    await page.goto('/dashboard', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)

    // Should be redirected to onboarding
    expect(page.url()).toMatch(/\/onboarding/)
  })

  test('step 1 — language selection visible', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    // Language buttons should be visible (Svenska / English)
    const svBtn = page.getByRole('button', { name: /svenska/i })
    const enBtn = page.getByRole('button', { name: /english/i })

    const svVisible = await svBtn.isVisible().catch(() => false)
    const enVisible = await enBtn.isVisible().catch(() => false)

    // At least one language option should be visible
    expect(svVisible || enVisible).toBe(true)
  })

  test('step navigation — next button advances', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)

    // Find and click next/continue button
    const nextBtn = page.getByRole('button', { name: /next|nästa|continue|fortsätt/i }).first()
    if (await nextBtn.isVisible()) {
      await nextBtn.click()
      await page.waitForTimeout(1000)

      // Should have moved to step 2 (country or company info)
      const content = await page.textContent('body')
      // Step 2 should show country selection or company info
      expect(content).toMatch(/country|land|company|företag|sweden|sverige/i)
    }
  })

  test('onboarding page has no horizontal overflow', async ({ page }) => {
    await page.goto('/onboarding', { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000)

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1)
  })
})
