#!/usr/bin/env node
/*
 * Smoke-test the Netlify Functions of a live deploy.
 *
 *   node tools/netlify/smokeFunctions.mjs <baseUrl> [--strict] [--json]
 *
 * Sends each function one request WITHOUT credentials and checks it answers
 * the way the code says it should — 401 for a missing bearer token, 400 for
 * a missing Stripe signature, and so on. Those answers need no secrets and
 * touch no upstream, so they're safe against production, yet they only come
 * back if the function's bundle loaded, its handler ran, and its
 * dependencies resolved. A function that can't start answers 502, which is
 * what six of them did for months without anyone noticing (bldrs-ai/ops#33).
 *
 * Two expectations per probe:
 *  - `accept`: any context. A deploy preview may lack some secrets, and a
 *    function answering "not configured" (500), or serving the unconfigured
 *    dev bypass, still proves it runs.
 *  - `strict`: production, where every secret is set. Catches a context
 *    whose env is missing a variable (e.g. gh-oauth-exchange answering 500
 *    because AUTH0_DOMAIN vanished) — a different outage than ops#33, same
 *    silence. Use `--strict` against https://bldrs.ai.
 *
 * Every probe here mirrors a replay scenario (named in `scenario`) that pins
 * the same request's answer against the source and the deployed bundle;
 * tools/netlify/smokeFunctions.test.js fails if the two drift apart, so a
 * change to a function's unauthenticated answer can't silently break this.
 *
 * Deliberately dependency-free (Node built-ins and global fetch only): the
 * functions-smoke workflow runs it from a sparse checkout with no
 * `yarn install`. Run by .github/workflows/functions-smoke.yml on every
 * Netlify deploy-preview status and hourly against production.
 */


const HTTP_OK = 200
const HTTP_BAD_REQUEST = 400
const HTTP_UNAUTHORIZED = 401
const HTTP_NOT_FOUND = 404
const HTTP_INTERNAL_ERROR = 500
const HTTP_BAD_GATEWAY = 502
const HTTP_SERVICE_UNAVAILABLE = 503
const HTTP_GATEWAY_TIMEOUT = 504
// Hard failures regardless of mode: the platform answering for a function
// that couldn't answer for itself. 502 from Netlify is an uncaught error or
// a bundle that failed to load (`Runtime.ImportModuleError`); 503/504 are
// timeouts and platform errors.
const CRASH_STATUSES = new Set([HTTP_BAD_GATEWAY, HTTP_SERVICE_UNAVAILABLE, HTTP_GATEWAY_TIMEOUT])
const CRASH_BODY_PATTERN = /Runtime\.\w+Error|"errorType"|errorMessage/
const REQUEST_TIMEOUT_MS = 20000
const EXCERPT_CHARS = 160
// One retry, after a pause, for a crash status or a network error: a single
// cold-start hiccup on the platform shouldn't page anyone, a function that
// can't load fails twice.
const RETRY_DELAY_MS = 5000

// Each answer a probe accepts is a status AND something only the function's
// own handler says — a phrase from its body, or (for pro-module's served
// JavaScript) its content type. A bare status isn't enough: the platform
// answers some statuses for itself, e.g. 404 for a function missing from
// the deploy altogether, which would otherwise pass as pro-module's
// `module_not_built`. smokeFunctions.test.js rejects a status-only answer.
const MISSING_BEARER = {status: HTTP_UNAUTHORIZED, body: 'Missing or invalid Authorization header'}
const MISSING_AUTH0_TOKEN = {status: HTTP_UNAUTHORIZED, body: 'missing_auth0_token'}
const GH_OAUTH_NOT_CONFIGURED = {status: HTTP_INTERNAL_ERROR, body: 'GH_OAUTH_CLIENT_ID/SECRET not configured'}

