/**
 * Detect whether the app is running inside a Capacitor native shell (iOS/Android).
 * Used to conditionally show Apple IAP vs Stripe checkout.
 */
export function isNative(): boolean {
  if (typeof window === 'undefined') return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).Capacitor?.isNativePlatform()
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  if (typeof window === 'undefined') return 'web'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cap = (window as any).Capacitor
  if (!cap?.isNativePlatform()) return 'web'
  return cap.getPlatform() === 'android' ? 'android' : 'ios'
}
