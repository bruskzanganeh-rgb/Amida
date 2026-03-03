'use client'

import { useEffect, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export function ScrollIndicator({ targetRef }: { targetRef: React.RefObject<HTMLElement | null> }) {
  const [showArrow, setShowArrow] = useState(false)

  useEffect(() => {
    const el = targetRef.current
    if (!el) return

    function check() {
      if (!el) return
      const hasScroll = el.scrollHeight > el.clientHeight + 4
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4
      setShowArrow(hasScroll && !atBottom)
    }

    check()
    el.addEventListener('scroll', check)
    const observer = new ResizeObserver(check)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', check)
      observer.disconnect()
    }
  }, [targetRef])

  if (!showArrow) return null

  return (
    <div className="flex justify-center py-1 shrink-0">
      <ChevronDown className="h-4 w-4 text-muted-foreground animate-bounce" />
    </div>
  )
}
