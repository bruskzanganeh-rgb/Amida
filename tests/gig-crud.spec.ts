/**
 * Gig CRUD Tests — Create, edit, duplicate, delete, status changes.
 *
 * Runs as the OWNER account.
 */
import { test, expect } from '@playwright/test'
import { loadPage, L, E2E, cleanupTestData, waitForDialog } from './helpers'

test.afterAll(async () => {
  await cleanupTestData()
})

test.describe('Gig CRUD', () => {
  test('create gig with all fields', async ({ page }) => {
    await loadPage(page, '/gigs')

    // Open new gig dialog
    const newGigBtn = page.getByRole('button', { name: L.newGig }).first()
    await newGigBtn.click()
    const dialog = await waitForDialog(page)

    // Select gig type (data-testid distinguishes from status select in header)
    const gigTypeSelect = dialog.locator('[data-testid="gig-type-select"]')
    await gigTypeSelect.click()
    await page.waitForTimeout(300)
    const firstType = page.getByRole('option').first()
    await expect(firstType).toBeVisible({ timeout: 3000 })
    await firstType.click()
    await page.waitForTimeout(300)

    // Fill project name
    const inputs = dialog.locator('input[type="text"], input:not([type])')
    for (let i = 0; i < (await inputs.count()); i++) {
      const input = inputs.nth(i)
      const placeholder = await input.getAttribute('placeholder')
      if (
        placeholder &&
        (placeholder.toLowerCase().includes('project') || placeholder.toLowerCase().includes('projekt'))
      ) {
        await input.fill(`${E2E} Concert`)
        break
      }
    }

    // Fill venue
    for (let i = 0; i < (await inputs.count()); i++) {
      const input = inputs.nth(i)
      const placeholder = await input.getAttribute('placeholder')
      if (
        placeholder &&
        (placeholder.toLowerCase().includes('venue') ||
          placeholder.toLowerCase().includes('plats') ||
          placeholder.toLowerCase().includes('lokal'))
      ) {
        await input.fill(`${E2E} Hall`)
        break
      }
    }

    // Fill fee
    const feeInput = dialog.locator('input[type="number"]').first()
    if (await feeInput.isVisible()) {
      await feeInput.fill('15000')
    }

    // Select a date in the calendar (click a day button in the grid)
    // The calendar is on the right side (desktop) — find the 7-col grid
    const calendarGrid = page.locator('.grid.grid-cols-7').last()
    if (await calendarGrid.isVisible()) {
      // Click on day 15 (should exist in any month)
      const dayButtons = calendarGrid.locator('button:not([disabled])')
      const count = await dayButtons.count()
      if (count > 10) {
        await dayButtons.nth(10).click() // Click a mid-month day
        await page.waitForTimeout(200)
      }
    }

    // Save
    const saveBtn = page.getByRole('button', { name: /create event|skapa event/i }).first()
    if (await saveBtn.isVisible()) {
      await saveBtn.click()
      await page.waitForTimeout(2000)
    }

    // Verify dialog closed
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 5000 })
  })

  test('create multi-day gig', async ({ page }) => {
    await loadPage(page, '/gigs')

    const newGigBtn = page.getByRole('button', { name: L.newGig }).first()
    await newGigBtn.click()
    const dialog = await waitForDialog(page)

    // Select gig type
    const gigTypeSelect = dialog.locator('[data-testid="gig-type-select"]')
    await gigTypeSelect.click()
    await page.waitForTimeout(300)
    const firstType = page.getByRole('option').first()
    await expect(firstType).toBeVisible({ timeout: 3000 })
    await firstType.click()
    await page.waitForTimeout(300)

    // Fill project name
    const inputs = dialog.locator('input[type="text"], input:not([type])')
    for (let i = 0; i < (await inputs.count()); i++) {
      const input = inputs.nth(i)
      const placeholder = await input.getAttribute('placeholder')
      if (
        placeholder &&
        (placeholder.toLowerCase().includes('project') || placeholder.toLowerCase().includes('projekt'))
      ) {
        await input.fill(`${E2E} Multi`)
        break
      }
    }

    // Select 3 dates in the calendar
    const calendarGrid = page.locator('.grid.grid-cols-7').last()
    if (await calendarGrid.isVisible()) {
      const dayButtons = calendarGrid.locator('button:not([disabled])')
      const count = await dayButtons.count()
      if (count > 14) {
        await dayButtons.nth(7).click()
        await page.waitForTimeout(100)
        await dayButtons.nth(8).click()
        await page.waitForTimeout(100)
        await dayButtons.nth(9).click()
        await page.waitForTimeout(100)
      }
    }

    // Verify "3 dagar" or "3 days" in summary
    const summary = page.getByText(/3 dagar|3 days/i).first()
    await expect(summary).toBeVisible({ timeout: 3000 })

    // Save
    const saveBtn = page.getByRole('button', { name: /create event|skapa event/i }).first()
    if (await saveBtn.isVisible()) {
      await saveBtn.click()
      await page.waitForTimeout(2000)
    }
  })

  test('edit gig fields', async ({ page }) => {
    await loadPage(page, '/gigs')

    // Find the E2E-created gig row and click its edit button
    const e2eRow = page.locator('tr, [class*="card"]').filter({ hasText: E2E }).first()
    await expect(e2eRow).toBeVisible({ timeout: 5000 })
    const editBtn = e2eRow
      .locator('button')
      .filter({ has: page.locator('svg.lucide-pencil, svg.lucide-edit') })
      .first()
    await editBtn.click()
    const dialog = await waitForDialog(page)

    // Change project name
    const inputs = dialog.locator('input[type="text"], input:not([type])')
    for (let i = 0; i < (await inputs.count()); i++) {
      const input = inputs.nth(i)
      const placeholder = await input.getAttribute('placeholder')
      if (
        placeholder &&
        (placeholder.toLowerCase().includes('project') || placeholder.toLowerCase().includes('projekt'))
      ) {
        await input.clear()
        await input.fill(`${E2E} Edited`)
        break
      }
    }

    // Save changes
    const saveBtn = page.getByRole('button', { name: /save|spara/i }).first()
    await saveBtn.click()
    await page.waitForTimeout(2000)

    // Verify dialog closed
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  })

  test('change gig status', async ({ page }) => {
    await loadPage(page, '/gigs')

    // Find E2E-created gig row and click its edit button
    const e2eRow = page.locator('tr, [class*="card"]').filter({ hasText: E2E }).first()
    await expect(e2eRow).toBeVisible({ timeout: 5000 })
    const editBtn = e2eRow
      .locator('button')
      .filter({ has: page.locator('svg.lucide-pencil, svg.lucide-edit') })
      .first()
    if (await editBtn.isVisible()) {
      await editBtn.click()
      const dialog = await waitForDialog(page)

      // The status select is in the header area
      const statusSelect = dialog.locator('[data-testid="gig-status-select"]')
      if (await statusSelect.isVisible()) {
        await statusSelect.click()
        await page.waitForTimeout(300)
        const acceptedOpt = page.getByRole('option', { name: L.accepted }).first()
        if (await acceptedOpt.isVisible()) {
          await acceptedOpt.click()
          await page.waitForTimeout(200)
        }
      }

      // Save
      const saveBtn = page.getByRole('button', { name: /save|spara/i }).first()
      await saveBtn.click()
      await page.waitForTimeout(2000)
    }
  })

  test('duplicate gig', async ({ page }) => {
    await loadPage(page, '/gigs')

    // Find E2E-created gig row and click its duplicate button
    const e2eRow = page.locator('tr, [class*="card"]').filter({ hasText: E2E }).first()
    await expect(e2eRow).toBeVisible({ timeout: 5000 })
    const copyBtn = e2eRow
      .locator('button')
      .filter({ has: page.locator('svg.lucide-copy') })
      .first()
    if (await copyBtn.isVisible()) {
      await copyBtn.click()
      await page.waitForTimeout(1000)

      // Should open create dialog with pre-filled values
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })

      // Dialog title should indicate new gig (not edit)
      const title = dialog.locator('[class*="DialogTitle"], h2').first()
      const titleText = await title.textContent()
      expect(titleText).toMatch(/new event|nytt event/i)

      // Close without saving
      await page.keyboard.press('Escape')
    }
  })

  test('delete gig', async ({ page }) => {
    await loadPage(page, '/gigs')

    // Find E2E-created gig row and click its delete button
    const e2eRow = page.locator('tr, [class*="card"]').filter({ hasText: E2E }).first()
    await expect(e2eRow).toBeVisible({ timeout: 5000 })
    const trashBtn = e2eRow
      .locator('button')
      .filter({ has: page.locator('svg.lucide-trash-2, svg.lucide-trash') })
      .first()
    if (await trashBtn.isVisible()) {
      await trashBtn.click()
      await page.waitForTimeout(500)

      // Confirm deletion in ConfirmDialog
      const confirmBtn = page.getByRole('button', { name: L.confirm }).first()
      if (!(await confirmBtn.isVisible())) {
        // Try delete button in confirm dialog
        const deleteBtn = page.getByRole('button', { name: L.delete }).first()
        if (await deleteBtn.isVisible()) await deleteBtn.click()
      } else {
        await confirmBtn.click()
      }
      await page.waitForTimeout(1500)
    }
  })

  test('gig requires client for completed status', async ({ page }) => {
    await loadPage(page, '/gigs')

    const newGigBtn = page.getByRole('button', { name: L.newGig }).first()
    await newGigBtn.click()
    const dialog = await waitForDialog(page)

    // Select gig type
    const gigTypeSelect = dialog.locator('[data-testid="gig-type-select"]')
    await gigTypeSelect.click()
    await page.waitForTimeout(300)
    const firstType = page.getByRole('option').first()
    await expect(firstType).toBeVisible({ timeout: 3000 })
    await firstType.click()
    await page.waitForTimeout(300)

    // Select a date BEFORE changing status (to avoid dropdown overlay blocking calendar)
    const calendarGrid = page.locator('.grid.grid-cols-7').last()
    if (await calendarGrid.isVisible()) {
      const dayButtons = calendarGrid.locator('button:not([disabled])')
      if ((await dayButtons.count()) > 5) await dayButtons.nth(5).click()
      await page.waitForTimeout(200)
    }

    // Set status to completed (should require client)
    const statusSelect = dialog.locator('[data-testid="gig-status-select"]')
    if (await statusSelect.isVisible()) {
      await statusSelect.click()
      await page.waitForTimeout(300)
      const completedOpt = page.getByRole('option', { name: L.completed }).first()
      if (await completedOpt.isVisible()) {
        await completedOpt.click()
        await page.waitForTimeout(300)
      }
    }

    // Try to save without client
    const saveBtn = page.getByRole('button', { name: /create event|skapa event/i }).first()
    if (await saveBtn.isVisible()) {
      await saveBtn.click()
      await page.waitForTimeout(1000)

      // Should show a warning toast
      const toast = page.locator('[data-sonner-toast]').first()
      await expect(toast).toBeVisible({ timeout: 3000 })
    }

    // Close
    await page.keyboard.press('Escape')
  })

  test('gig tab navigation', async ({ page }) => {
    await loadPage(page, '/gigs')

    // Check that tab buttons exist (upcoming, history, declined)
    const tabs = page.getByRole('tab')
    const tabCount = await tabs.count()
    expect(tabCount).toBeGreaterThanOrEqual(2) // At least upcoming + history

    // Click through each tab
    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i)
      if (await tab.isVisible()) {
        await tab.click()
        await page.waitForTimeout(500)
        // Verify content area exists (no crash)
        const main = page.locator('main')
        await expect(main).toBeVisible()
      }
    }
  })
})
