import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
// ---------------------------------------------------------------------------
// 1. Rate Limiter
// ---------------------------------------------------------------------------
describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Reset the module between tests so the internal Map store is fresh
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function importRateLimit() {
    const mod = await import('@/lib/rate-limit')
    return mod.rateLimit
  }

  it('first request succeeds with remaining = limit - 1', async () => {
    const rateLimit = await importRateLimit()
    const result = rateLimit('user-1', 5, 60_000)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('allows requests up to the limit', async () => {
    const rateLimit = await importRateLimit()
    for (let i = 0; i < 3; i++) {
      const result = rateLimit('user-1', 3, 60_000)
      expect(result.success).toBe(true)
      expect(result.remaining).toBe(3 - 1 - i)
    }
  })

  it('rejects requests that exceed the limit', async () => {
    const rateLimit = await importRateLimit()
    // Exhaust the limit
    for (let i = 0; i < 3; i++) {
      rateLimit('user-1', 3, 60_000)
    }
    // Next request should fail
    const result = rateLimit('user-1', 3, 60_000)
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('different identifiers are independent', async () => {
    const rateLimit = await importRateLimit()
    // Exhaust limit for user-1
    for (let i = 0; i < 2; i++) {
      rateLimit('user-1', 2, 60_000)
    }
    const blocked = rateLimit('user-1', 2, 60_000)
    expect(blocked.success).toBe(false)

    // user-2 should still be allowed
    const allowed = rateLimit('user-2', 2, 60_000)
    expect(allowed.success).toBe(true)
    expect(allowed.remaining).toBe(1)
  })

  it('window resets after the specified time', async () => {
    const rateLimit = await importRateLimit()
    // Exhaust limit
    for (let i = 0; i < 2; i++) {
      rateLimit('user-1', 2, 10_000)
    }
    expect(rateLimit('user-1', 2, 10_000).success).toBe(false)

    // Advance past the window
    vi.advanceTimersByTime(10_001)

    // Should be allowed again
    const result = rateLimit('user-1', 2, 10_000)
    expect(result.success).toBe(true)
    expect(result.remaining).toBe(1)
  })

  it('remaining decreases with each request', async () => {
    const rateLimit = await importRateLimit()
    expect(rateLimit('user-1', 5, 60_000).remaining).toBe(4)
    expect(rateLimit('user-1', 5, 60_000).remaining).toBe(3)
    expect(rateLimit('user-1', 5, 60_000).remaining).toBe(2)
    expect(rateLimit('user-1', 5, 60_000).remaining).toBe(1)
    expect(rateLimit('user-1', 5, 60_000).remaining).toBe(0)
  })

  it('returns remaining 0 when blocked (over limit)', async () => {
    const rateLimit = await importRateLimit()
    rateLimit('user-1', 1, 60_000)
    const result = rateLimit('user-1', 1, 60_000)
    expect(result.success).toBe(false)
    expect(result.remaining).toBe(0)
  })
})

describe('rateLimitResponse', () => {
  it('returns a Response with 429 status', async () => {
    const { rateLimitResponse } = await import('@/lib/rate-limit')
    const response = rateLimitResponse()
    expect(response.status).toBe(429)
  })

  it('returns JSON body with error message', async () => {
    const { rateLimitResponse } = await import('@/lib/rate-limit')
    const response = rateLimitResponse()
    const body = await response.json()
    expect(body.error).toBe('Too many requests. Please try again later.')
  })

  it('has Content-Type application/json header', async () => {
    const { rateLimitResponse } = await import('@/lib/rate-limit')
    const response = rateLimitResponse()
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })
})

// ---------------------------------------------------------------------------
// 3. API Response helpers
// ---------------------------------------------------------------------------
describe('apiSuccess', () => {
  it('returns success:true with data', async () => {
    const { apiSuccess } = await import('@/lib/api-response')
    const response = apiSuccess({ id: 1, name: 'test' })
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ id: 1, name: 'test' })
  })

  it('defaults to status 200', async () => {
    const { apiSuccess } = await import('@/lib/api-response')
    const response = apiSuccess('ok')
    expect(response.status).toBe(200)
  })

  it('accepts a custom status code', async () => {
    const { apiSuccess } = await import('@/lib/api-response')
    const response = apiSuccess({ created: true }, 201)
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ created: true })
  })

  it('handles null data', async () => {
    const { apiSuccess } = await import('@/lib/api-response')
    const response = apiSuccess(null)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data).toBeNull()
  })

  it('handles array data', async () => {
    const { apiSuccess } = await import('@/lib/api-response')
    const response = apiSuccess([1, 2, 3])
    const body = await response.json()
    expect(body.data).toEqual([1, 2, 3])
  })
})

describe('apiError', () => {
  it('returns success:false with error message', async () => {
    const { apiError } = await import('@/lib/api-response')
    const response = apiError('Something went wrong')
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error).toBe('Something went wrong')
  })

  it('defaults to status 400', async () => {
    const { apiError } = await import('@/lib/api-response')
    const response = apiError('Bad request')
    expect(response.status).toBe(400)
  })

  it('accepts a custom status code', async () => {
    const { apiError } = await import('@/lib/api-response')
    const response = apiError('Not found', 404)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.error).toBe('Not found')
  })

  it('accepts 500 status for server errors', async () => {
    const { apiError } = await import('@/lib/api-response')
    const response = apiError('Internal server error', 500)
    expect(response.status).toBe(500)
  })
})

describe('apiValidationError', () => {
  it('returns success:false with "Validation failed" error', async () => {
    const { apiValidationError } = await import('@/lib/api-response')
    const response = apiValidationError({ name: ['Required'] })
    const body = await response.json()
    expect(body.success).toBe(false)
    expect(body.error).toBe('Validation failed')
  })

  it('includes fieldErrors in the response', async () => {
    const { apiValidationError } = await import('@/lib/api-response')
    const fieldErrors = {
      email: ['Invalid email', 'Email is required'],
      name: ['Name is required'],
    }
    const response = apiValidationError(fieldErrors)
    const body = await response.json()
    expect(body.fieldErrors).toEqual(fieldErrors)
  })

  it('returns status 400', async () => {
    const { apiValidationError } = await import('@/lib/api-response')
    const response = apiValidationError({ field: ['error'] })
    expect(response.status).toBe(400)
  })

  it('handles empty fieldErrors object', async () => {
    const { apiValidationError } = await import('@/lib/api-response')
    const response = apiValidationError({})
    const body = await response.json()
    expect(body.fieldErrors).toEqual({})
    expect(body.error).toBe('Validation failed')
  })
})

// ---------------------------------------------------------------------------
// 4. cn — Tailwind class merge utility
// ---------------------------------------------------------------------------
describe('cn', () => {
  it('merges multiple class strings', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes (falsy values)', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('handles undefined and null inputs', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })

  it('resolves Tailwind conflicts (last wins)', async () => {
    const { cn } = await import('@/lib/utils')
    // twMerge should resolve px-2 vs px-4 to px-4
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('resolves conflicting text colors', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('keeps non-conflicting classes', async () => {
    const { cn } = await import('@/lib/utils')
    const result = cn('p-4', 'mt-2', 'text-red-500')
    expect(result).toContain('p-4')
    expect(result).toContain('mt-2')
    expect(result).toContain('text-red-500')
  })

  it('returns empty string with no arguments', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn()).toBe('')
  })

  it('handles array inputs (clsx feature)', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('handles object inputs (clsx feature)', async () => {
    const { cn } = await import('@/lib/utils')
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
  })
})
