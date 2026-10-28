import {http, passthrough} from 'msw'
import {
  HTTP_AUTHORIZATION_REQUIRED,
  HTTP_BAD_REQUEST,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_NOT_FOUND,
  HTTP_OK,
} from '../net/http'
import {
  EXPORT_SLOT_MISSING_REASON,
  MODEL_KEY_HEADER,
  MODEL_SLOTS_HEADER,
  NO_FREE_SLOT_REASON,
  decodeModelKeyHeader,
  exportSlotDecision,
  isModelKey,
  modelSlots,
  slotsHeaderValue,
} from '../export/exportSlots'
import {FREE_PRIVATE_MODEL_LIMIT, isCountedByRouteKind} from '../quota/limits'
import {isProSubscriptionStatus} from '../quota/proStatus'
import {isLocalFileMeteringEnabled, pruneLoads} from '../quota/quota'
import apiHandlersGithub from './api-handlers-github'
import apiHandlersOpenrouter from './api-handlers-openrouter'


/**
 * Initialize API handlers, including Google Analytics and GitHub.
 *
 * @param {object} defines - Configuration defines
 * @return {Array<object>} handlers
 */
export function initHandlers(defines) {
  const handlers = []
  handlers.push(...prohibitProdAccess())
  handlers.push(...workersAndWasmPassthrough())
  handlers.push(...iconAndFontHandlers())
  handlers.push(...apiHandlersGithub(defines, true))
  handlers.push(...apiHandlersGithub(defines, false))
  handlers.push(...netlifyHandlers())
  handlers.push(...subscribePageHandler())
  handlers.push(...stripePortalHandlers())
  handlers.push(...gaHandlers())
  handlers.push(...adSenseHandlers())
  handlers.push(...apiHandlersOpenrouter(defines))
  handlers.push(...googleApisHandlers())
  // Pass through paths that are served by static assets or playwright fixtures
  handlers.push(http.get('/share/v/p/*', () => passthrough()))
  handlers.push(http.get('/share/v/gh/*', () => passthrough()))
  // The SPA dereferences GitHub-hosted files via the Contents API and then
  // fetches the resulting download_url directly. Let those reach playwright's
  // page.route layer (or the real CDN in dev) instead of being warned about
  // as unhandled.
  handlers.push(http.get('https://raw.githubusercontent.com/*', () => passthrough()))
  handlers.push(http.get('https://media.githubusercontent.com/*', () => passthrough()))
  handlers.push(...installEsbuildHotReloadHandler())
  return handlers
}


/**
 * Detect and error on absolute refs to prod.
 *
 * @return {Array<object>} handlers
 */
function prohibitProdAccess() {
  return [
    http.get('http://bldrs.ai/*', ({request}) => {
      console.error('Found absolute ref to prod:', request.url)
      return new Response('', {
        status: HTTP_BAD_REQUEST,
        headers: {'Content-Type': 'text/plain'},
      })
    }),
  ]
}


/**
 * Passthru for expected icons and fonts, null route prod static icon requests.
 *
 * @return {Array<object>} handlers
 */
function iconAndFontHandlers() {
  return [
    // Icons
    http.get(/\/favicon\.ico$/, () => passthrough()),
    http.get(/\/icons/, () => passthrough()),
    http.get(/\/roboto-*/, () => passthrough()),
    http.get('http://bldrs.ai/icons/*', () => {
      return new Response('', {
        status: HTTP_BAD_REQUEST,
        headers: {'Content-Type': 'text/plain'},
      })
    }),
    http.get(/\/favicon\.ico$/, () => {
      return new Response('', {
        status: HTTP_OK,
        headers: {'Content-Type': 'image/x-icon'},
      })
    }),
  ]
}


/**
 * Let requests for web workers, wasm and related files to passthrough.
 *
 * @return {Array<object>} handlers
 */
function workersAndWasmPassthrough() {
  return [
    // Caching + OPFS
    http.get(/\/Cache\.js$/, () => passthrough()),
    http.get(/\/OPFS\.worker\.js$/, () => passthrough()),
    // Conway
    http.get(/ConwayGeomWasmWebMT\.wasm$/i, () => passthrough()),
    http.get(/ConwayGeomWasmWebMT\.js$/i, () => passthrough()),
  ]
}


