// The apps a user pinned to the workspace Apps bar (#1993), by appName.
// Browser storage only — a per-viewer convenience, like the workspace
// UI state — so it survives reloads but not a cleared browser.
const PINNED_APPS_KEY = 'bldrs:apps-pinned'


/** @return {Array<string>} Pinned app names; empty when absent or unreadable */
export function loadPinnedAppNames() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PINNED_APPS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : []
  } catch {
    return []
  }
}


/** @param {Array<string>} names Pinned app names to persist */
export function savePinnedAppNames(names) {
  try {
    localStorage.setItem(PINNED_APPS_KEY, JSON.stringify(names))
  } catch {
    // localStorage may be full or unavailable
  }
}
