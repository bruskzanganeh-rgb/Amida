/**
 * UI Audit — Automated scan for broken i18n keys and layout issues.
 *
 * Runs on all authenticated pages + opens common dialogs.
 * Checks every viewport (iPhone, iPad, Desktop) for:
 *   1. Broken i18n keys (raw namespace.key patterns, unresolved {variables})
 *   2. Horizontal overflow
 *   3. Elements overflowing the viewport
 *   4. Content/footer overlap within scrollable containers
 *   5. Table cell text overflow (table-fixed tables)
 */
import { test, expect, Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Pages to test
// ---------------------------------------------------------------------------
const pages = [
  { name: 'dashboard', path: '/dashboard' },
  { name: 'gigs', path: '/gigs' },
  { name: 'calendar', path: '/calendar' },
  { name: 'finance', path: '/finance' },
  { name: 'settings', path: '/settings' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Scan visible text nodes in the DOM for patterns that indicate broken
 * i18n translations:
 *   - "namespace.key.subkey" patterns (e.g. "expense.monthNames.1")
 *   - Unresolved interpolation like "{count}" or "{name}"
 *   - Raw keys starting with common namespace prefixes
 */
async function findBrokenI18nKeys(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = []

    // Known i18n namespace prefixes in this app
    const namespaces = [
      'common',
      'auth',
      'gig',
      'invoice',
      'expense',
      'calendar',
      'dashboard',
      'settings',
      'status',
      'toast',
      'team',
      'admin',
      'onboarding',
    ]
    const nsPattern = new RegExp(`^(${namespaces.join('|')})\\.\\w+`, 'i')

    // Pattern for unresolved interpolation: {variableName}
    const interpolationPattern = /\{[a-zA-Z_]\w*\}/

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null)

    let node: Text | null
    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent?.trim()
      if (!text || text.length < 3) continue

      // Skip script/style/hidden elements
      const parent = node.parentElement
      if (!parent) continue
      const tag = parent.tagName.toLowerCase()
      if (tag === 'script' || tag === 'style' || tag === 'noscript') continue

      // Check if element is visible
      const style = window.getComputedStyle(parent)
      if (style.display === 'none' || style.visibility === 'hidden') continue

      // Check for namespace.key patterns
      if (nsPattern.test(text)) {
        problems.push(`Broken i18n key: "${text}" in <${tag}>`)
      }

      // Check for unresolved {variable} interpolation
      const match = text.match(interpolationPattern)
      if (match) {
        // Ignore CSS custom properties and code blocks
        if (!text.includes('var(--') && !text.includes('${')) {
          problems.push(`Unresolved interpolation: "${text}" in <${tag}>`)
        }
      }
    }

    return problems
  })
}

/**
 * Check for horizontal overflow on the page.
 */
async function checkNoHorizontalOverflow(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(
    scrollWidth,
    `Horizontal overflow: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`,
  ).toBeLessThanOrEqual(clientWidth + 1)
}

/**
 * Check that no interactive elements overflow the viewport.
 */
async function checkElementsWithinViewport(page: Page) {
  const overflowing = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth
    const selectors = 'button, input, select, a, [role="dialog"], [role="combobox"]'
    const elements = document.querySelectorAll(selectors)
    const results: string[] = []

    // Check if element is inside a scroll container that clips it
    function isInsideScrollContainer(el: Element): boolean {
      let parent = el.parentElement
      while (parent && parent !== document.body) {
        const style = window.getComputedStyle(parent)
        const overflowX = style.overflowX
        if (overflowX === 'auto' || overflowX === 'hidden' || overflowX === 'scroll') {
          const parentRect = parent.getBoundingClientRect()
          if (parentRect.right <= vw + 5) return true
        }
        parent = parent.parentElement
      }
      return false
    }

    elements.forEach((el) => {
      const rect = el.getBoundingClientRect()
      if (rect.width > 0 && rect.right > vw + 5) {
        // Skip elements inside scroll containers — they're visually clipped
        if (isInsideScrollContainer(el)) return
        const tag = el.tagName.toLowerCase()
        const cls = (el.className?.toString() || '').slice(0, 60)
        results.push(`${tag}[${cls}] right=${Math.round(rect.right)} > viewport=${vw}`)
      }
    })

    return results
  })

  expect(overflowing, `Elements overflow viewport:\n${overflowing.join('\n')}`).toHaveLength(0)
}

/**
 * Check that no sibling elements overlap with scrollable containers.
 * Catches cases like a footer overlapping a scroll area within the same card.
 */
async function checkNoContentFooterOverlap(page: Page) {
  const overlaps = await page.evaluate(() => {
    const results: string[] = []
    const scrollables = document.querySelectorAll('*')

    scrollables.forEach((el) => {
      const style = window.getComputedStyle(el)
      if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') return

      const rect = el.getBoundingClientRect()
      if (rect.height === 0) return

      // Check subsequent siblings of the scroll element's parent
      // (the scroll container is typically absolutely positioned inside a wrapper)
      const wrapper = el.parentElement
      if (!wrapper) return

      let sibling = wrapper.nextElementSibling
      while (sibling) {
        const sibRect = sibling.getBoundingClientRect()
        if (sibRect.height > 0 && sibRect.top < rect.bottom - 2) {
          const text = sibling.textContent?.trim().slice(0, 50) || ''
          results.push(
            `"${text}" (top=${Math.round(sibRect.top)}) overlaps scroll area (bottom=${Math.round(rect.bottom)})`,
          )
        }
        sibling = sibling.nextElementSibling
      }
    })

    return results
  })

  expect(overlaps, `Content/footer overlap detected:\n${overlaps.join('\n')}`).toHaveLength(0)
}

