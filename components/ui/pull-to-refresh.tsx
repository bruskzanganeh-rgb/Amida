'use client'

import { useCallback, useRef, useState } from 'react'
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

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (refreshing) return
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY
        pulling.current = true
      }
    },
    [refreshing],
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling.current || refreshing) return
      const delta = e.touches[0].clientY - startY.current
      if (delta > 0) {
        // Dampen the pull distance for a natural feel
        setPullDistance(Math.min(delta * 0.4, 100))
      } else {
        pulling.current = false
        setPullDistance(0)
      }
    },
    [refreshing],
  )

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return
    pulling.current = false

    if (pullDistance >= THRESHOLD) {
      setRefreshing(true)
      setPullDistance(THRESHOLD * 0.6)
      try {
        await onRefresh()
      } finally {
        setRefreshing(false)
        setPullDistance(0)
      }
    } else {
      setPullDistance(0)
    }
  }, [pullDistance, onRefresh])

  const progress = Math.min(pullDistance / THRESHOLD, 1)

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
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
