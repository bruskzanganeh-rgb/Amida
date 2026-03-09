import { isNative } from './capacitor'

/**
 * Initialize native Capacitor plugins when running in iOS/Android app.
 * Call once at app startup (e.g., in root layout useEffect).
 * Safe to call on web — all imports are conditional on isNative().
 */
export async function initNativePlugins() {
  if (!isNative()) return

  // Prevent pull-to-refresh by blocking downward touchmove on body
  let startY = 0
  document.addEventListener(
    'touchstart',
    (e) => {
      startY = e.touches[0].clientY
    },
    { passive: true },
  )
  document.addEventListener(
    'touchmove',
    (e) => {
      const y = e.touches[0].clientY
      if (y > startY && (document.scrollingElement?.scrollTop ?? 0) === 0) {
        e.preventDefault()
      }
    },
    { passive: false },
  )

  try {
    // Dark status bar to match Amida's dark theme
    const { StatusBar, Style } = await import('@capacitor/status-bar')
    await StatusBar.setStyle({ style: Style.Dark })

    // Hide splash screen after web content loads
    const { SplashScreen } = await import('@capacitor/splash-screen')
    await SplashScreen.hide({ fadeOutDuration: 300 })

    // Listen for network changes — show toast when offline
    const { Network } = await import('@capacitor/network')
    Network.addListener('networkStatusChange', (status) => {
      if (!status.connected) {
        // Dynamic import to avoid bundling sonner in native init path
        import('sonner').then(({ toast }) => {
          toast.error('No internet connection', {
            id: 'offline',
            duration: Infinity,
          })
        })
      } else {
        import('sonner').then(({ toast }) => {
          toast.dismiss('offline')
        })
      }
    })
  } catch (err) {
    console.warn('Native plugin init error:', err)
  }
}
