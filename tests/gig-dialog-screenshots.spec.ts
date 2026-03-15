/**
 * Take screenshots of the gig dialog at different viewport sizes.
 * Run: npx playwright test tests/gig-dialog-screenshots.spec.ts
 */
import { test } from '@playwright/test'

test('gig-dialog screenshot', async ({ page }, testInfo) => {
  await page.goto('/gigs', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // Try "Nytt event" button first, then FAB "+" button
  let btn = page.getByRole('button', { name: /nytt event|new event/i }).first()
  if (!(await btn.isVisible())) {
    // On mobile, the FAB is a simple "+" button
    btn = page.locator('button').filter({ hasText: '+' }).first()
  }
  if (!(await btn.isVisible())) {
    // Last resort: any button with a plus SVG
    btn = page.locator('button:has(svg.lucide-plus)').first()
  }

  if (await btn.isVisible()) {
    await btn.click()
    await page.waitForTimeout(1500)

    await page.screenshot({
      path: `tests/screenshots/gig-dialog-${testInfo.project.name}.png`,
      fullPage: false,
    })
  }
})
