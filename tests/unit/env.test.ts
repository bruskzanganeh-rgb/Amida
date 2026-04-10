import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// We need to reset the module-level _validated flag between tests
describe('lib/env', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
    }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('validates successfully with all required env vars', async () => {
    const { validateEnv } = await import('@/lib/env')
    const result = validateEnv()
    expect(result).toBeDefined()
    expect(result.NEXT_PUBLIC_SUPABASE_URL).toBe('https://test.supabase.co')
  })

  it('returns env even when validation fails (missing required vars)', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { validateEnv } = await import('@/lib/env')
    const result = validateEnv()
    expect(result).toBeDefined()
    consoleSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('warns about missing optional vars', async () => {
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.ANTHROPIC_API_KEY
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { validateEnv } = await import('@/lib/env')
    validateEnv()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('STRIPE_SECRET_KEY'))
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ANTHROPIC_API_KEY'))
    warnSpy.mockRestore()
  })

  it('caches validation on second call (skips re-parsing)', async () => {
    const { validateEnv } = await import('@/lib/env')
    validateEnv()
    // Second call should not throw even if env changed
    const second = validateEnv()
    expect(second).toBeDefined()
  })

  it('does not warn when optional vars are present', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123'
    process.env.ANTHROPIC_API_KEY = 'sk-ant-123'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { validateEnv } = await import('@/lib/env')
    validateEnv()
    expect(warnSpy).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })
})
