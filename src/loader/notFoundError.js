import {HTTP_NOT_FOUND} from '../net/http'


/**
 * For network or file resources that are not found.
 *
 * Its own module, rather than in Loader.js where it started, so urls.js can
 * throw one without importing Loader (which imports urls). Loader.js
 * re-exports it, so existing imports keep working.
 *
 * `status` is 404 so `Containers/authLoadGate.js#isAuthShapedLoadError`
 * still sees an auth-shaped failure: GitHub answers 404, not 403, for a
 * private repository the request can't see, and CadView retries such a load
 * once sign-in settles.
 */
export class NotFoundError extends Error {
  /**
   * @param {string} message
   * @param {object} [opts]
   * @param {string} [opts.source] where the lookup failed: 'github', or
   *   undefined for a plain URL fetch
   * @param {boolean} [opts.isExpected] the user's own link or access, not a
   *   Share defect: counted in GA, not Sentry (AGENTS.md, Reported Conditions)
   */
  constructor(message, {source = undefined, isExpected = false} = {}) {
    super(message)
    this.name = 'NotFoundError'
    this.status = HTTP_NOT_FOUND
    this.source = source
    this.isExpected = isExpected
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, NotFoundError) // Captures stack trace, excluding constructor call
    }
  }
}


/**
 * What the dialog says for a GitHub file that isn't there, or isn't visible
 * to this request. A constant, and the GA `alert` message too: the route
 * names the repository and path, which may be private.
 */
export const GITHUB_NOT_FOUND_MESSAGE =
  'GitHub couldn\'t find this file. The link may be wrong, or the file may be in a private ' +
  'repository you don\'t have access to. Sign in with GitHub to open your private models.'

/**
 * Repository owners whose files Share links to itself (samples, test
 * models). A 404 there is a broken link of ours, so it still goes to Sentry.
 */
const SHARE_OWNED_GITHUB_ORGS = new Set(['bldrs-ai'])


/**
 * @param {string} owner the repository owner from the route
 * @return {boolean} whether a 404 there is the user's link, not ours
 */
export function isExpectedGitHubNotFound(owner) {
  return !SHARE_OWNED_GITHUB_ORGS.has(String(owner ?? '').toLowerCase())
}
