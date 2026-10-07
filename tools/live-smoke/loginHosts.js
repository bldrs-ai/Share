/**
 * Where the live smoke harness may type a test account's credentials: only
 * into a page served over https from an allow-listed Auth0 host, matched
 * exactly.
 *
 * `/popup-auth` on the target redirects to Auth0's Universal Login. Were the
 * target compromised, or not the deploy we meant, that redirect could land on
 * any page with a username and a password field, and the harness would type
 * the reusable `LIVE_SMOKE_ACCOUNTS` credentials into it (Codex on #1942).
 * So `liveSession.ts#loginWithPassword` checks the page against this list
 * before it types the email, again before the password (Universal Login can
 * be two screens), and once more inside the page in the same turn as each
 * value is set.
 *
 * Fail closed: with nothing configured, nothing is trusted.
 *
 * Design: design/new/live-browser-smoke.md §"Logging in".
 */
import {normalizeDomain} from './auth0Management.js'


const HOST_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/


/**
 * The hosts a login page may be served from: the tenant's domain
 * (`LIVE_SMOKE_AUTH0_DOMAIN`, the one the Management API also uses) and, when
 * the browser logs in through a custom domain instead, that domain
 * (`LIVE_SMOKE_AUTH0_LOGIN_HOST`).
 *
 * @param {object} env `process.env`, or a stand-in
 * @return {{hosts: Array<string>, problem: ?string, isUnset: boolean}} `hosts`
 *   is empty whenever `problem` is set; `isUnset` when neither variable is
 *   set — a reason to skip a login, where a malformed value is a reason to
 *   fail the run
 */
export function allowedLoginHosts(env) {
  const vars = /** @type {Record<string, string|undefined>} */ (env)
  const configured = ['LIVE_SMOKE_AUTH0_DOMAIN', 'LIVE_SMOKE_AUTH0_LOGIN_HOST']
    .map((name) => [name, (vars[name] || '').trim()])
    .filter(([, value]) => value !== '')
  if (configured.length === 0) {
    return {hosts: [], isUnset: true, problem: 'LIVE_SMOKE_AUTH0_DOMAIN (or LIVE_SMOKE_AUTH0_LOGIN_HOST) is not set, ' +
      'so no login page can be trusted with a password'}
  }
  const hosts = []
  for (const [name, value] of configured) {
    const host = normalizeDomain(value).toLowerCase()
    if (!HOST_NAME.test(host)) {
      return {hosts: [], isUnset: false, problem: `${name} is not a host name: ${value}`}
    }
    hosts.push(host)
  }
  return {hosts: [...new Set(hosts)], isUnset: false, problem: null}
}


/**
 * Why a page must not be given credentials, or null when it may.
 *
 * @param {string} href the page's URL
 * @param {Array<string>} hosts from {@link allowedLoginHosts}
 * @return {?string}
 */
export function loginPageProblem(href, hosts) {
  if (hosts.length === 0) {
    return 'there is no allowed Auth0 login host configured'
  }
  let url
  try {
    url = new URL(href)
  } catch {
    return `the login page is not a URL: ${href}`
  }
  if (url.protocol !== 'https:') {
    return `the login page ${url.origin} is not https`
  }
  if (url.port !== '') {
    return `the login page ${url.origin} is on a non-default port`
  }
  if (!hosts.includes(url.hostname.toLowerCase())) {
    return `the login page's host ${url.hostname} is not an allowed Auth0 login host (${hosts.join(', ')})`
  }
  return null
}
