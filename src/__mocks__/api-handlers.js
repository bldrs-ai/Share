import {http, passthrough} from 'msw'
import {
  HTTP_BAD_REQUEST,
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
  handlers.push(http.get('https://rawgit.bldrs.dev/model/*', () => passthrough()))
  handlers.push(http.get('https://rawgit.bldrs.dev/r/*', () => passthrough()))
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
    http.get(/\/OPFS\.Worker\.js$/, () => passthrough()),
    // Conway
    http.get(/ConwayGeomWasmWebMT\.wasm$/i, () => passthrough()),
    http.get(/ConwayGeomWasmWebMT\.js$/i, () => passthrough()),
  ]
}


/**
 * Handlers for Netlify functions
 *
 * @return {Array<object>} handlers
 */
function netlifyHandlers() {
  return [
    http.post('/.netlify/functions/create-portal-session', async ({request}) => {
      const {stripeCustomerId} = await request.json()

      if (!stripeCustomerId) {
        return new Response(
          JSON.stringify({error: 'Missing stripeCustomerId'}),
          {
            status: HTTP_BAD_REQUEST,
            headers: {'Content-Type': 'application/json'},
          },
        )
      }

      // return a mocked Stripe billing-portal URL
      const fakeUrl = `https://stripe.portal.msw/mockportal/session/${stripeCustomerId}`
      return new Response(
        JSON.stringify({url: fakeUrl}),
        {
          status: HTTP_OK,
          headers: {'Content-Type': 'application/json'},
        },
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
