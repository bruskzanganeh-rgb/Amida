/**
 * Admin API E2E Tests
 *
 * Verifies all admin API endpoints return correct responses.
 * Temporarily grants the E2E test user admin access for testing.
 *
 * Tests: stats, users, sessions, audit, activity, sponsor-stats,
 *        config, organizations, invitation-codes.
 */
import { test, expect } from '@playwright/test'
import { getAdminClient, TEST_OWNER_ID } from './helpers'

test.describe('Admin API endpoints', () => {
  test.describe.configure({ mode: 'serial' })

  // Grant admin access before tests
  test.beforeAll(async () => {
    const supabase = getAdminClient()
    await supabase.from('admin_users').upsert({
      user_id: TEST_OWNER_ID,
      granted_at: new Date().toISOString(),
    })
  })

  // Remove admin access after tests
  test.afterAll(async () => {
    const supabase = getAdminClient()
    await supabase.from('admin_users').delete().eq('user_id', TEST_OWNER_ID)
  })

  // ── Stats ──────────────────────────────────────────────────────────────
  test('GET /api/admin/stats — returns user and revenue stats', async ({ request }) => {
    const res = await request.get('/api/admin/stats')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('totalUsers')
    expect(body).toHaveProperty('proUsers')
    expect(body).toHaveProperty('freeUsers')
    expect(body).toHaveProperty('mrr')
    expect(body).toHaveProperty('arr')
    expect(body).toHaveProperty('totalImpressions')
    expect(body).toHaveProperty('sponsorImpressionBreakdown')

    expect(typeof body.totalUsers).toBe('number')
    expect(typeof body.mrr).toBe('number')
    expect(body.totalUsers).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(body.sponsorImpressionBreakdown)).toBe(true)
  })

  // ── Users ──────────────────────────────────────────────────────────────
  test('GET /api/admin/users — returns user list with subscription data', async ({ request }) => {
    const res = await request.get('/api/admin/users')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('users')
    expect(Array.isArray(body.users)).toBe(true)
    expect(body.users.length).toBeGreaterThan(0)

    // Check user shape
    const user = body.users[0]
    expect(user).toHaveProperty('user_id')
    expect(user).toHaveProperty('plan')
    expect(user).toHaveProperty('status')
    expect(user).toHaveProperty('gig_count')
    expect(user).toHaveProperty('invoice_count')
  })

  // ── Sessions ───────────────────────────────────────────────────────────
  test('GET /api/admin/sessions — returns paginated sessions', async ({ request }) => {
    const res = await request.get('/api/admin/sessions')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('sessions')
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('page')
    expect(body).toHaveProperty('limit')
    expect(body).toHaveProperty('totalPages')

    expect(Array.isArray(body.sessions)).toBe(true)
    expect(typeof body.total).toBe('number')
    expect(body.page).toBe(1)
  })

  test('GET /api/admin/sessions — supports pagination params', async ({ request }) => {
    const res = await request.get('/api/admin/sessions?page=1&limit=5')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.limit).toBe(5)
    expect(body.sessions.length).toBeLessThanOrEqual(5)
  })

  // ── Audit ──────────────────────────────────────────────────────────────
  test('GET /api/admin/audit — returns paginated audit logs', async ({ request }) => {
    const res = await request.get('/api/admin/audit')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('logs')
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('page')
    expect(body).toHaveProperty('totalPages')

    expect(Array.isArray(body.logs)).toBe(true)
    expect(typeof body.total).toBe('number')
  })

  test('GET /api/admin/audit — supports filter params', async ({ request }) => {
    const res = await request.get('/api/admin/audit?limit=3&action=INSERT')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body.limit).toBe(3)
    expect(body.logs.length).toBeLessThanOrEqual(3)
  })

  // ── Activity ───────────────────────────────────────────────────────────
  test('GET /api/admin/activity — returns paginated activity events', async ({ request }) => {
    const res = await request.get('/api/admin/activity')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('events')
    expect(body).toHaveProperty('total')
    expect(body).toHaveProperty('page')
    expect(body).toHaveProperty('totalPages')

    expect(Array.isArray(body.events)).toBe(true)
  })

  // ── Sponsor Stats ─────────────────────────────────────────────────────
  test('GET /api/admin/sponsor-stats — returns sponsor coverage data', async ({ request }) => {
    const res = await request.get('/api/admin/sponsor-stats')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('totalFreeUsers')
    expect(body).toHaveProperty('withSponsor')
    expect(body).toHaveProperty('withoutSponsor')
    expect(body).toHaveProperty('byCity')

    expect(typeof body.totalFreeUsers).toBe('number')
    expect(Array.isArray(body.byCity)).toBe(true)
  })

  // ── Config ─────────────────────────────────────────────────────────────
  test('GET /api/admin/config — returns platform config', async ({ request }) => {
    const res = await request.get('/api/admin/config')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('config')
    expect(Array.isArray(body.config)).toBe(true)
  })

  // ── Organizations ──────────────────────────────────────────────────────
  test('GET /api/admin/organizations — returns organization list', async ({ request }) => {
    const res = await request.get('/api/admin/organizations')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('organizations')
    expect(Array.isArray(body.organizations)).toBe(true)
  })

  // ── Invitation Codes ──────────────────────────────────────────────────
  test('GET /api/admin/invitation-codes — returns codes list', async ({ request }) => {
    const res = await request.get('/api/admin/invitation-codes')
    expect(res.status()).toBe(200)

    const body = await res.json()
    expect(body).toHaveProperty('codes')
    expect(Array.isArray(body.codes)).toBe(true)
  })

  // ── Authorization ─────────────────────────────────────────────────────
  test('admin endpoints reject non-admin users', async ({ request }) => {
    // Temporarily remove admin access
    const supabase = getAdminClient()
    await supabase.from('admin_users').delete().eq('user_id', TEST_OWNER_ID)

    try {
      const endpoints = [
        '/api/admin/stats',
        '/api/admin/users',
        '/api/admin/sessions',
        '/api/admin/audit',
        '/api/admin/activity',
        '/api/admin/config',
        '/api/admin/organizations',
      ]

      for (const endpoint of endpoints) {
        const res = await request.get(endpoint)
        expect(res.status(), `${endpoint} should reject non-admin`).toBe(403)
      }
    } finally {
      // Restore admin access for any remaining tests
      await supabase.from('admin_users').upsert({
        user_id: TEST_OWNER_ID,
        granted_at: new Date().toISOString(),
      })
    }
  })
})