/**
 * Check that no table cells have text overflowing their boundaries.
 * Only checks tables with table-layout: fixed where columns have forced widths.
 */
/**
 * Check that no table cells have visible text overflow.
 * Cells with overflow:hidden are OK (text is truncated with ellipsis).
 * Only flags cells where text bleeds into adjacent cells.
 */
async function checkNoTableCellOverflow(page: Page) {
  const issues = await page.evaluate(() => {
    const results: string[] = []
    const tables = document.querySelectorAll('table')

    tables.forEach((table) => {
      const style = window.getComputedStyle(table)
      if (style.tableLayout !== 'fixed') return

      const cells = table.querySelectorAll('td')
      cells.forEach((cell) => {
        const cellStyle = window.getComputedStyle(cell)
        // overflow:hidden means content is properly clipped — OK
        if (cellStyle.overflow === 'hidden') return

        if (cell.scrollWidth > cell.clientWidth + 4) {
          const text = cell.textContent?.trim().slice(0, 40) || ''
          results.push(`Cell "${text}" overflow: scrollWidth=${cell.scrollWidth} > clientWidth=${cell.clientWidth}`)
        }
      })
    })

    return results
  })

  expect(issues, `Table cell overflow:\n${issues.join('\n')}`).toHaveLength(0)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('UI Audit — i18n keys', () => {
  for (const pg of pages) {
    test(`${pg.name} — no broken i18n keys`, async ({ page }) => {
      await page.goto(pg.path, { waitUntil: 'networkidle' })
      // Wait a bit for dynamic content to load
      await page.waitForTimeout(1000)

      const problems = await findBrokenI18nKeys(page)
      expect(problems, `Broken i18n keys found on ${pg.name}:\n${problems.join('\n')}`).toHaveLength(0)
    })
  }
})

test.describe('UI Audit — layout', () => {
  for (const pg of pages) {
    test(`${pg.name} — no horizontal overflow`, async ({ page }) => {
      await page.goto(pg.path, { waitUntil: 'networkidle' })
      await checkNoHorizontalOverflow(page)
    })

    test(`${pg.name} — elements within viewport`, async ({ page }) => {
      await page.goto(pg.path, { waitUntil: 'networkidle' })
      await checkElementsWithinViewport(page)
    })

    test(`${pg.name} — no content/footer overlap`, async ({ page }) => {
      await page.goto(pg.path, { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      await checkNoContentFooterOverlap(page)
    })

    test(`${pg.name} — no table cell overflow`, async ({ page }) => {
      await page.goto(pg.path, { waitUntil: 'networkidle' })
      await page.waitForTimeout(500)
      await checkNoTableCellOverflow(page)
    })
  }
})

test.describe('UI Audit — dialogs', () => {
  test('gigs — new gig dialog has no broken i18n', async ({ page }) => {
    await page.goto('/gigs', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)

    // Click "New gig" button (use first() to avoid strict mode with FAB + inline button)
    const newGigBtn = page.getByRole('button', { name: /nytt event|new event/i }).first()
    if (await newGigBtn.isVisible()) {
      await newGigBtn.click()
      await page.waitForTimeout(500)

      const problems = await findBrokenI18nKeys(page)
      expect(problems, `Broken i18n in new gig dialog:\n${problems.join('\n')}`).toHaveLength(0)

      // Close dialog
      await page.keyboard.press('Escape')
    }
  })

  test('finance — export dialog has no broken i18n', async ({ page }) => {
    await page.goto('/finance', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)

    // Switch to expenses tab if needed, then click export
    const expensesTab = page.getByRole('tab', { name: /utgifter|expenses/i })
    if (await expensesTab.isVisible()) {
      await expensesTab.click()
      await page.waitForTimeout(500)
    }

    const exportBtn = page.getByRole('button', { name: /exportera|export/i })
    if (await exportBtn.isVisible()) {
      await exportBtn.click()
      await page.waitForTimeout(1000)

      const problems = await findBrokenI18nKeys(page)
      expect(problems, `Broken i18n in export dialog:\n${problems.join('\n')}`).toHaveLength(0)

      await page.keyboard.press('Escape')
    }
  })

  test('finance — new invoice dialog has no broken i18n', async ({ page }) => {
    await page.goto('/finance', { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)

    const newInvoiceBtn = page.getByRole('button', { name: /ny faktura|new invoice/i }).first()
    if (await newInvoiceBtn.isVisible()) {
      await newInvoiceBtn.click()
      await page.waitForTimeout(500)

      const problems = await findBrokenI18nKeys(page)
      expect(problems, `Broken i18n in new invoice dialog:\n${problems.join('\n')}`).toHaveLength(0)

      await page.keyboard.press('Escape')
    }
  })
})

test.describe('UI Audit — screenshots', () => {
  for (const pg of pages) {
    test(`screenshot — ${pg.name}`, async ({ page }, testInfo) => {
      await page.goto(pg.path, { waitUntil: 'networkidle' })
      await page.waitForTimeout(1000)

      await page.screenshot({
        path: `tests/screenshots/${testInfo.project.name}-${pg.name}.png`,
        fullPage: true,
      })
    })
  }
})
