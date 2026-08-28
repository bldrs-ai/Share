/**
 * The real-network hermeticity guard's decision, split out of `utils.ts` so
 * it can be unit-tested under Jest (`networkGuard.test.js`) — `utils.ts`
 * imports `@playwright/test`, which brings Playwright's own `expect` along
 * and breaks every `toEqual` in a suite that loads it (see `loadProbe.ts`).
 */

/**
 * Hosts whose traffic carries data the SPA reads or writes (model files,
 * GitHub API responses, auth tokens, AI completions). Reaching these from
 * a test is the leak we *must* fail on — it can paper over a broken mock
 * and produce non-hermetic results. Ad / analytics / tracking script
 * hosts (googletagmanager, google-analytics, googlesyndication,
 * doubleclick) are deliberately NOT in this list: MSW handles them, but
 * on the first page navigation a `<script>` tag for gtag or adsbygoogle
 * may fire before MSW's service worker takes control, and a hard abort
 * there only breaks page init without protecting any data.
 */
export const REAL_NETWORK_HOST_DENYLIST = [
  // Real GitHub
  'api.github.com',
  'raw.githubusercontent.com',
  'media.githubusercontent.com',
  'github.com',
  // The proxy this PR removed
  'rawgit.bldrs.dev',
  // Real auth + bldrs hosts that test setups suffix with .msw / .pw
  'bldrs.us.auth0.com',
  'git.bldrs.dev',
  // Real OpenRouter (AI completions)
  'openrouter.ai',
]


/**
 * Whether a request to `hostname` must be aborted as a real-network leak.
 *
 * `allowHosts` is the deliberate-request escape hatch, and it is deliberately
 * an exact host match rather than a suffix or a wildcard: the one caller that
 * needs it (the load-measurement harness, pointed at a hosted corpus model on
 * `raw.githubusercontent.com`) knows exactly which host it asked for, and a
 * looser match would turn "measure this one file" into "this suite may talk to
 * GitHub". Everything not named stays blocked, including sibling hosts of the
 * one that was allowed.
 *
 * @param hostname the request's hostname
 * @param allowHosts hosts the caller deliberately asked for, exact match
 * @return true when the request should be aborted
 */
export function isBlockedRealNetworkHost(hostname: string, allowHosts: string[] = []): boolean {
  const host = hostname.toLowerCase()
  if (allowHosts.some((allowed) => allowed.toLowerCase() === host)) {
    return false
  }
  return REAL_NETWORK_HOST_DENYLIST.includes(host)
}
