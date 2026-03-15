/**
 * Form Validation Tests — Verify required fields and error messages.
 *
 * Runs as the OWNER account.
 */
import { test, expect } from '@playwright/test'
import { loadPage, L, waitForDialog } from './helpers'

test.describe('Form Validation', () => {
  test('gig requires date', async ({ page }) => {
    await loadPage(page, '/gigs')

    const newGigBtn = page.getByRole('button', { name: L.newGig }).first()
    await newGigBtn.click()
    const dialog = await waitForDialog(page)

    // Select gig type (required)
    const gigTypeSelect = dialog.locator('button[role="combobox"]').first()
    await gigTypeSelect.click()
    await page.waitForTimeout(300)
    const firstType = page.getByRole('option').first()
    if (await firstType.isVisible()) await firstType.click()
    await page.waitForTimeout(200)

    // Try to save WITHOUT selecting a date
    const saveBtn = page.getByRole('button', { name: /create event|skapa event/i }).first()
    if (await saveBtn.isVisible()) {
      await saveBtn.click()
      await page.waitForTimeout(1000)

      // Should show warning toast about selecting a date
      const toast = page.locator('[data-sonner-toast]')
      await expect(toast.first()).toBeVisible({ timeout: 3000 })
    }

    await page.keyboard.press('Escape')
  })

  test('client requires name', async ({ page }) => {
    await loadPage(page, '/config')

    const clientsTab = page.getByRole('tab', { name: L.clientsTab })
    if (await clientsTab.isVisible()) {
      await clientsTab.click()
      await page.waitForTimeout(500)
    }

    // Click the "Ny kund" / "New client" button
    const addBtn = page.getByRole('button', { name: /ny kund|new client/i })
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()
    const dialog = await waitForDialog(page)

    // Try to save without entering name
    const saveBtn = dialog.getByRole('button', { name: /create|save|skapa|spara/i }).first()
    await saveBtn.click()
    await page.waitForTimeout(500)

    // Dialog should still be open (validation prevented submit)
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
  })

  test('invoice requires client', async ({ page }) => {
    await loadPage(page, '/finance')

    const newInvoiceBtn = page.getByRole('button', { name: L.newInvoice }).first()
    await newInvoiceBtn.click()
    const dialog = await waitForDialog(page)

    // Without selecting a client, the create button should be disabled or show error
    const createBtn = dialog.getByRole('button', { name: /create invoice|skapa faktura/i }).first()
    if (await createBtn.isVisible()) {
      const isDisabled = await createBtn.isDisabled()
      if (!isDisabled) {
        // If not disabled, clicking should show error
        await createBtn.click()
        await page.waitForTimeout(500)
        // Dialog should still be open
        await expect(dialog).toBeVisible()
      } else {
        expect(isDisabled).toBeTruthy()
      }
    }

    await page.keyboard.press('Escape')
  })
})
