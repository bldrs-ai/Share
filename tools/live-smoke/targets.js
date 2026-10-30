/**
 * Which deploys the live smoke harness may be pointed at.
 *
 * A run logs real test accounts in and holds the Auth0 Management API
 * credentials, so the target is an allow-list, not "any https origin": a
 * `workflow_dispatch` given an attacker's origin would otherwise hand the
 * browser — and through it the login form — to that origin (Codex on #1942).
 * The login page itself is gated separately (`loginHosts.js`); this is the
 * outer layer, checked by `live-smoke.yml` before any step that sees a
 * secret, and by the specs (`src/tests/e2e/live/liveEnv.ts`) before they
 * navigate.
 *
 * Design: design/new/live-browser-smoke.md §"Target and browsers".
 */


/**
 * The Netlify projects whose deploy previews may be smoked. Both post a
 * `netlify/<project>/deploy-preview` status (functions-smoke.yml).
 */
export const LIVE_NETLIFY_PROJECTS = ['bldrs-share-prod', 'bldrs-share-dev']

/** Production origins that may be smoked. */
export const LIVE_PRODUCTION_ORIGINS = ['https://bldrs.ai']

const LOCAL_HOSTS = ['localhost', '127.0.0.1']
const DEPLOY_PREVIEW = new RegExp(
  `^https://deploy-preview-[0-9]+--(${LIVE_NETLIFY_PROJECTS.join('|')})\\.netlify\\.app$`)


/**
 * Check a `LIVE_BASE_URL` against the allow-list.
 *
 * Allowed: an `https` deploy preview of a project in
 * {@link LIVE_NETLIFY_PROJECTS}, an origin in {@link LIVE_PRODUCTION_ORIGINS},
 * and — outside CI only — `localhost` / `127.0.0.1`, for a local build.
 * Always an origin: no path, query, fragment, credentials or (for remote
 * hosts) port.
 *
 * @param {string} raw the URL as given
 * @param {object} options
 * @param {boolean} options.isCI whether this is a CI run (`CI=true`)
 * @return {{origin: ?string, isLocal: boolean, problem: ?string}} `origin`
 *   without a trailing slash when allowed; otherwise `problem` says why
 */
export function checkLiveTarget(raw, {isCI}) {
  let url
  try {
    url = new URL(String(raw).trim())
  } catch {
    return refuse(`LIVE_BASE_URL is not a URL: ${raw}`)
  }
  if (url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return refuse(`LIVE_BASE_URL must be an origin, with no credentials, path, query or fragment: ${raw}`)
  }
  if (LOCAL_HOSTS.includes(url.hostname)) {
    if (isCI) {
      return refuse(`LIVE_BASE_URL ${url.origin} is local, which is not allowed in CI`)
    }
    return {origin: url.origin, isLocal: true, problem: null}
  }
  const isAllowed = url.protocol === 'https:' && url.port === '' &&
    (DEPLOY_PREVIEW.test(url.origin) || LIVE_PRODUCTION_ORIGINS.includes(url.origin))
  if (!isAllowed) {
    return refuse(`LIVE_BASE_URL ${url.origin} is not an allowed live smoke target: a deploy preview of ` +
      `${LIVE_NETLIFY_PROJECTS.join(' or ')}, or ${LIVE_PRODUCTION_ORIGINS.join(', ')} ` +
      '(tools/live-smoke/targets.js)')
  }
  return {origin: url.origin, isLocal: false, problem: null}
}


/**
 * @param {string} problem
 * @return {{origin: null, isLocal: boolean, problem: string}}
 */
function refuse(problem) {
  return {origin: null, isLocal: false, problem}
}
