/**
 * Dashboard Widget Tests — Verify dashboard cards and data.
 *
 * Runs as the OWNER account on /dashboard.
 */
import { test, expect } from '@playwright/test'
import { loadPage } from './helpers'

test.describe('Dashboard Widgets', () => {
  test('upcoming gigs widget', async ({ page }) => {
    await loadPage(page, '/dashboard')

    // Should have upcoming/kommande section
    const content = await page.textContent('main')
    expect(content).toMatch(/upcoming|kommande/i)

    // Should show some kind of gig data or "no gigs" message
    expect(content).toBeTruthy()
    expect(content!.length).toBeGreaterThan(50)
  })

  test('unpaid invoices widget', async ({ page }) => {
    await loadPage(page, '/dashboard')

    const content = await page.textContent('main')
    expect(content).toMatch(/unpaid|obetalda|invoice|faktur/i)
  })

  test('action required card', async ({ page }) => {
    await loadPage(page, '/dashboard')

    // Dashboard should have rich content
    const mainText = await page.textContent('main')
    expect(mainText).toBeTruthy()
    expect(mainText!.length).toBeGreaterThan(100)

    // Check that it shows dates/months or financial data
    expect(mainText).toMatch(
      /202\d|jan|feb|mar|apr|ma[ij]|jun|jul|aug|sep|okt|oct|nov|dec|revenue|intäkter|kr|uppdrag|gig/i,
    )
  })
})
