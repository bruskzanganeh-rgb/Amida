/**
 * Gig Types Configuration Tests — CRUD on /config?tab=gig-types.
 *
 * Runs as the OWNER account.
 */
import { test, expect } from '@playwright/test'
import { loadPage, E2E, cleanupTestData, waitForDialog } from './helpers'

test.afterAll(async () => {
  await cleanupTestData()
})

test.describe('Gig Types Config', () => {
  test('list gig types', async ({ page }) => {
    await loadPage(page, '/config')

    // Should be on gig-types tab by default
    const table = page.locator('table')
    await expect(table).toBeVisible({ timeout: 5000 })

    // Table should have rows
    const rows = table.locator('tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('create gig type', async ({ page }) => {
    await loadPage(page, '/config')

    // Click new gig type button
    const newBtn = page.getByRole('button', { name: /new|ny|add|lägg/i }).first()
    await newBtn.click()
    const dialog = await waitForDialog(page)

    // Fill name
    const nameInput = dialog.locator('#name')
    await nameInput.fill(`${E2E} Konsert`)

    // Fill English name if visible
    const nameEnInput = dialog.locator('#name_en')
    if (await nameEnInput.isVisible()) {
      await nameEnInput.fill(`${E2E} Concert`)
    }

    // Fill VAT rate
    const vatInput = dialog.locator('#vat_rate')
    if (await vatInput.isVisible()) {
      await vatInput.clear()
      await vatInput.fill('25')
    }

    // Save
    const saveBtn = dialog.getByRole('button', { name: /create|save|skapa|spara/i }).first()
    await saveBtn.click()
    await page.waitForTimeout(1500)

    // Verify it appears in the table
    const newRow = page.getByText(`${E2E} Konsert`)
    await expect(newRow).toBeVisible({ timeout: 5000 })
  })

  test('edit gig type', async ({ page }) => {
    await loadPage(page, '/config')
    await page.waitForTimeout(500)

    // Click edit on first type
    const editBtn = page
      .locator('button')
      .filter({ has: page.locator('svg.lucide-pencil, svg.lucide-edit') })
      .first()
    if (await editBtn.isVisible()) {
      await editBtn.click()
      const dialog = await waitForDialog(page)

      // Verify form is pre-filled (name input has value)
      const nameInput = dialog.locator('#name, #edit-name, input').first()
      const value = await nameInput.inputValue()
      expect(value.length).toBeGreaterThan(0)

      // Close without saving
      await page.keyboard.press('Escape')
    }
  })

  test('delete gig type', async ({ page }) => {
    await loadPage(page, '/config')
    await page.waitForTimeout(500)

    // Find the E2E gig type row and its trash button
    const e2eRow = page.locator('tr', { hasText: `${E2E}` }).first()
    if (await e2eRow.isVisible()) {
      const trashBtn = e2eRow.locator('button').filter({ has: page.locator('svg.lucide-trash-2') })
      await trashBtn.click()
      await page.waitForTimeout(500)

      // Confirm deletion
      const confirmBtn = page.getByRole('button', { name: /confirm|delete|ta bort|radera|bekräfta/i }).last()
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click()
        await page.waitForTimeout(1500)
      }
    }
  })
})