export const PROBES = [
  {
    name: 'create-portal-session',
    scenario: 'create-portal-session/unauthenticated',
    method: 'POST',
    body: {},
    accept: [MISSING_BEARER],
    strict: [MISSING_BEARER],
  },
  {
    name: 'gh-oauth-exchange',
    scenario: 'gh-oauth-exchange/unauthenticated',
    method: 'POST',
    body: {},
    // Without AUTH0_DOMAIN the auth gate is bypassed (dev), and then a
    // missing GH client secret answers 500, or the missing code 400.
    accept: [
      MISSING_AUTH0_TOKEN,
      GH_OAUTH_NOT_CONFIGURED,
      {status: HTTP_BAD_REQUEST, body: 'code and redirect_uri are required'},
    ],
    strict: [MISSING_AUTH0_TOKEN],
  },
  {
    name: 'gh-oauth-refresh',
    scenario: 'gh-oauth-refresh/unauthenticated',
    method: 'POST',
    body: {},
    accept: [
      MISSING_AUTH0_TOKEN,
      GH_OAUTH_NOT_CONFIGURED,
      {status: HTTP_BAD_REQUEST, body: 'refresh_token is required'},
    ],
    strict: [MISSING_AUTH0_TOKEN],
  },
  {
    name: 'pro-module',
    scenario: 'pro-module/unauthenticated',
    method: 'GET',
    query: {name: 'glbExport'},
    // Unconfigured dev bypass serves the module, or reports it unbuilt.
    accept: [
      MISSING_AUTH0_TOKEN,
      {status: HTTP_OK, contentType: 'text/javascript'},
      {status: HTTP_NOT_FOUND, body: 'module_not_built'},
    ],
    strict: [MISSING_AUTH0_TOKEN],
  },
  {
    name: 'proxy-handler',
    scenario: 'proxy-handler/missing-id',
    method: 'GET',
    accept: [{status: HTTP_BAD_REQUEST, body: 'Missing file ID'}],
    strict: [{status: HTTP_BAD_REQUEST, body: 'Missing file ID'}],
  },
  {
    name: 'record-export',
    scenario: 'record-export/unauthenticated',
    method: 'POST',
    body: {key: '/share/v/p/index.ifc', format: 'glb', bytes: 1},
    // Unconfigured dev bypass answers an empty history.
    accept: [MISSING_AUTH0_TOKEN, {status: HTTP_OK, body: '"exports"'}],
    strict: [MISSING_AUTH0_TOKEN],
  },
  {
    name: 'record-load',
    scenario: 'record-load/unauthenticated',
    method: 'POST',
    body: {key: '/share/v/p/index.ifc'},
    accept: [MISSING_BEARER],
    strict: [MISSING_BEARER],
  },
  {
    name: 'stripe-webhook',
    scenario: 'stripe-webhook/missing-signature',
    method: 'POST',
    body: {},
    // "Webhook Error" is in the missing-signature answer both before and
    // after ops#33's rewrite, so the probe holds across that deploy. 500 is
    // a preview context without Stripe secrets.
    accept: [
      {status: HTTP_BAD_REQUEST, body: 'Webhook Error'},
      {status: HTTP_INTERNAL_ERROR, body: 'Stripe webhook not configured'},
    ],
    strict: [{status: HTTP_BAD_REQUEST, body: 'Webhook Error'}],
  },
  {
    name: 'unlink-identity',
    scenario: 'unlink-identity/unauthenticated',
    method: 'POST',
    body: {secondaryProvider: 'github', secondaryUserId: '17447690'},
    accept: [MISSING_BEARER],
    strict: [MISSING_BEARER],
  },
]


/**
 * @param {string} baseUrl e.g. https://bldrs.ai
 * @param {object} [options]
 * @param {boolean} [options.strict]
 * @param {Function} [options.fetchImpl] for tests
 * @param {number} [options.retryDelayMs]
 * @return {Promise<Array<{name: string, ok: boolean, status: ?number, ms: number, detail: string}>>}
 */
export function smokeFunctions(baseUrl, {strict = false, fetchImpl = fetch, retryDelayMs = RETRY_DELAY_MS} = {}) {
  const base = new URL(baseUrl)
  return Promise.all(PROBES.map(async (probe) => {
    let result = await runProbe(base, probe, strict, fetchImpl)
    if (result.retryable) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      result = await runProbe(base, probe, strict, fetchImpl)
    }
    delete result.retryable
    return result
  }))
}


