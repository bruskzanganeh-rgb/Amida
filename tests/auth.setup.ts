/**
 * Global setup: logs in once and saves auth state for all tests.
 *
 * Requires E2E_EMAIL and E2E_PASSWORD environment variables.
 * Create a .env.test file or export them before running tests.
 */
import { test as setup } from '@playwright/test'

const AUTH_FILE = 'tests/.auth/state.json'

setup('authenticate', async ({ page }) => {
  const email = process.env.E2E_EMAIL
  const password = process.env.E2E_PASSWORD

  if (!email || !password) {
    throw new Error(
      'E2E_EMAIL and E2E_PASSWORD must be set. ' + 'Create a .env.test file or export them before running tests.',
    )
  }

  await page.goto('/login', { waitUntil: 'networkidle' })

  // Wait for the client-rendered login form to appear and hydrate
  await page.locator('#email').waitFor({ state: 'visible', timeout: 30_000 })
  await page.waitForTimeout(500)

  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await page.locator('button[type="submit"]').click()

  // Wait for redirect after login (dashboard or onboarding)
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 30_000 })

  // Save auth state
  await page.context().storageState({ path: AUTH_FILE })
})
