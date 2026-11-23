/*
 * Which browser origins may call the hosted assistant relay (`ai-chat.js`).
 *
 * The threat: a third-party page POSTs to /.netlify/functions/ai-chat from
 * its visitors' browsers. Each visitor mints their own anonymous token and
 * has their own IP bucket, so the per-identity and per-IP budgets never
 * bind, while the global breakers drain on Bldrs' account. A browser always
 * sends `Origin` on a cross-site POST and a page cannot forge it, so
 * refusing a foreign `Origin` stops that.
 *
 * What it does NOT cover: a non-browser client (curl, a script, a server)
 * sets any `Origin` it likes. That is accepted: it is bounded by the
 * per-IP budgets and the breakers, which is all it ever was. Minting
 * tokens behind a challenge (Turnstile) is the separate, larger fix.
 *
 * The allowlist is read at request time, never at module scope: Netlify's
 * URL variables belong to the deploy, and the replay harness builds the
 * bundle once and varies env per scenario (design/new/netlify-functions-testing.md).
 * Dependency-free plain Node ESM, like the rest of `_lib/ai*`.
 */

/** Every host that serves the app in production. `www.` is not one: nothing serves it. */
const PRODUCTION_ORIGINS = ['https://bldrs.ai']

/**
 * The site's primary URL and this deploy's own, when the Functions runtime
 * has them. They are not to be relied on: on deploy-preview-2257 the smoke
 * probe sent the preview's own Origin and was refused, so they evidently
 * are not set at function runtime there. The request's own origin
 * (`isAllowedOrigin`) is what admits a preview; these stay for any runtime
 * that does set them.
 */
const DEPLOY_URL_VARS = ['URL', 'DEPLOY_PRIME_URL', 'DEPLOY_URL']

const LOCAL_HOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/


/**
 * @param {string|undefined} value a URL or origin
 * @return {?string} its origin, lowercased by the URL parser, or null when not an http(s) URL
 */
function originOf(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null
  }
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : null
  } catch {
    return null
  }
}


/**
 * Under `netlify dev` the function runs next to a dev server on localhost,
 * and no Netlify URL variable names it.
 *
 * @param {object} env
 * @return {boolean}
 */
function isLocalDev(env) {
  return env.CONTEXT === 'dev' || env.NETLIFY_DEV === 'true'
}


/**
 * @param {object} env process.env, or a scenario's
 * @return {Set<string>} exact origins; localhost is matched by pattern, not listed
 */
export function allowedOrigins(env) {
  const origins = new Set(PRODUCTION_ORIGINS)
  for (const name of DEPLOY_URL_VARS) {
    const origin = originOf(env[name])
    if (origin) {
      origins.add(origin)
    }
  }
  // Exact origins only. A malformed entry is dropped, never widened.
  for (const entry of String(env.AI_ALLOWED_ORIGINS ?? '').split(',')) {
    const origin = originOf(entry)
    if (origin) {
      origins.add(origin)
    }
  }
  return origins
}


/**
 * @param {Request} req
 * @param {object} env process.env, or a scenario's
 * @return {boolean} whether this browser request may spend the relay's budget
 */
export function isAllowedOrigin(req, env) {
  const origin = req.headers.get('origin')
  if (origin === null) {
    // Some same-origin fetch paths omit `Origin`; the browser vouches for
    // those with Sec-Fetch-Site. Anything else without an Origin is refused.
    return req.headers.get('sec-fetch-site') === 'same-origin'
  }
  // Compared as sent: the browser's serialization is canonical, and `null`
  // (sandboxed iframes, file:, redirects) is deliberately not in the set.
  return origin === ownOrigin(req) ||
    allowedOrigins(env).has(origin) ||
    (isLocalDev(env) && LOCAL_HOST_PATTERN.test(origin))
}


/**
 * The origin this request was sent to. A page on that same origin is the
 * app itself, on whichever deploy serves it: production, a deploy preview
 * or a branch deploy, with no variable naming it. It is safe to trust: a
 * browser sets the request's host from the URL it fetched, so a foreign
 * page posting here still arrives with this host and its own `Origin`,
 * which differ. A non-browser client can set both, as it can any `Origin`.
 *
 * @param {Request} req
 * @return {?string}
 */
function ownOrigin(req) {
  return originOf(req.url)
}


/**
 * @param {Request} req
 * @return {string} the origin's host for the refusal log line; never the path, IP or token
 */
export function originHostForLog(req) {
  const origin = req.headers.get('origin')
  try {
    return origin ? new URL(origin).host : '(none)'
  } catch {
    return '(unparseable)'
  }
}
