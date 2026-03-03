'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCompany } from '@/lib/hooks/use-company'
import { useSubscription } from '@/lib/hooks/use-subscription'

// ── Shared singleton state (survives across hook instances) ──
let _showOnlyMine = false
let _currentUserId = ''
let _loaded = false
const _listeners = new Set<() => void>()

function notify() {
  _listeners.forEach((fn) => fn())
}

function subscribe(listener: () => void) {
  _listeners.add(listener)
  return () => {
    _listeners.delete(listener)
  }
}

function getSnapshot() {
  return { showOnlyMine: _showOnlyMine, currentUserId: _currentUserId, loaded: _loaded }
}

// Stable reference for useSyncExternalStore — returns a new object only when values change
let _cachedSnapshot = getSnapshot()
function getStableSnapshot() {
  const next = getSnapshot()
  if (
    next.showOnlyMine !== _cachedSnapshot.showOnlyMine ||
    next.currentUserId !== _cachedSnapshot.currentUserId ||
    next.loaded !== _cachedSnapshot.loaded
  ) {
    _cachedSnapshot = next
  }
  return _cachedSnapshot
}

// Load from DB once
let _initPromise: Promise<void> | null = null
function ensureLoaded() {
  if (_initPromise) return _initPromise
  _initPromise = (async () => {
    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      _loaded = true
      notify()
      return
    }
    _currentUserId = user.id

    const { data } = await supabase.from('company_settings').select('show_only_my_data').eq('user_id', user.id).single()

    _showOnlyMine = data?.show_only_my_data ?? false
    _loaded = true
    notify()
  })()
  return _initPromise
}

async function toggleShowOnlyMine() {
  const newValue = !_showOnlyMine
  _showOnlyMine = newValue
  notify()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  await supabase.from('company_settings').update({ show_only_my_data: newValue }).eq('user_id', user.id)
}

// ── Hook ──
export function useGigFilter() {
  const { company, members } = useCompany()
  const { isTeam } = useSubscription()

  const state = useSyncExternalStore(subscribe, getStableSnapshot, getStableSnapshot)

  useEffect(() => {
    ensureLoaded()
  }, [])

  const isSharedMode = isTeam && company?.gig_visibility === 'shared' && members.length > 1
  const shouldFilter = !!isSharedMode && state.showOnlyMine

  const toggle = useCallback(() => {
    toggleShowOnlyMine()
  }, [])

  return {
    showOnlyMine: state.showOnlyMine,
    isSharedMode: !!isSharedMode,
    shouldFilter,
    currentUserId: state.currentUserId,
    toggleShowOnlyMine: toggle,
    loaded: state.loaded,
  }
}
