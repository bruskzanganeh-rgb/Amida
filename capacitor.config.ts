import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.babalisk.amida',
  appName: 'Amida',
  webDir: 'out',
  server: {
    url: 'https://amida.babalisk.com',
    cleartext: false,
  },
  ios: {
    scheme: 'Amida',
    contentInset: 'automatic',
    backgroundColor: '#0B1E3A',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false, // We hide manually after web content loads
      backgroundColor: '#0B1E3A',
    },
  },
}

export default config
