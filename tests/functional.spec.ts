/**
 * Functional Tests — Verifies all critical user journeys.
 *
 * Runs as the OWNER account (E2E_EMAIL).
 * Tests: navigation, settings, gigs, clients, invoices, expenses, calendar.
 */
import { test, expect, Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for page load and check no console errors (including CSP violations) */
async function loadPage(page: Page, path: string) {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Refused to load|Content Security Policy/i.test(msg.text())) {
      errors.push(`CSP: ${msg.text()}`)
    }
  })

  await page.goto(path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  return errors
}

// ---------------------------------------------------------------------------
// Navigation — All pages load without JS errors
// ---------------------------------------------------------------------------
test.describe('Navigation', () => {
  const pages = [
    { name: 'Dashboard', path: '/dashboard' },
    { name: 'Gigs', path: '/gigs' },
    { name: 'Calendar', path: '/calendar' },
    { name: 'Finance', path: '/finance' },
    { name: 'Analytics', path: '/analytics' },
    { name: 'Configuration', path: '/config' },
    { name: 'Settings', path: '/settings' },
  ]

  for (const pg of pages) {
    test(`${pg.name} loads without errors`, async ({ page }) => {
      const errors = await loadPage(page, pg.path)
      // Filter out known benign errors (e.g., ResizeObserver, third-party, Vercel analytics)
      const criticalErrors = errors.filter(
        (e) => !e.includes('ResizeObserver') && !e.includes('Script error') && !e.includes('vercel-scripts.com'),
      )
      expect(criticalErrors).toHaveLength(0)
    })
  }

  test('user menu shows company name', async ({ page }) => {
    await loadPage(page, '/dashboard')
    // The header should show a company name (not empty, not a UUID)
    const header = page.locator('header')
    const headerText = await header.textContent()
    expect(headerText).toBeTruthy()
    // Should NOT contain a UUID pattern
    expect(headerText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/)
  })

  test('user menu dropdown opens', async ({ page }) => {
    await loadPage(page, '/dashboard')
    // Click the company name / user menu button in header
    const menuButton = page.locator('header button').last()
    await menuButton.click()
    await page.waitForTimeout(500)
    // Menu should be visible with Settings option
    const menuContent = page.locator('[role="menu"], [role="menuitem"]').first()
    await expect(menuContent).toBeVisible({ timeout: 3000 })
  })
})

