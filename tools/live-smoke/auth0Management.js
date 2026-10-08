/**
 * A small Auth0 Management API client for the live smoke harness: the reset
 * script (`resetAccounts.mjs`) and the specs that read or set a test
 * account's `app_metadata` (`src/tests/e2e/live/liveEnv.ts`).
 *
 * Deliberately not `netlify/functions/_lib/auth0.js`. That module reads the
 * DEPLOY's credentials from `process.env` (`AUTH0_DOMAIN`,
 * `AUTH0_MGMT_CLIENT_*`) and reports to Sentry; the harness runs in CI with
 * its own machine-to-machine application, scoped to `read:users` and
 * `update:users_app_metadata` and nothing else, and reports to the run log.
 * Design: design/new/live-browser-smoke.md §"Secrets".
 *
 * Nothing is built at module scope (design/new/netlify-functions-testing.md
 * §"Adding a function" has the history of why that rule exists): the token
 * is fetched by the first call that needs it, and `fetch` is injectable.
 *
 * Errors name the step and the HTTP status, never the email being looked up
 * or a credential: a secret is masked in a GitHub log only where its WHOLE
 * value appears, and the account emails come out of one JSON secret.
 */


/** The connection the harness logs in through (`/popup-auth?connection=…`). */
export const DATABASE_CONNECTION = 'Username-Password-Authentication'

const HTTP_TOO_MANY_REQUESTS = 429
const HTTP_SERVER_ERROR_MIN = 500
const MS_PER_SECOND = 1000
// Auth0's Management API allows a couple of requests per second on smaller
// tenants, and five browser projects plus the reset share one client. A
// limited request waits as long as Auth0 says (`retry-after`, seconds), or
// this long when it says nothing, and tries again a few times.
const DEFAULT_RETRY_AFTER_MS = 1000
const DEFAULT_MAX_RETRIES = 3


/**
 * @typedef {{domain: string, clientId: string, clientSecret: string}} AdminConfig
 * @typedef {{user_id: string, email?: string, identities?: Array<{connection: string}>,
 *   app_metadata?: {[key: string]: *}}} Auth0User
 * @typedef {{
 *   findUserByEmail: function(string, string): Promise<Auth0User>,
 *   getUser: function(string): Promise<Auth0User>,
 *   patchAppMetadata: function(string, {[key: string]: *}): Promise<Auth0User>
 * }} Auth0Admin
 */


/** A Management API failure whose message is safe to print. */
export class Auth0AdminError extends Error {
  /**
   * @param {string} message
   * @param {?number} status
   */
  constructor(message, status) {
    super(message)
    this.name = 'Auth0AdminError'
    this.status = status
  }
}


/**
 * The harness's Management API credentials, from the environment.
 *
 * @param {object} env `process.env`, or a stand-in
 * @return {{config: ?AdminConfig, problem: ?string, isUnset: boolean}} `isUnset` when
 *   none of the three is set, which a CI run without secrets is allowed to be;
 *   a partial set is a misconfiguration and never a skip
 */
