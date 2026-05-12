import {http, passthrough} from 'msw'
import {
  HTTP_AUTHORIZATION_REQUIRED,
  HTTP_BAD_REQUEST,
  HTTP_FORBIDDEN,
  HTTP_INTERNAL_SERVER_ERROR,
  HTTP_OK,
} from '../net/http'
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


const FREE_LIMIT_MOCK = 4

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
      let tier = 'free'
      try {
        const subscriptionStatus =
          window?.store?.getState?.()?.appMetadata?.subscriptionStatus
        if (subscriptionStatus === 'sharePro') {
          tier = 'paid'
        }
      } catch {
        // store not exposed in this test build — default to free
      }

      // Quotability — same path classification as the real handler.
      const isLocallyQuotable = key.includes('/v/new/') || key.includes('/v/g/')
      const ghMatch = key.match(/\/v\/gh\/([^/]+)\/([^/]+)\//)
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
      const loads = (typeof window !== 'undefined' && window.__mockQuotaLoads) || []
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