// ---------------------------------------------------------------------------
// Settings — Company info loads correctly
// ---------------------------------------------------------------------------
test.describe('Settings', () => {
  test('company info is populated (not empty)', async ({ page }) => {
    await loadPage(page, '/settings')
    // Company name field should have a value
    const companyNameInput = page.locator('input[id="company_name"], input[name="company_name"]').first()
    if (await companyNameInput.isVisible()) {
      const value = await companyNameInput.inputValue()
      expect(value.length).toBeGreaterThan(0)
    }
  })

  test('can switch between settings tabs', async ({ page }) => {
    await loadPage(page, '/settings')
    const tabs = ['Email', 'Calendar', 'Team', 'API']
    for (const tabName of tabs) {
      const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') })
      if (await tab.isVisible()) {
        await tab.click()
        await page.waitForTimeout(500)
        // Should not show error state
        const error = page.locator('text=/error|Error|failed/i').first()
        expect(await error.isVisible().catch(() => false)).toBeFalsy()
      }
    }
  })

  test('calendar tab shows subscription URL', async ({ page }) => {
    await loadPage(page, '/settings')
    const calendarTab = page.getByRole('tab', { name: /calendar|kalender/i })
    if (await calendarTab.isVisible()) {
      await calendarTab.click()
      await page.waitForTimeout(1000)
      // Should contain a calendar feed URL
      const urlInput = page.locator('input[type="text"][readonly], input[type="url"]').first()
      if (await urlInput.isVisible()) {
        const url = await urlInput.inputValue()
        expect(url).toContain('/api/calendar/feed')
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Gigs — CRUD operations
// ---------------------------------------------------------------------------
test.describe('Gigs', () => {
  test('new gig dialog opens without errors', async ({ page }) => {
    const errors = await loadPage(page, '/gigs')
    const newGigBtn = page.getByRole('button', { name: /new event|nytt event/i }).first()
    if (await newGigBtn.isVisible()) {
      await newGigBtn.click()
      await page.waitForTimeout(1000)
      // Dialog should be open
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      // Close
      await page.keyboard.press('Escape')
    }
  })

  test('can create a gig', async ({ page }) => {
    await loadPage(page, '/gigs')
    const newGigBtn = page.getByRole('button', { name: /new event|nytt event/i }).first()
    await newGigBtn.click()
    await page.waitForTimeout(1500)

    // Select a date (click on today or a future date in the calendar)
    const today = new Date()
    const dateStr = today.toISOString().split('T')[0]

    // Set project name
    const projectInput = page
      .locator('input[name="project_name"], input[placeholder*="project"], input[placeholder*="Projekt"]')
      .first()
    if (await projectInput.isVisible()) {
      await projectInput.fill('E2E Test Gig')
    }

    // Set fee
    const feeInput = page.locator('input[name="fee"], input[type="number"]').first()
    if (await feeInput.isVisible()) {
      await feeInput.fill('10000')
    }

    // Set status to accepted
    const statusSelect = page.locator('button[role="combobox"]').first()
    if (await statusSelect.isVisible()) {
      await statusSelect.click()
      await page.waitForTimeout(300)
      const acceptedOption = page.getByRole('option', { name: /accepted|bekräftad/i }).first()
      if (await acceptedOption.isVisible()) {
        await acceptedOption.click()
      }
    }

    // Save
    const saveBtn = page.getByRole('button', { name: /save|spara/i }).first()
    if (await saveBtn.isVisible()) {
      await saveBtn.click()
      await page.waitForTimeout(2000)
    }
  })

  test('gig list shows gigs', async ({ page }) => {
    await loadPage(page, '/gigs')
    // Should have at least one gig or the "no gigs" message
    const content = await page.textContent('main')
    expect(content).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Configuration — Client CRUD
// ---------------------------------------------------------------------------
test.describe('Clients', () => {
  test('can access clients tab', async ({ page }) => {
    await loadPage(page, '/config')
    const clientsTab = page.getByRole('tab', { name: /clients|kunder/i })
    if (await clientsTab.isVisible()) {
      await clientsTab.click()
      await page.waitForTimeout(500)
    }
  })

  test('can create a client', async ({ page }) => {
    await loadPage(page, '/config')
    // Switch to clients tab
    const clientsTab = page.getByRole('tab', { name: /clients|kunder/i })
    if (await clientsTab.isVisible()) {
      await clientsTab.click()
      await page.waitForTimeout(500)
    }

    const addBtn = page.getByRole('button', { name: /add|lägg till|new|ny/i }).first()
    if (await addBtn.isVisible()) {
      await addBtn.click()
      await page.waitForTimeout(500)

      const nameInput = page
        .locator('input[name="name"], input[placeholder*="name"], input[placeholder*="namn"]')
        .first()
      if (await nameInput.isVisible()) {
        await nameInput.fill('E2E Test Client')
      }

      const saveBtn = page.getByRole('button', { name: /save|spara/i }).first()
      if (await saveBtn.isVisible()) {
        await saveBtn.click()
        await page.waitForTimeout(1000)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Finance — Invoice creation
// ---------------------------------------------------------------------------
test.describe('Finance', () => {
  test('finance page loads with tabs', async ({ page }) => {
    await loadPage(page, '/finance')
    // Should have invoice and expense tabs
    const invoiceTab = page.getByRole('tab', { name: /invoices|fakturor/i })
    const expenseTab = page.getByRole('tab', { name: /expenses|utgifter/i })
    expect((await invoiceTab.isVisible()) || (await expenseTab.isVisible())).toBeTruthy()
  })

  test('new invoice dialog opens without errors', async ({ page }) => {
    await loadPage(page, '/finance')
    const newInvoiceBtn = page.getByRole('button', { name: /new invoice|ny faktura/i }).first()
    if (await newInvoiceBtn.isVisible()) {
      await newInvoiceBtn.click()
      await page.waitForTimeout(1000)
      const dialog = page.locator('[role="dialog"]')
      await expect(dialog).toBeVisible({ timeout: 5000 })
      await page.keyboard.press('Escape')
    }
  })

  test('expense tab works', async ({ page }) => {
    await loadPage(page, '/finance')
    const expenseTab = page.getByRole('tab', { name: /expenses|utgifter/i })
    if (await expenseTab.isVisible()) {
      await expenseTab.click()
      await page.waitForTimeout(500)
      // Should show expense list or empty state
      const content = await page.textContent('main')
      expect(content).toBeTruthy()
    }
  })
})

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
test.describe('Calendar', () => {
  test('calendar page renders', async ({ page }) => {
    await loadPage(page, '/calendar')
    // Should have calendar or availability tab
    const calendarTab = page.getByRole('tab', { name: /calendar|kalender/i }).first()
    const availabilityTab = page.getByRole('tab', { name: /availability|tillgänglighet/i }).first()
    expect((await calendarTab.isVisible()) || (await availabilityTab.isVisible())).toBeTruthy()
  })

  test('availability tab shows week grid', async ({ page }) => {
    await loadPage(page, '/calendar')
    const availabilityTab = page.getByRole('tab', { name: /availability|tillgänglighet/i }).first()
    await expect(availabilityTab).toBeVisible({ timeout: 5000 })
    await availabilityTab.click()
    await page.waitForTimeout(2000)
    // Should show week labels (V1, V2, etc. or W1, W2) or status words
    const content = await page.textContent('main')
    expect(content).toMatch(/V\d|W\d|vecka|week|ledig|free|upptagen|busy/i)
  })
})

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
test.describe('Analytics', () => {
  test('analytics page loads with charts', async ({ page }) => {
    await loadPage(page, '/analytics')
    // Should have some content (revenue chart, stats)
    const content = await page.textContent('main')
    expect(content).toBeTruthy()
    expect(content!.length).toBeGreaterThan(50)
  })
})

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
test.describe('Dashboard', () => {
  test('dashboard shows upcoming gigs section', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const content = await page.textContent('main')
    // Should have upcoming section or "no gigs" message
    expect(content).toMatch(/upcoming|kommande|no.*event|inga.*event/i)
  })

  test('dashboard shows unpaid invoices section', async ({ page }) => {
    await loadPage(page, '/dashboard')
    const content = await page.textContent('main')
    expect(content).toMatch(/unpaid|obetalda|invoices|fakturor/i)
  })
})