// The real function's limit, from the one definition (quota/limits.js).
const FREE_LIMIT_MOCK = FREE_PRIVATE_MODEL_LIMIT

// Kept in lock-step with `netlify/functions/pro-module.js`'s allowlist.
const PRO_MODULE_FORMATS_MOCK = new Map([['glbExport', 'glb']])

// Kept in lock-step with `netlify/functions/record-export.js`'s EXPORTS_CAP.
const EXPORTS_CAP_MOCK = 100

// Kept in lock-step with `record-export.js`'s UUID_PATTERN.
const UUID_PATTERN_MOCK = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * The signed-in tier, as the mocks read it: off the store's app_metadata,
 * which is where tests put it (`setAppMetadata`), standing in for the
 * Management API read the real functions make.
 *
 * @return {boolean} whether the store says Pro (either Pro status, §7.2)
 */
function isMockPro() {
  try {
    return isProSubscriptionStatus(window?.store?.getState?.()?.appMetadata?.subscriptionStatus)
  } catch {
    // store not exposed in this test build — treat as not subscribed
    return false
  }
}


/**
 * The mocks' stand-in for Auth0 `app_metadata.exports`: export history, on
 * `window.__mockExports` so a spec can seed or inspect it (reset it between
 * tests — nothing here clears it). Written by the record-export mock. It
 * gates nothing: a free user's exports are decided by model slots, the
 * `window.__mockQuotaLoads` ledger below.
 *
 * @return {Array<object>}
 */
function mockExportLedger() {
  return (typeof window !== 'undefined' && window.__mockExports) || []
}


/** @param {Array<object>} rows the new ledger */
function setMockExportLedger(rows) {
  if (typeof window !== 'undefined') {
    window.__mockExports = rows
  }
}


/**
 * The mocks' stand-in for Auth0 `app_metadata.usageQuota.loads`, the model
 * slots: written by the record-load mock on a private open and by the
 * pro-module mock when an export takes a slot, as the two functions share
 * the one key (src/export/exportSlots.js).
 *
 * @return {Array<object>}
 */
function mockSlotLedger() {
  return (typeof window !== 'undefined' && window.__mockQuotaLoads) || []
}


/** @param {Array<object>} loads the new slot ledger */
function setMockSlotLedger(loads) {
  if (typeof window !== 'undefined') {
    window.__mockQuotaLoads = loads
  }
}


/**
 * @param {number} status
 * @param {object} body
 * @param {object} [headers]
 * @return {Response}
 */
function jsonMockResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', ...headers}})
}


/**
 * Handlers for Netlify functions
 *
 * @return {Array<object>} handlers
 */
