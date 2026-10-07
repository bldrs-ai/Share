/**
 * What a live smoke run is pointed at and who it may log in as, decided from
 * the environment — and, when something is missing, the sentence the spec
 * skips with. Design: design/new/live-browser-smoke.md §"Skip, don't fail".
 *
 * Free of any Playwright import so `liveEnv.test.js` can run it under Jest
 * (src/tests/e2e/README.md: importing `@playwright/test` into a module a Jest
 * suite loads breaks that suite's `expect`).
 */
import {LIVE_PROJECTS, accountFor, parseLiveAccounts} from '../../../../tools/live-smoke/accounts.js'
import {adminConfigFromEnv, createAuth0Admin} from '../../../../tools/live-smoke/auth0Management.js'


export {LIVE_PROJECTS, accountFor, parseLiveAccounts}

export type LiveAdmin = ReturnType<typeof createAuth0Admin>

/** The JWT claim Share's Auth0 Action puts `app_metadata` under (src/Auth0/appMetadata.js). */
export const APP_METADATA_CLAIM = 'https://bldrs.ai/app_metadata'

export type LiveTarget = {
  /** Origin only, no trailing slash: `https://deploy-preview-1939--bldrs-share-prod.netlify.app` */
  baseUrl: string
  hostname: string
  /**
   * Whether the target has Netlify Functions behind it. A local
   * `test-flows-build-and-serve` is http-server plus MSW: a request from
   * Node to `/.netlify/functions/*` gets http-server's 404, which on a real
   * deploy would be a function missing from the bundle. So a probe that
   * needs the functions is not applicable locally, rather than failed.
   */
  servesFunctions: boolean
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1']


/**
 * Read `LIVE_BASE_URL`.
 *
 * Unset is a skip — every spec reports it — but SET and wrong is a problem:
 * a typo would otherwise turn a whole run into skips that read like "no
 * secrets", which nobody investigates.
 *
 * @param raw the variable's value
 * @return exactly one of `target`, `skip`, `problem` is non-null
 */
export function liveTargetFrom(raw: string | undefined): {
  target: LiveTarget | null, skip: string | null, problem: string | null,
} {
  if (raw === undefined || raw.trim() === '') {
    return {target: null, skip: 'LIVE_BASE_URL is not set', problem: null}
  }
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return {target: null, skip: null, problem: `LIVE_BASE_URL is not a URL: ${raw}`}
  }
  const isLocal = LOCAL_HOSTS.includes(url.hostname)
  if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) {
    return {target: null, skip: null, problem: `LIVE_BASE_URL must be https (or http on localhost): ${raw}`}
  }
  // The specs navigate by absolute path (`/share/v/p/index.ifc`), which
  // would silently drop a path prefix rather than honour it.
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    return {target: null, skip: null, problem: `LIVE_BASE_URL must be an origin with no path: ${raw}`}
  }
  return {
    target: {baseUrl: url.origin, hostname: url.hostname, servesFunctions: !isLocal},
    skip: null,
    problem: null,
  }
}


/**
 * Which free-tier behaviour a deploy has, from an UNAUTHENTICATED `GET` of
 * `record-export`. No account and no secret needed, so it is the same probe
 * on every target.
 *
 * - `present` — #1939's allowance (2 free exports per rolling 7 days): the
 *   function answers GET with the caller's allowance, so with no token it
 *   refuses at the auth check, 401.
 * - `absent` — main before #1939: the function takes POST only and answers
 *   GET with 405 before it ever looks for a token, and a free user is gated
 *   straight to `/subscribe/`.
 *
 * Anything else — a 404 from a target with no functions, a 5xx — is
 * `unknown`, and the free-tier specs report it rather than guess.
 *
 * @param status the probe's HTTP status
 * @return which behaviour the deploy has
 */
export function freeTierFromProbe(status: number): 'present' | 'absent' | 'unknown' {
  const HTTP_UNAUTHORIZED = 401
  const HTTP_METHOD_NOT_ALLOWED = 405
  if (status === HTTP_UNAUTHORIZED) {
    return 'present'
  }
  if (status === HTTP_METHOD_NOT_ALLOWED) {
    return 'absent'
  }
  return 'unknown'
}


/**
 * The harness's Auth0 Management API client, for the specs that read a
 * ledger or move the pending account. Unset is a skip; HALF set is a
 * problem, since it can only be a mistake.
 *
 * @param env `process.env`
 * @return exactly one of `admin`, `skip`, `problem` is non-null
 */
export function liveAdminFrom(env: Record<string, string | undefined>): {
  admin: LiveAdmin | null, skip: string | null, problem: string | null,
} {
  const {config, problem, isUnset} = adminConfigFromEnv(env)
  if (config === null) {
    return isUnset ?
      {admin: null, skip: problem, problem: null} :
      {admin: null, skip: null, problem}
  }
  return {admin: createAuth0Admin(config), skip: null, problem: null}
}


/**
 * The payload of a JWT, unverified — the spec only reads what tier its own
 * session's token claims, to know which UI to expect.
 *
 * @param token a JWT
 * @return its decoded payload
 */
export function jwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.')
  const JWT_PARTS = 3
  if (parts.length !== JWT_PARTS) {
    throw new Error('not a JWT')
  }
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf8'))
}


/**
 * @param token the session's access token
 * @return the `subscriptionStatus` its app_metadata claim carries, or null
 */
export function claimedSubscriptionStatus(token: string): string | null {
  const claim = jwtPayload(token)[APP_METADATA_CLAIM] as {subscriptionStatus?: unknown} | undefined
  return typeof claim?.subscriptionStatus === 'string' ? claim.subscriptionStatus : null
}
