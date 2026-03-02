import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'
import path from 'path'

// Load test credentials from tests/.env.test
dotenv.config({ path: path.resolve(__dirname, 'tests/.env.test') })

export default defineConfig({
  testDir: './tests',
  outputDir: './tests/screenshots',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: true,
  },
  projects: [
    // Auth setup — runs once before all authenticated tests
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'member-setup',
      testMatch: /auth-member\.setup\.ts/,
    },

    // Security header tests (no auth needed)
    {
      name: 'security',
      testMatch: /security-headers\.spec\.ts/,
    },

    // Public pages (no auth needed)
    {
      name: 'iPhone',
      testMatch: /responsive\.spec\.ts/,
      use: { viewport: { width: 390, height: 844 } },
    },
    {
      name: 'iPad',
      testMatch: /responsive\.spec\.ts/,
      use: { viewport: { width: 820, height: 1180 } },
    },
    {
      name: 'Desktop',
      testMatch: /responsive\.spec\.ts/,
      use: { viewport: { width: 1440, height: 900 } },
    },

    // Authenticated tests (owner) — depend on setup
    {
      name: 'iPhone-auth',
      testMatch: /ui-audit\.spec\.ts|gig-dialog-screenshots\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        viewport: { width: 390, height: 844 },
        storageState: 'tests/.auth/state.json',
      },
    },
    {
      name: 'iPad-auth',
      testMatch: /ui-audit\.spec\.ts|gig-dialog-screenshots\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        viewport: { width: 820, height: 1180 },
        storageState: 'tests/.auth/state.json',
      },
    },
    {
      name: 'iPad-landscape-auth',
      testMatch: /ui-audit\.spec\.ts|gig-dialog-screenshots\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        viewport: { width: 1180, height: 820 },
        storageState: 'tests/.auth/state.json',
      },
    },
    {
      name: 'Desktop-auth',
      testMatch: /ui-audit\.spec\.ts|gig-dialog-screenshots\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/.auth/state.json',
      },
    },

    // Functional tests (owner) — Desktop only
    {
      name: 'functional',
      testMatch: /functional\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/.auth/state.json',
      },
    },

    // Team tests (member) — Desktop only
    {
      name: 'team',
      testMatch: /team\.spec\.ts/,
      dependencies: ['member-setup'],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/.auth/member-state.json',
      },
    },

    // CRUD tests (owner, desktop) — gigs, clients, invoices, expenses, config
    {
      name: 'crud',
      testMatch: /gig-crud|client-crud|invoice-crud|expense-crud|config-types|config-positions/,
      dependencies: ['setup'],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/.auth/state.json',
      },
    },

    // Page tests (owner, desktop) — settings, dashboard, calendar, validation
    {
      name: 'pages',
      testMatch: /settings-save|dashboard-widgets|calendar-nav|form-validation/,
      dependencies: ['setup'],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/.auth/state.json',
      },
    },

    // Swedish locale tests (owner, desktop)
    {
      name: 'locale-sv',
      testMatch: /locale-sv\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/.auth/state.json',
      },
    },

    // Team visibility tests (owner, desktop) — gig visibility toggle
    {
      name: 'team-visibility',
      testMatch: /team-visibility\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/.auth/state.json',
      },
    },

    // Subscription tier tests (owner, desktop) — plan-dependent UI
    // Must run AFTER team-visibility (both modify the same subscription/company)
    {
      name: 'subscription',
      testMatch: /subscription-tier\.spec\.ts/,
      dependencies: ['setup', 'team-visibility'],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/.auth/state.json',
      },
    },

    // Layout regression tests (owner, desktop) — catch button cutoffs, width issues
    {
      name: 'layout-regression',
      testMatch: /layout-regression\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/.auth/state.json',
      },
    },

    // Auth flow tests (public, no auth needed)
    {
      name: 'auth-flow',
      testMatch: /auth-flow\.spec\.ts/,
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },

    // Contract signing tests (public pages, no auth needed)
    {
      name: 'contract-signing',
      testMatch: /contract-signing\.spec\.ts/,
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },

    // Onboarding tests (owner auth, temporarily resets onboarding_completed)
    {
      name: 'onboarding',
      testMatch: /onboarding\.spec\.ts/,
      dependencies: ['setup'],
      use: {
        viewport: { width: 1440, height: 900 },
        storageState: 'tests/.auth/state.json',
      },
    },

    // Invite flow tests (owner + member auth, tests create/accept API + team UI)
    {
      name: 'invite-flow',
      testMatch: /invite-flow\.spec\.ts/,
      dependencies: ['setup', 'member-setup'],
      use: {
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
})
