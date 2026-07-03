/**
 * Bridges a page-level action (button / FAB) to a lazily code-split tab.
 *
 * The tabs are dynamically imported (`ssr: false`), so on a slow connection a
 * user can tap "+ New invoice" / "Upload receipt" while the tab is still a
 * loading skeleton. A plain `dispatchEvent` is lost in that window — the click
 * silently does nothing. We buffer the intent so the tab can also claim it when
 * it mounts, while still dispatching the event for the already-mounted case.
 *
 * Only use `requestAction` for names that have a matching `claimAction` on mount,
 * otherwise the buffered entry lingers unclaimed.
 */
const pending = new Set<string>()

export function requestAction(name: string) {
  pending.add(name)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(name))
}

export function claimAction(name: string): boolean {
  if (pending.has(name)) {
    pending.delete(name)
    return true
  }
  return false
}
