import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isNative, getPlatform } from '@/lib/capacitor'

describe('lib/capacitor', () => {
  beforeEach(() => {
    // Reset window.Capacitor between tests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Capacitor
  })

  describe('isNative', () => {
    it('returns false when Capacitor is not present', () => {
      expect(isNative()).toBe(false)
    })

    it('returns true when Capacitor.isNativePlatform() returns true', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }
      expect(isNative()).toBe(true)
    })

    it('returns false when Capacitor.isNativePlatform() returns false', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).Capacitor = { isNativePlatform: () => false }
      expect(isNative()).toBe(false)
    })
  })

  describe('getPlatform', () => {
    it('returns "web" when Capacitor is not present', () => {
      expect(getPlatform()).toBe('web')
    })

    it('returns "web" when not native', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).Capacitor = { isNativePlatform: () => false }
      expect(getPlatform()).toBe('web')
    })

    it('returns "android" for android platform', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' }
      expect(getPlatform()).toBe('android')
    })

    it('returns "ios" for ios platform', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any).Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' }
      expect(getPlatform()).toBe('ios')
    })
  })
})