function netlifyHandlers() {
  return [
    http.post('/.netlify/functions/create-portal-session', ({request}) => {
      // Real handler derives the Stripe customer server-side from the bearer
      // token; mock asserts the contract by requiring the Authorization
      // header rather than trusting a body field.
      const auth = request.headers.get('authorization') || ''
      if (!/^Bearer\s+.+/i.test(auth)) {
        return new Response(
          JSON.stringify({error: 'Missing Authorization'}),
          {
            status: HTTP_AUTHORIZATION_REQUIRED,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }

      const fakeUrl = 'https://stripe.portal.msw/mockportal/session/cus_test_mock'
      return new Response(
        JSON.stringify({url: fakeUrl}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    http.post('/.netlify/functions/record-load', async ({request}) => {
      // Tests can flip window.__mockQuotaForce5xx to exercise the
      // fallback-to-OPFS path. Reset between tests.
      if (typeof window !== 'undefined' && window.__mockQuotaForce5xx) {
        return new Response('', {status: HTTP_INTERNAL_SERVER_ERROR})
      }

      const auth = request.headers.get('authorization') || ''
      if (!/^Bearer\s+.+/i.test(auth)) {
        return new Response(
          JSON.stringify({error: 'Missing Authorization'}),
          {status: HTTP_AUTHORIZATION_REQUIRED, headers: {'Content-Type': 'application/json'}},
        )
      }

      const body = await request.json().catch(() => ({}))
      const key = body && typeof body.key === 'string' ? body.key : null
      if (!key) {
        return new Response(
          JSON.stringify({error: 'Missing key'}),
          {status: HTTP_BAD_REQUEST, headers: {'Content-Type': 'application/json'},
          })
      }

      // Tier from the Zustand store (mirrors what the real function reads
      // from Auth0 app_metadata; tests inject metadata via setAppMetadata).
      // Either Pro status, like the real function (src/quota/proStatus.js).
      const tier = isMockPro() ? 'paid' : 'free'

      // Quotability — same path classification as the real handler: by the
      // route kind, the segment after the FIRST `/v/`, through the shared
      // rule. Local files count only with `meterLocalFiles` on (Share#1966);
      // the real function also takes METER_LOCAL_FILES, which a browser mock
      // has no equivalent of, so the flag stands in for both. Drive keys
      // count as sent: the client only sends the ones it found private.
      const routeKind = (/\/v\/([^/?#]+)/.exec(key) || [])[1]
      const isLocallyQuotable = isCountedByRouteKind(routeKind, isLocalFileMeteringEnabled())
      const ghMatch = routeKind === 'gh' && key.match(/\/v\/gh\/([^/]+)\/([^/]+)\//)
      let quotable = isLocallyQuotable
      if (ghMatch) {
        // Heuristic: repo names containing "Public" (matching our sample
        // models like Momentum-Public) are treated as public; everything
        // else under /v/gh/ is private.
        const repoName = ghMatch[2]
        const isPublic = /Public/i.test(repoName)
        quotable = !isPublic
      }

      if (typeof window !== 'undefined') {
        window.__mockQuotaLoads = window.__mockQuotaLoads || []
      }
      // Pruned to the rolling window before counting, as the real function
      // does (limits.js#loadsInsideRollingWindow, which pruneLoads wraps): a
      // spec can seed a row older than ROLLING_WINDOW_DAYS and watch it stop
      // counting. The ledger is written back pruned only when a new load is
      // recorded, also as the real function does.
      const loads = pruneLoads((typeof window !== 'undefined' && window.__mockQuotaLoads) || [])
      const limit = tier === 'paid' ? null : FREE_LIMIT_MOCK

      if (tier === 'paid') {
        return new Response(
          JSON.stringify({allowed: true, used: loads.length, limit, tier, alreadyCounted: false}),
          {status: HTTP_OK, headers: {'Content-Type': 'application/json'}},
        )
      }

      if (!quotable) {
        return new Response(
          JSON.stringify({allowed: true, used: loads.length, limit, tier, alreadyCounted: false}),
          {status: HTTP_OK, headers: {'Content-Type': 'application/json'}},
        )
      }

      if (loads.some((l) => l.key === key)) {
        return new Response(
          JSON.stringify({allowed: true, used: loads.length, limit, tier, alreadyCounted: true, loads}),
          {status: HTTP_OK, headers: {'Content-Type': 'application/json'}},
        )
      }

      if (loads.length >= FREE_LIMIT_MOCK) {
        return new Response(
          JSON.stringify({allowed: false, used: loads.length, limit, tier, alreadyCounted: false, loads}),
          {status: HTTP_FORBIDDEN, headers: {'Content-Type': 'application/json'}},
        )
      }

      const newLoads = [...loads, {key, loadedAt: new Date().toISOString()}]
      if (typeof window !== 'undefined') {
        window.__mockQuotaLoads = newLoads
      }
      return new Response(
        JSON.stringify({allowed: true, used: newLoads.length, limit, tier, alreadyCounted: false, loads: newLoads}),
        {status: HTTP_OK, headers: {'Content-Type': 'application/json'}},
      )
    }),

    // Export history and the free tier's model slots
    // (design/new/glb-export-premium.md §4.5, §4.8). Like the pro-module mock
    // below, this stands in for the function in dev and Playwright: same
    // 401/403 bodies as `record-export.js`, the tier read off the store the
    // way the record-load mock reads it, history on `window.__mockExports`
    // and slots on `window.__mockQuotaLoads`. A free user's export of a model
    // holding no slot is refused.
    http.post('/.netlify/functions/record-export', async ({request}) => {
      const auth = request.headers.get('authorization') || ''
      if (!/^Bearer\s+.+/i.test(auth)) {
        return jsonMockResponse(HTTP_AUTHORIZATION_REQUIRED, {error: 'missing_auth0_token'})
      }

      const body = await request.json().catch(() => ({}))
      const {id, key, format, bytes, title} = body || {}
      if (typeof key !== 'string' || key.length === 0 ||
          typeof format !== 'string' || format.length === 0 ||
          !Number.isInteger(bytes) || bytes < 0) {
        return jsonMockResponse(HTTP_BAD_REQUEST, {error: 'invalid_request'})
      }
      // Same id contract as the function: a well-formed client id is echoed
      // on the stored row (that shared id is what the client's mirror merge
      // matches on), a malformed one is a 400, and an absent one is minted
      // here.
      if (id !== undefined && id !== null && (typeof id !== 'string' || !UUID_PATTERN_MOCK.test(id))) {
        return jsonMockResponse(HTTP_BAD_REQUEST, {error: 'invalid_id'})
      }

      const existing = mockExportLedger()
      // A free user's export must name a model holding a slot, as in the
      // function: the pro-module mock takes one before it serves.
      const slots = isMockPro() ? null : modelSlots(mockSlotLedger())
      if (slots && !slots.keys.includes(key)) {
        return jsonMockResponse(HTTP_FORBIDDEN, {error: EXPORT_SLOT_MISSING_REASON, modelSlots: slots})
      }

      const newExports = [
        {
          id: id || `mock-export-${existing.length}-${Date.now()}`,
          key,
          title: title || null,
          format,
          bytes,
          exportedAt: new Date().toISOString(),
        },
        ...existing,
      ].slice(0, EXPORTS_CAP_MOCK)
      setMockExportLedger(newExports)
      return jsonMockResponse(HTTP_OK, slots ? {exports: newExports, modelSlots: slots} : {exports: newExports})
    }),

    // The slots the Export tab shows a free user (`useExportSlots`).
    http.get('/.netlify/functions/record-export', ({request}) => {
      const auth = request.headers.get('authorization') || ''
      if (!/^Bearer\s+.+/i.test(auth)) {
        return jsonMockResponse(HTTP_AUTHORIZATION_REQUIRED, {error: 'missing_auth0_token'})
      }
      return jsonMockResponse(HTTP_OK, isMockPro() ?
        {tier: 'paid', modelSlots: null} :
        {tier: 'free', modelSlots: modelSlots(mockSlotLedger())})
    }),

    // The dev copy the handler below proxies to. Declared so the built
    // module reaches the page as a plain static file instead of being
    // reported as an unhandled request.
    http.get('/__pro_dev__/*', () => passthrough()),

    // Pro-module delivery (design/new/glb-export-premium.md §4.2, §4.8).
    // Neither dev nor Playwright runs a real Netlify function, so this mock
    // IS the gate in those builds: same 401/403 shape as `pro-module.js`,
    // tier read off the store exactly as the record-load mock above does,
    // the free tier decided by model slots on `window.__mockQuotaLoads` the
    // way the function decides by `app_metadata.usageQuota.loads` (same
    // decision, same header, same slots-full body), and the module bytes
    // proxied from the
    // `docs/__pro_dev__/` copy the dev and playwright builds emit (never the
    // prod build — see tools/esbuild/proModules.js).
    http.get('/.netlify/functions/pro-module', async ({request}) => {
      const auth = request.headers.get('authorization') || ''
      if (!/^Bearer\s+.+/i.test(auth)) {
        return new Response(
          JSON.stringify({error: 'missing_auth0_token'}),
          {status: HTTP_AUTHORIZATION_REQUIRED, headers: {'Content-Type': 'application/json'}},
        )
      }

      const name = new URL(request.url).searchParams.get('name') || ''
      if (!PRO_MODULE_FORMATS_MOCK.has(name)) {
        return jsonMockResponse(HTTP_NOT_FOUND, {error: 'unknown_module'})
      }

      const isFreeTier = !isMockPro()
      let decision = null
      if (isFreeTier) {
        const modelKey = decodeModelKeyHeader(request.headers.get(MODEL_KEY_HEADER))
        if (modelKey === null) {
          return jsonMockResponse(HTTP_BAD_REQUEST, {error: 'missing_model_key'})
        }
        if (!isModelKey(modelKey)) {
          return jsonMockResponse(HTTP_BAD_REQUEST, {error: 'invalid_model_key'})
        }
        decision = exportSlotDecision(mockSlotLedger(), modelKey)
        if (decision.verdict === 'full') {
          return jsonMockResponse(HTTP_FORBIDDEN, {error: NO_FREE_SLOT_REASON, modelSlots: decision.slots})
        }
      }

      // Read before taking a slot, as the function does: a missing build
      // must not cost a free user a slot.
      const built = await fetch(`/__pro_dev__/${name}.js`)
      if (!built.ok) {
        return jsonMockResponse(HTTP_NOT_FOUND, {error: 'module_not_built'})
      }
      const headers = {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      }
      if (isFreeTier) {
        if (decision.verdict === 'take') {
          setMockSlotLedger(decision.loads)
        }
        headers[MODEL_SLOTS_HEADER] = slotsHeaderValue(decision.slots, decision.verdict === 'take')
      }
      return new Response(await built.text(), {status: HTTP_OK, headers})
    }),
  ]
}

/**
 * Mock out the “/subscribe” page itself.
 *
 * @return {Array<object>} handlers
 */
function subscribePageHandler() {
  return [
    // this will catch GET /subscribe, /subscribe/, or /subscribe?foo=bar
    http.get('/subscribe*', () => {
      return new Response(`
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8">
              <title>Mock Subscribe Page</title>
            </head>
            <body>
              <h1>Mock Subscribe Page</h1>
              <p>Mock Stripe UI.</p>
              <button id="start-payment">Start Payment</button>
            </body>
          </html>
        `.trim(), {
        status: HTTP_OK,
        headers: {'Content-Type': 'text/html'},
      })
    }),
  ]
}


/**
 * Catch the client navigating to the fake Stripe portal page.
 *
 * @return {Array<object>} handlers
 */
function stripePortalHandlers() {
  return [
    http.get('https://stripe.portal.msw/mockportal/session/:stripeCustomerId', () => {
      return new Response('<html><body><h1>Mock Stripe Portal</h1></body></html>', {
        status: HTTP_OK,
        headers: {'Content-Type': 'text/html'},
      })
    }),
  ]
}


/**
 * Mock to disable Google Analytics.
 *
 * @return {Array<object>} handlers
 */
function gaHandlers() {
  return [
    http.get('https://*.google-analytics.com/*', () => {
      return new Response(
        JSON.stringify({}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),

    http.post('https://*.google-analytics.com/*', () => {
      return new Response(null, {
        status: HTTP_OK,
      })
    }),

    http.get('https://*.googletagmanager.com/*', () => {
      return new Response(
        JSON.stringify({}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),
  ]
}


/**
 * Mock to absorb AdSense traffic so no live requests escape tests.
 *
 * Both hosts must be intercepted: `googlesyndication.com` serves
 * `adsbygoogle.js`, and once loaded the script chains follow-up requests to
 * `doubleclick.net` for impression / measurement. Intercepting only
 * googlesyndication would still leak doubleclick.
 *
 * See design/new/ads.md §"Test hermeticity" for why these hosts are not on
 * the Playwright REAL_NETWORK_HOST_DENYLIST.
 *
 * @return {Array<object>} handlers
 */
function adSenseHandlers() {
  return [
    http.get('https://*.googlesyndication.com/*', () => {
      return new Response('', {
        status: HTTP_OK,
        headers: {'Content-Type': 'application/javascript'},
      })
    }),

    http.get('https://*.doubleclick.net/*', () => {
      return new Response(null, {status: HTTP_OK})
    }),
  ]
}


/**
 * Google APIs handlers
 *
 * @return {Array<object>} handlers
 */
function googleApisHandlers() {
  return [
    http.get('https://*.googleapis.com/*', () => {
      return new Response(
        JSON.stringify({}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
      )
    }),
    http.post('https://*.googleapis.com/*', () => {
      return new Response(null, {
        status: HTTP_OK,
      })
    }),
  ]
}


/**
 * Passthru for esbuild hot-reload plugin
 *
 * @return {Array<object>} handlers
 */
function installEsbuildHotReloadHandler() {
  const ESBUILD_WATCH = (typeof process !== 'undefined' && process.env?.ESBUILD_WATCH)
  if (ESBUILD_WATCH) {
    return [
      http.get(/\/esbuild/, () => passthrough()),
    ]
  } else {
    // Not enabled in cypress
    return []
  }
}