/**
 * @param {URL} base
 * @param {object} probe
 * @param {boolean} strict
 * @param {Function} fetchImpl
 * @return {Promise<object>}
 */
async function runProbe(base, probe, strict, fetchImpl) {
  const url = new URL(`/.netlify/functions/${probe.name}`, base)
  for (const [key, value] of Object.entries(probe.query || {})) {
    url.searchParams.set(key, value)
  }
  const started = Date.now()
  let res
  let body
  try {
    res = await fetchImpl(url, {
      method: probe.method,
      headers: probe.body === undefined ? {} : {'content-type': 'application/json'},
      body: probe.body === undefined ? undefined : JSON.stringify(probe.body),
      redirect: 'manual',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    body = await res.text()
  } catch (err) {
    return {name: probe.name, ok: false, retryable: true, status: null, ms: Date.now() - started,
      detail: `request failed: ${err.message}`}
  }
  const ms = Date.now() - started
  const expected = strict ? probe.strict : probe.accept
  const excerpt = body.replace(/\s+/g, ' ').slice(0, EXCERPT_CHARS)
  if (CRASH_STATUSES.has(res.status) || CRASH_BODY_PATTERN.test(body)) {
    return {name: probe.name, ok: false, retryable: true, status: res.status, ms,
      detail: `function did not run (platform error): ${excerpt}`}
  }
  const contentType = res.headers.get('content-type') || ''
  const matched = expected.some((want) => want.status === res.status &&
    (want.body === undefined || body.includes(want.body)) &&
    (want.contentType === undefined || contentType.includes(want.contentType)))
  if (!matched) {
    return {name: probe.name, ok: false, retryable: false, status: res.status, ms,
      detail: `expected ${expected.map(describeAnswer).join(' or ')}${strict ? ' (strict)' : ''}, got: ${excerpt}`}
  }
  return {name: probe.name, ok: true, retryable: false, status: res.status, ms, detail: ''}
}


/**
 * @param {object} answer a PROBES `accept` / `strict` entry
 * @return {string} e.g. `401 "missing_auth0_token"`
 */
function describeAnswer(answer) {
  return `${answer.status} ${answer.body === undefined ? answer.contentType : JSON.stringify(answer.body)}`
}


/**
 * @param {Array<object>} results
 * @param {string} baseUrl
 * @param {boolean} strict
 * @return {string} a Markdown table, for the terminal and a GitHub step summary
 */
export function formatResults(results, baseUrl, strict) {
  const failed = results.filter((r) => !r.ok).length
  const lines = [
    `### Netlify functions smoke: ${baseUrl}${strict ? ' (strict)' : ''} — ` +
      `${failed === 0 ? 'all passed' : `${failed} of ${results.length} FAILED`}`,
    '',
    '| function | status | ms | result |',
    '|---|---|---|---|',
    ...results.map((r) => `| ${r.name} | ${r.status ?? '—'} | ${r.ms} | ${r.ok ? 'ok' : `**FAIL** ${r.detail.replace(/\|/g, '\\|')}`} |`),
  ]
  return lines.join('\n')
}


const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isMain) {
  const args = process.argv.slice(2)
  const baseUrl = args.find((arg) => !arg.startsWith('--'))
  const strict = args.includes('--strict')
  if (!baseUrl) {
    console.error('usage: smokeFunctions.mjs <baseUrl> [--strict] [--json]')
    process.exit(2)
  }
  const results = await smokeFunctions(baseUrl, {strict})
  const report = args.includes('--json') ? JSON.stringify(results, null, 2) : formatResults(results, baseUrl, strict)
  process.stdout.write(`${report}\n`)
  if (process.env.GITHUB_STEP_SUMMARY && !args.includes('--json')) {
    const {appendFileSync} = await import('node:fs')
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`)
  }
  process.exit(results.every((r) => r.ok) ? 0 : 1)
}
