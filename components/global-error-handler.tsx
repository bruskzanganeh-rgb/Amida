'use client'

import { useEffect } from 'react'

const reported = new Set<string>()

function report(message: string, stack?: string) {
  if (reported.has(message)) return
  reported.add(message)
  fetch('/api/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: message.slice(0, 1000),
      stack: stack?.slice(0, 5000),
      url: window.location.href,
    }),
  }).catch(() => {})
}

export function GlobalErrorHandler() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      report(event.message, event.error?.stack)
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason
      const message = reason instanceof Error ? reason.message : String(reason)
      const stack = reason instanceof Error ? reason.stack : undefined
      report(`Unhandled rejection: ${message}`, stack)
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}
