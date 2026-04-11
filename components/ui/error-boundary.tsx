'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslations } from 'next-intl'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

function ErrorFallback({ onReset }: { onReset: () => void }) {
  const t = useTranslations('errors')
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <AlertTriangle className="h-8 w-8 mb-2 opacity-50" />
      <p className="text-sm mb-3">{t('somethingWentWrong')}</p>
      <Button variant="outline" size="sm" onClick={onReset}>
        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
        {t('tryAgain')}
      </Button>
    </div>
  )
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        url: typeof window !== 'undefined' ? window.location.href : null,
      }),
    }).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return <ErrorFallback onReset={() => this.setState({ hasError: false })} />
    }

    return this.props.children
  }
}
