/*
 * sessionStorage access is denied in some browser environments —
 * third-party iframes with cookies blocked, Brave with strict
 * shields, locked-down Android WebViews, some private/incognito
 * modes. Auth0's SPA SDK reads sessionStorage during construction
 * (for pending OAuth transactions) and throws SecurityError
 * unhandled when access is denied — SHARE-N7 was 666 users / 3,339
 * events of this exact failure mode, predominantly Chrome Mobile
 * on Android (95%). The whole app crashed during React mount,
 * because the Auth0Provider is high in the tree.
 *
 * Probe once at module load by attempting both a read AND a probe
 * write. Read alone isn't enough — some browsers (older iOS Safari
 * private mode) expose sessionStorage as defined but throw on
 * setItem. Cached so subsequent calls are free.
 *
 * Consumers: Auth0ProviderProxy + Auth0Proxy route to an inert
 * mock context when storage is unavailable, so the viewer still
 * loads. Auth features become non-functional (login buttons no-op
 * with a console warning) but the app doesn't crash.
 */
/**
 * Test sessionStorage by attempting both a read and a probe write,
 * returning whether both succeeded. Used at module load to populate
 * `STORAGE_AVAILABLE`, and exported via `isSessionStorageAvailableNow`
 * for unit tests that swap `window.sessionStorage` per-case.
 *
 * @return {boolean}
 */
function probeSessionStorageAccess() {
  try {
    const store = window.sessionStorage
    if (!store) {
      return false
    }
    const probeKey = '__bldrs_storage_probe__'
    store.setItem(probeKey, '1')
    store.removeItem(probeKey)
    return true
  } catch {
    return false
  }
}


export const STORAGE_AVAILABLE = probeSessionStorageAccess()


/**
 * Re-probe sessionStorage availability. Exported for unit tests
 * that mock `window.sessionStorage` per-case — the module-level
 * `STORAGE_AVAILABLE` constant is set at first import and won't
 * pick up later mocks.
 *
 * @return {boolean}
 */
export function isSessionStorageAvailableNow() {
  return probeSessionStorageAccess()
}
