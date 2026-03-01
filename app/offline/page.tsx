'use client'

import { WifiOff } from 'lucide-react'

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <WifiOff className="h-16 w-16 text-muted-foreground" />
      <h1 className="text-2xl font-semibold">Du är offline</h1>
      <p className="max-w-sm text-muted-foreground">Kontrollera din internetanslutning och försök igen.</p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 rounded-lg bg-primary px-6 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Försök igen
      </button>
    </div>
  )
}