export function adminConfigFromEnv(env) {
  const vars = /** @type {Record<string, string|undefined>} */ (env)
  const names = ['LIVE_SMOKE_AUTH0_DOMAIN', 'LIVE_SMOKE_AUTH0_CLIENT_ID', 'LIVE_SMOKE_AUTH0_CLIENT_SECRET']
  const missing = names.filter((name) => !vars[name] || String(vars[name]).trim() === '')
  if (missing.length === names.length) {
    return {config: null, problem: `${names.join(', ')} are not set`, isUnset: true}
  }
  if (missing.length > 0) {
    return {config: null, problem: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not set`, isUnset: false}
  }
  return {
    config: {
      domain: normalizeDomain(String(vars.LIVE_SMOKE_AUTH0_DOMAIN)),
      clientId: String(vars.LIVE_SMOKE_AUTH0_CLIENT_ID),
      clientSecret: String(vars.LIVE_SMOKE_AUTH0_CLIENT_SECRET),
    },
    problem: null,
    isUnset: false,
  }
}


/**
 * @param {string} domain `tenant.us.auth0.com`, with or without scheme and slash
 * @return {string} the bare host
 */
export function normalizeDomain(domain) {
  return domain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '')
}


/**
 * @param {AdminConfig} config
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] for tests; global `fetch` otherwise
 * @param {function(number): Promise<void>} [options.sleep] for tests
 * @param {number} [options.maxRetries] retries after a 429 or 5xx
 * @return {Auth0Admin}
 */
export function createAuth0Admin(config, {fetchImpl, sleep, maxRetries = DEFAULT_MAX_RETRIES} = {}) {
  const doFetch = fetchImpl || globalThis.fetch
  const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const base = `https://${normalizeDomain(config.domain)}`
  /** @type {?Promise<string>} */
  let tokenPromise = null

  /** @return {Promise<string>} the Management API token, fetched on first use */
  const token = () => {
    if (tokenPromise === null) {
      const pending = request('POST', '/oauth/token', 'token', {
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        audience: `${base}/api/v2/`,
      }, null).then((body) => {
        if (!body || typeof body.access_token !== 'string') {
          throw new Auth0AdminError('Auth0 token endpoint answered without an access_token', null)
        }
        return /** @type {string} */ (body.access_token)
      })
      // A failed token request must not poison every later call.
      pending.catch(() => {
        tokenPromise = null
      })
      tokenPromise = pending
    }
    return tokenPromise
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {string} step what to call this request in an error
   * @param {?object} body JSON body
   * @param {?string} bearer
   * @return {Promise<*>} the parsed JSON answer
   */
  async function request(method, path, step, body, bearer) {
    /** @type {{[name: string]: string}} */
    const headers = {'Content-Type': 'application/json'}
    if (bearer) {
      headers.Authorization = `Bearer ${bearer}`
    }
    for (let attempt = 1; ; attempt++) {
      let response
      try {
        response = await doFetch(`${base}${path}`, {
          method,
          headers,
          body: body === null ? undefined : JSON.stringify(body),
        })
      } catch (err) {
        throw new Auth0AdminError(`Auth0 Management API ${method} ${step} failed to connect: ${describe(err)}`, null)
      }
      const isRetryable = response.status === HTTP_TOO_MANY_REQUESTS || response.status >= HTTP_SERVER_ERROR_MIN
      if (isRetryable && attempt <= maxRetries) {
        await wait(retryAfterMs(response.headers.get('retry-after')))
        continue
      }
      if (!response.ok) {
        const tries = attempt > 1 ? ` after ${attempt} attempts` : ''
        throw new Auth0AdminError(
          `Auth0 Management API ${method} ${step} answered ${response.status}${tries}${await errorCode(response)}`,
          response.status)
      }
      return await response.json()
    }
  }

  return {
    /**
     * The one Database-connection user with this email. A social identity
     * with the same address (a GitHub login, say) is someone else's account
     * as far as the harness is concerned, and is ignored.
     *
     * @param {string} email
     * @param {string} role for the error message, which must not carry the email
     * @return {Promise<Auth0User>}
     */
    async findUserByEmail(email, role) {
      const users = /** @type {Array<Auth0User>} */ (await request(
        'GET', `/api/v2/users-by-email?email=${encodeURIComponent(email)}`,
        'users-by-email', null, await token()))
      const database = (Array.isArray(users) ? users : []).filter((user) =>
        (user.identities || []).some((identity) => identity.connection === DATABASE_CONNECTION))
      if (database.length === 0) {
        throw new Auth0AdminError(`${role}: no ${DATABASE_CONNECTION} user has that email`, null)
      }
      if (database.length > 1) {
        throw new Auth0AdminError(`${role}: ${database.length} ${DATABASE_CONNECTION} users have that email`, null)
      }
      return database[0]
    },

    /**
     * Read from Auth0's primary store, not the search index, which lags it.
     *
     * @param {string} userId
     * @return {Promise<Auth0User>}
     */
    async getUser(userId) {
      return await request('GET', `/api/v2/users/${encodeURIComponent(userId)}`, 'users/{id}', null, await token())
    },

    /**
     * Merge `patch` into `app_metadata`. Auth0 merges at the top level, so a
     * key not named here is left as it is — and an array named here is
     * replaced whole, which is how `{exports: []}` clears a ledger.
     *
     * @param {string} userId
     * @param {object} patch
     * @return {Promise<Auth0User>}
     */
    async patchAppMetadata(userId, patch) {
      return await request('PATCH', `/api/v2/users/${encodeURIComponent(userId)}`, 'users/{id}',
        {app_metadata: patch}, await token())
    },
  }
}


/**
 * @param {?string} header `retry-after`, in seconds
 * @return {number} milliseconds to wait
 */
function retryAfterMs(header) {
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * MS_PER_SECOND : DEFAULT_RETRY_AFTER_MS
}


/**
 * Auth0's own error code, when the body has one (`invalid_client`,
 * `insufficient_scope`, …). The `message` is left out: some echo the
 * request back.
 *
 * @param {Response} response
 * @return {Promise<string>} ' (code)' or ''
 */
async function errorCode(response) {
  try {
    const body = await response.json()
    const code = body && (body.errorCode || body.error)
    return typeof code === 'string' ? ` (${code})` : ''
  } catch {
    return ''
  }
}


/**
 * @param {*} err
 * @return {string}
 */
function describe(err) {
  return err && typeof err.message === 'string' ? err.message : String(err)
}
