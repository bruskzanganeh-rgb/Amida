'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
}

const THRESHOLD = 60

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const pulling = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const refreshingRef = useRef(false)
  const pullDistanceRef = useRef(0)

  // Keep refs in sync with state for use in native event handlers
  refreshingRef.current = refreshing
  pullDistanceRef.current = pullDistance

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    setPullDistance(THRESHOLD * 0.6)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
      setPullDistance(0)
    }
  }, [onRefresh])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return
      if (window.scrollY <= 0) {
        startY.current = e.touches[0].clientY
        pulling.current = true
      }
    }

    function onTouchMove(e: TouchEvent) {
      if (!pulling.current || refreshingRef.current) return
      const delta = e.touches[0].clientY - startY.current
      if (delta > 0 && window.scrollY <= 0) {
        // Prevent iOS native bounce/refresh
        e.preventDefault()
        const distance = Math.min(delta * 0.4, 100)
        pullDistanceRef.current = distance
        setPullDistance(distance)
      } else {
        pulling.current = false
        setPullDistance(0)
      }
    }

    function onTouchEnd() {
      if (!pulling.current) return
      pulling.current = false

      if (pullDistanceRef.current >= THRESHOLD) {
        handleRefresh()
      } else {
        setPullDistance(0)
      }
    }

    // passive: false is critical for iOS Safari to allow preventDefault()
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [handleRefresh])

  const progress = Math.min(pullDistance / THRESHOLD, 1)

  return (
    <div ref={containerRef}>
      {/* Spinner indicator */}
      <div
        className="flex items-center justify-center overflow-hidden transition-[height] duration-200 ease-out"
        style={{ height: pullDistance > 0 || refreshing ? `${Math.max(pullDistance, refreshing ? 36 : 0)}px` : '0px' }}
      >
        <Loader2
          className="h-5 w-5 text-primary"
          style={{
            opacity: progress,
            animation: refreshing ? 'spin 0.8s linear infinite' : 'none',
            transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
          }}
        />
      </div>
      {children}
    </div>
  )
}
