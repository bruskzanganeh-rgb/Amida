/**
 * Swedish Locale Tests — Verify critical flows work in Swedish.
 *
 * Sets NEXT_LOCALE=sv cookie before each test.
 * Runs as the OWNER account.
 */
import { test, expect } from '@playwright/test'
import { loadPage } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.context().addCookies([
    {
      name: 'NEXT_LOCALE',
      value: 'sv',
      domain: 'localhost',
      path: '/',
    },
  ])
})

test.describe('Swedish Locale', () => {
  test('dashboard visar svenska texter', async ({ page }) => {
    await loadPage(page, '/dashboard')

    const content = await page.textContent('main')
    // Should show Swedish text
    expect(content).toMatch(/kommande|obetalda|intäkter|event/i)
  })

  test('gig dialog på svenska', async ({ page }) => {
    await loadPage(page, '/gigs')

    // Button should say "Nytt event"
    const newGigBtn = page.getByRole('button', { name: /nytt event/i }).first()
    await expect(newGigBtn).toBeVisible({ timeout: 5000 })

    await newGigBtn.click()
    await page.waitForTimeout(1000)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Dialog should have Swedish text
    const dialogText = await dialog.textContent()
    expect(dialogText).toMatch(/nytt event|eventtyp|kund|arvode|plats/i)

    await page.keyboard.press('Escape')
  })

  test('finance visar fakturor och utgifter', async ({ page }) => {
    await loadPage(page, '/finance')

    // Tabs should be in Swedish
    const invoiceTab = page.getByRole('tab', { name: /fakturor/i })
    const expenseTab = page.getByRole('tab', { name: /utgifter/i })

    expect((await invoiceTab.isVisible()) || (await expenseTab.isVisible())).toBeTruthy()
  })

  test('settings tabs på svenska', async ({ page }) => {
    await loadPage(page, '/settings')

    // Check Swedish tab names
    const tabs = page.getByRole('tab')
    const tabTexts: string[] = []
    for (let i = 0; i < (await tabs.count()); i++) {
      const text = await tabs.nth(i).textContent()
      if (text) tabTexts.push(text.toLowerCase())
    }

    const tabString = tabTexts.join(' ')
    // Should contain Swedish tab names
    expect(tabString).toMatch(/företag|e-post|kalender|team|prenumeration/i)
  })

  test('config tabs på svenska', async ({ page }) => {
    await loadPage(page, '/config')

    const tabs = page.getByRole('tab')
    const tabTexts: string[] = []
    for (let i = 0; i < (await tabs.count()); i++) {
      const text = await tabs.nth(i).textContent()
      if (text) tabTexts.push(text.toLowerCase())
    }

    const tabString = tabTexts.join(' ')
    // Should contain Swedish config tab names
    expect(tabString).toMatch(/typer|roller|kunder/i)
  })
})
