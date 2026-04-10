import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('lib/rate-limit', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows requests under the limit', async () => {
    const { rateLimit } = await import('@/lib/rate-limit')
    const result = rateLimit('test-1', 3, 60000)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it('blocks requests at the limit', async () => {
    const { rateLimit } = await import('@/lib/rate-limit')
    rateLimit('test-2', 2, 60000)
    rateLimit('test-2', 2, 60000)
    const result = rateLimit('test-2', 2, 60000)
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('resets after window expires', async () => {
    const { rateLimit } = await import('@/lib/rate-limit')
    rateLimit('test-3', 1, 1000)
    const blocked = rateLimit('test-3', 1, 1000)
    expect(blocked.success).toBe(false)

    vi.advanceTimersByTime(1001)
    const result = rateLimit('test-3', 1, 1000)
    expect(result.success).toBe(true)
  })

  it('cleans up expired entries after cleanup interval', async () => {
    const { rateLimit } = await import('@/lib/rate-limit')
    // Create an entry with a short window
    rateLimit('cleanup-test', 5, 1000)

    // Advance past both the entry's window and the cleanup interval (5 min)
    vi.advanceTimersByTime(6 * 60 * 1000)

    // This call triggers cleanup and creates a fresh entry
    const result = rateLimit('cleanup-test', 5, 60000)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('rateLimitResponse returns 429 with JSON body', async () => {
    const { rateLimitResponse } = await import('@/lib/rate-limit')
    const response = rateLimitResponse()
    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body.error).toContain('Too many requests')
  })
})
