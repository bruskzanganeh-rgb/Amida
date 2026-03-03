'use client'

import { useEffect } from 'react'

export function NativeInit() {
  useEffect(() => {
    import('@/lib/native-init').then(({ initNativePlugins }) => initNativePlugins())
  }, [])

  return null
}
